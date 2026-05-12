import { NextRequest, NextResponse } from 'next/server';
import { apiFetch } from 'app/lib/api-fetch';

export async function GET(
  _request: NextRequest,
  { params }: { params: { init: string } },
) {
  const res = await apiFetch(
    `/api/ibf-drought-regions/${encodeURIComponent(params.init)}`,
  );
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
