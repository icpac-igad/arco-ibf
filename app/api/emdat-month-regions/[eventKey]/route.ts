import { NextRequest, NextResponse } from 'next/server';
import { apiFetch } from 'app/lib/api-fetch';

export async function GET(
  _request: NextRequest,
  { params }: { params: { eventKey: string } },
) {
  const res = await apiFetch(`/api/emdat-month-regions/${params.eventKey}`);
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
