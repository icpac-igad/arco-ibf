import { NextRequest, NextResponse } from 'next/server';
import { apiFetch } from 'app/lib/api-fetch';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const body = await request.text();
  const res = await apiFetch('/api/scenario-chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
