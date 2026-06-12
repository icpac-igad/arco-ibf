import { NextRequest, NextResponse } from 'next/server';
import { apiFetch } from 'app/lib/api-fetch';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { eventId: string } },
) {
  const debrief = request.nextUrl.searchParams.get('debrief') === 'true';
  const res = await apiFetch(
    `/api/scenarios/${encodeURIComponent(params.eventId)}${debrief ? '?debrief=true' : ''}`,
  );
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
