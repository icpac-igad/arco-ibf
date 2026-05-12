import { NextRequest, NextResponse } from 'next/server';
import { apiFetch } from 'app/lib/api-fetch';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest) {
  const res = await apiFetch(`/api/ibf-drought-calendar`);
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
