import { NextRequest, NextResponse } from 'next/server';
import { apiFetch } from 'app/lib/api-fetch';

// Reads searchParams, so Next would otherwise try to prerender it at build
// time against the unreachable build-sandbox API URL. Same reason as
// ibf-flood-calendar and ibf-drought-calendar.
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  // Forwarded by name rather than passed through wholesale: an unrecognised
  // parameter is a 422 from the API, and a silently dropped one is a lead
  // window the user chose and did not get.
  const qs = new URLSearchParams();
  for (const key of ['season', 'window']) {
    const value = request.nextUrl.searchParams.get(key);
    if (value) qs.set(key, value);
  }
  const query = qs.toString();

  const res = await apiFetch(`/api/crma-mr-calendar${query ? `?${query}` : ''}`);
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
