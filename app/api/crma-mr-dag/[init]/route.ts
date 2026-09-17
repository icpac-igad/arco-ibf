import { NextRequest, NextResponse } from 'next/server';
import { apiFetch } from 'app/lib/api-fetch';

export async function GET(
  request: NextRequest,
  { params }: { params: { init: string } },
) {
  // Unfiltered this is ~976 KB — right for the dashboard, which fetches once
  // and switches windows client-side, and too large for most agent web-fetch
  // tools, which truncate it into something that will not parse. ?boundary=
  // returns the one basin that unit inherits from, across all five windows.
  const qs = new URLSearchParams();
  for (const key of ['boundary', 'basin']) {
    const v = request.nextUrl.searchParams.get(key);
    if (v) qs.set(key, v);
  }
  const query = qs.toString();

  const res = await apiFetch(
    `/api/crma-mr-dag/${encodeURIComponent(params.init)}${query ? `?${query}` : ''}`,
  );
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
