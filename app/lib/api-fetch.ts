/**
 * Authenticated fetch for server-side calls to crma-api (Cloud Run, private).
 *
 * On Cloud Run (FE container): uses google-auth-library to get an identity token
 * for the target audience (crma-api URL), attaches it as Authorization: Bearer.
 *
 * In local dev (no NEXT_PUBLIC_API_BASE_URL or localhost): plain fetch, no auth.
 */

const API_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? '';

function isLocalDev(): boolean {
  return !API_URL || API_URL.includes('localhost') || API_URL.includes('127.0.0.1');
}

/**
 * Get an identity token for the crma-api audience using google-auth-library.
 * This works automatically on Cloud Run via ADC (Workload Identity / SA metadata).
 */
async function getIdentityToken(): Promise<string | null> {
  try {
    const { GoogleAuth } = await import('google-auth-library');
    const auth = new GoogleAuth();
    const client = await auth.getIdTokenClient(API_URL);
    const headers = await client.getRequestHeaders();
    const authHeader = headers['Authorization'] ?? headers['authorization'] ?? '';
    return authHeader.replace('Bearer ', '') || null;
  } catch {
    return null;
  }
}

/**
 * Fetch from crma-api with an identity token attached (server-side only).
 * Falls back to plain fetch in local dev.
 */
export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const url = `${API_URL}${path}`;

  if (isLocalDev()) {
    return fetch(url, init);
  }

  const token = await getIdentityToken();
  if (!token) {
    // Token fetch failed — attempt plain fetch anyway (will likely 403)
    return fetch(url, init);
  }

  return fetch(url, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${token}`,
    },
  });
}
