import { NextRequest, NextResponse } from 'next/server';
import { apiFetch } from 'app/lib/api-fetch';

export async function GET(request: NextRequest) {
  const type = request.nextUrl.searchParams.get('type');
  if (!type) {
    return NextResponse.json({ error: 'Missing type param' }, { status: 400 });
  }

  const res = await apiFetch(`/api/emdat-monthly-risk?type=${type}`);
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
