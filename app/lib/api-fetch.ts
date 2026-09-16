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
let _tokenExpiresAt = 0;          // absolute, from the token's own `exp` claim

/**
 * Refresh this long before the token actually expires. Covers clock skew and
 * a slow request that starts valid and arrives expired.
 */
const TOKEN_SKEW_MS = 5 * 60 * 1000;

/**
 * Fallback lifetime, used only if `exp` cannot be read. Deliberately short:
 * an unreadable token is the case where guessing a long life caused the
 * outage this function is written to prevent.
 */
const TOKEN_FALLBACK_MS = 10 * 60 * 1000;

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
async function getIdentityToken(force = false): Promise<string | null> {
  const now = Date.now();
  // Cache against the token's OWN expiry, never against how long ago we asked
  // for it. The metadata server hands back a token it minted earlier and keeps
  // returning it until shortly before it dies, so "fetched 0 seconds ago" says
  // nothing about how long it stays valid. Caching a re-fetch for a fixed
  // window from the fetch time is what broke this in production: the container
  // served fine for the first ~55 minutes after a deploy, then picked up a
  // token with minutes left on it, cached that for another 55, and answered
  // every request with a dead token from then on — HTTP 401 at the API,
  // surfacing as an opaque 500 in the browser.
  if (!force && _cachedToken && now < _tokenExpiresAt) {
    return _cachedToken;
  }

  try {
    // NOTE: do NOT use &format=full. Cloud Run service-to-service auth expects
    // a *standard* identity token; the full-format token (extra GCE claims) is
    // rejected by the receiving service as "could not be verified" → 401.
    const metadataUrl =
      `http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity` +
      `?audience=${encodeURIComponent(API_URL)}`;

    const res = await fetch(metadataUrl, {
      headers: { 'Metadata-Flavor': 'Google' },
      // Short timeout — if metadata server isn't available we fail fast
      signal: AbortSignal.timeout(3000),
    });

    // A failed refresh must not leave the previous token in place: it is the
    // one we already decided was too old to use.
    if (!res.ok) { _cachedToken = null; _tokenExpiresAt = 0; return null; }
    const token = (await res.text()).trim();
    if (!token) { _cachedToken = null; _tokenExpiresAt = 0; return null; }

    const exp = tokenExpiry(token);
    _cachedToken = token;
    _tokenExpiresAt = exp !== null ? exp - TOKEN_SKEW_MS : now + TOKEN_FALLBACK_MS;
    // An already-expired token is worse than none — it produces a 401 the
    // caller cannot distinguish from a permissions problem.
    if (now >= _tokenExpiresAt) { _cachedToken = null; _tokenExpiresAt = 0; return null; }
    return token;
  } catch {
    _cachedToken = null;
    _tokenExpiresAt = 0;
    return null;
  }
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
    return new Response(
      JSON.stringify({ error: 'crma-api identity token unavailable' }),
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
