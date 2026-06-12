import { NextResponse } from 'next/server';
import { apiFetch } from 'app/lib/api-fetch';

export const dynamic = 'force-dynamic';

export async function GET() {
  const res = await apiFetch('/api/scenarios');
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
