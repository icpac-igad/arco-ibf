import { NextRequest, NextResponse } from 'next/server';
import { apiFetch } from 'app/lib/api-fetch';

export async function GET(
  _request: NextRequest,
  { params }: { params: { date: string } },
) {
  const res = await apiFetch(`/api/bn-dag/${encodeURIComponent(params.date)}`);
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
