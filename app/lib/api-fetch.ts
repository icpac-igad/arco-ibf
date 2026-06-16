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
let _tokenFetchedAt = 0;
const TOKEN_TTL_MS = 55 * 60 * 1000;

function isLocalDev(): boolean {
  return !API_URL || API_URL.includes('localhost') || API_URL.includes('127.0.0.1');
}

/**
 * Fetch an identity token from the GCP metadata server.
 * Audience must match the Cloud Run service URL exactly.
 */
async function getIdentityToken(): Promise<string | null> {
  const now = Date.now();
  if (_cachedToken && now - _tokenFetchedAt < TOKEN_TTL_MS) {
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

    if (!res.ok) return null;
    const token = (await res.text()).trim();
    if (!token) return null;

    _cachedToken = token;
    _tokenFetchedAt = now;
    return token;
  } catch {
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

  return fetch(url, {
    ...init,
    // Never cache proxied API responses: a stale 200 (or a pinned error) must
    // not mask live auth/data state. Also forces every proxy route to be
    // dynamic, so no endpoint is statically optimized at build time.
    cache: 'no-store',
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${token}`,
    },
  });
}
