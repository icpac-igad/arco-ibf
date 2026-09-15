import { NextRequest, NextResponse } from 'next/server';
import { apiFetch } from 'app/lib/api-fetch';

export async function GET(
  _request: NextRequest,
  { params }: { params: { init: string; window: string } },
) {
  // Both segments are encoded. The window values contain a hyphen ("D2-3",
  // "D8-10") which is URL-safe as-is, but encoding means an unknown window
  // reaches the API and comes back as a 400 naming the five valid ones,
  // rather than being mangled into a 404.
  const res = await apiFetch(
    `/api/crma-mr-regions/${encodeURIComponent(params.init)}/${encodeURIComponent(params.window)}`,
  );
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
