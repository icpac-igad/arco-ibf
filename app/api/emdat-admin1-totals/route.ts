import { NextRequest, NextResponse } from 'next/server';
import { apiFetch } from 'app/lib/api-fetch';

// All-period EM-DAT disaster counts per admin-1 (Risk Knowledge "all disasters").
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const type = p.get('type');
  if (type !== 'flood' && type !== 'drought') {
    return NextResponse.json({ error: 'type must be flood or drought' }, { status: 400 });
  }
  const q = new URLSearchParams({ type });
  for (const k of ['start_year', 'end_year']) {
    const v = p.get(k);
    if (v && /^\d{4}$/.test(v)) q.set(k, v);
  }
  const res = await apiFetch(`/api/emdat-admin1-totals?${q.toString()}`);
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
