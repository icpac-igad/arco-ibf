import { NextRequest, NextResponse } from 'next/server';
import { apiFetch } from 'app/lib/api-fetch';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const country = request.nextUrl.searchParams.get('country');
  const qs = country ? `?country=${encodeURIComponent(country)}` : '';
  const res = await apiFetch(`/api/ibf-drought-calendar${qs}`);
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
