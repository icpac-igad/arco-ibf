/**
 * Authenticated fetch for server-side calls to crma-api (Cloud Run, private).
 *
 * On Cloud Run: uses the GCP metadata server to get an identity token for the
 * target audience (crma-api URL). The metadata server is always available at
 * 169.254.169.254 on Cloud Run — no library needed, just a plain HTTP call.
 *
 * In local dev (localhost or no API URL set): plain fetch, no auth.
 */

const API_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? '';

// Cache token with a 55-minute TTL (GCP identity tokens last 1 hour)
let _cachedToken: string | null = null;
let _tokenExp = 0;        // absolute expiry of _cachedToken, ms. 0 = unknown.
let _refreshAt = 0;       // when to START TRYING for a fresh one
let _lastTokenError = 'none';

/** Begin trying for a replacement this long before expiry. */
const REFRESH_SKEW_MS = 5 * 60 * 1000;

/**
 * Below this much remaining, a token is not worth sending — it would very
 * likely arrive expired. Note this is far smaller than REFRESH_SKEW_MS, and
 * the distinction is the whole point: "time to look for a new one" and
 * "too dead to use" are different thresholds. Treating them as one refused
 * a token with four good minutes on it and answered 502 instead.
 */
const MIN_REMAINING_MS = 30 * 1000;

/** Never re-ask the metadata server more often than this. */
const MIN_POLL_MS = 30 * 1000;

/** Used only when `exp` cannot be read at all. */
const FALLBACK_TTL_MS = 10 * 60 * 1000;

/**
 * Seconds-since-epoch `exp` out of a JWT, in ms. No verification and no
 * dependency — the signature is Cloud Run's business, we only need to know
 * when to stop using it.
 */
function tokenExpiry(token: string): number | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const json = Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
      .toString('utf8');
    const exp = JSON.parse(json)?.exp;
    return typeof exp === 'number' ? exp * 1000 : null;
  } catch {
    return null;
  }
}

function isLocalDev(): boolean {
  return !API_URL || API_URL.includes('localhost') || API_URL.includes('127.0.0.1');
}

/**
 * Fetch an identity token from the GCP metadata server.
 * Audience must match the Cloud Run service URL exactly.
 */
async function mintFromMetadata(): Promise<string | null> {
  try {
    // NOTE: do NOT use &format=full. Cloud Run service-to-service auth expects
    // a *standard* identity token; the full-format token (extra GCE claims) is
    // rejected by the receiving service as "could not be verified" → 401.
    const metadataUrl =
      `http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity` +
      `?audience=${encodeURIComponent(API_URL)}`;
    const res = await fetch(metadataUrl, {
      headers: { 'Metadata-Flavor': 'Google' },
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) { _lastTokenError = `metadata server returned ${res.status}`; return null; }
    const token = (await res.text()).trim();
    if (!token) { _lastTokenError = 'metadata server returned an empty body'; return null; }
    return token;
  } catch (e) {
    _lastTokenError = `metadata fetch failed: ${(e as Error)?.name ?? 'error'}`;
    return null;
  }
}

/**
 * An identity token for the API, cached against its own expiry.
 *
 * The metadata server does not mint on demand — it hands back a token it made
 * earlier and keeps returning that same one until close to its expiry. Two
 * consequences shape everything here:
 *
 *   1. Time since WE fetched a token says nothing about how long it stays
 *      valid, so the cache is keyed on the token's own `exp`.
 *   2. A refresh can legitimately return a token with only minutes left. That
 *      token is still good. Refusing it — which an earlier version of this
 *      function did — turns a working service into a 502.
 */
async function getIdentityToken(force = false): Promise<string | null> {
  const now = Date.now();
  const usable = (t: string | null, exp: number) =>
    !!t && (exp === 0 || exp > now + MIN_REMAINING_MS);

  if (!force && usable(_cachedToken, _tokenExp) && now < _refreshAt) return _cachedToken;

  const fresh = await mintFromMetadata();
  if (fresh) {
    const exp = tokenExpiry(fresh);
    if (exp === null || exp > now + MIN_REMAINING_MS) {
      _cachedToken = fresh;
      _tokenExp = exp ?? 0;
      // Clamp, so a token already inside the skew window does not make us ask
      // the metadata server on literally every request.
      _refreshAt = exp !== null
        ? Math.max(now + MIN_POLL_MS, exp - REFRESH_SKEW_MS)
        : now + FALLBACK_TTL_MS;
      _lastTokenError = 'none';
      return fresh;
    }
    _lastTokenError = `metadata returned a token with ${Math.round((exp - now) / 1000)}s left`;
  }

  // The refresh failed, or produced something too short-lived. A token that is
  // still valid — even barely — beats sending no request at all.
  if (usable(_cachedToken, _tokenExp)) {
    _refreshAt = now + MIN_POLL_MS;
    return _cachedToken;
  }
  // Nothing cached and the only thing on offer is nearly dead: send it anyway.
  // If it is rejected, the 401 retry below turns it into a legible error
  // instead of a silent 502.
  if (fresh) {
    _cachedToken = fresh;
    _tokenExp = tokenExpiry(fresh) ?? 0;
    _refreshAt = now + MIN_POLL_MS;
    return fresh;
  }

  _cachedToken = null; _tokenExp = 0; _refreshAt = 0;
  return null;
}

/**
 * Fetch from crma-api with a GCP identity token attached (server-side only).
 * Falls back to plain fetch in local dev.
 */
export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const url = `${API_URL}${path}`;

  if (isLocalDev()) {
    return fetch(url, init);
  }

  const token = await getIdentityToken();
  if (!token) {
    // Fail loud, do NOT send an unauthenticated request. Previously this fell
    // through to a tokenless fetch → the private API answered 401 (HTML), and
    // callers doing res.json() turned that into a misleading 500. Return a
    // clear 502 JSON instead so the failure is diagnosable, not disguised.
    // Carry WHY. The previous body said only "unavailable", which left a
    // production outage needing log archaeology to tell a metadata-server
    // failure apart from a token this function had rejected itself.
    return new Response(
      JSON.stringify({
        error: 'crma-api identity token unavailable',
        reason: _lastTokenError,
        audience: API_URL,
      }),
      { status: 502, headers: { 'content-type': 'application/json' } },
    );
  }

  const send = (bearer: string) =>
    fetch(url, {
      ...init,
      // Never cache proxied API responses: a stale 200 (or a pinned error) must
      // not mask live auth/data state. Also forces every proxy route to be
      // dynamic, so no endpoint is statically optimized at build time.
      cache: 'no-store',
      headers: {
        ...(init?.headers ?? {}),
        Authorization: `Bearer ${bearer}`,
      },
    });

  let res = await send(token);

  // Self-heal a rejected token. 401 means the token could not be verified —
  // expired, almost always — as opposed to 403, which means the identity is
  // fine and the IAM binding is not. Only 401 is worth retrying, and only
  // once: force a fresh mint and try again. Without this, a container that
  // picked up a short-lived token stays broken until it is restarted, which
  // with min-instances=1 means indefinitely.
  if (res.status === 401) {
    const fresh = await getIdentityToken(true);
    if (fresh && fresh !== token) res = await send(fresh);
  }

  return jsonifyUpstreamError(res, url);
}

/**
 * Make a non-JSON error response readable by callers that do `res.json()`.
 *
 * Cloud Run answers an auth failure with an HTML page. Every proxy route here
 * parses JSON, so that page became `SyntaxError: Unexpected token '<'`, which
 * Next turned into a 500 with an empty body — no status, no message, nothing
 * in the browser to act on. The upstream status is the single most useful fact
 * about the failure, so it is preserved and the body is replaced with JSON
 * carrying it.
 *
 * Successful responses are passed through untouched, including the
 * text/plain (MDX) and binary (media) ones that must not be reshaped.
 */
async function jsonifyUpstreamError(res: Response, url: string): Promise<Response> {
  if (res.ok) return res;
  const type = res.headers.get('content-type') ?? '';
  if (type.includes('json')) return res;

  const body = await res.text().catch(() => '');
  const detail =
    res.status === 401
      ? 'crma-api rejected the identity token (401) — expired or wrong audience'
      : res.status === 403
        ? 'crma-api refused the caller (403) — missing roles/run.invoker'
        : `crma-api returned ${res.status}`;
  return new Response(
    JSON.stringify({ error: detail, status: res.status, path: url, body: body.slice(0, 200) }),
    { status: res.status, headers: { 'content-type': 'application/json' } },
  );
}
