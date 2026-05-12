import { NextRequest, NextResponse } from 'next/server';
import { apiFetch } from 'app/lib/api-fetch';

export async function GET(
  _request: NextRequest,
  { params }: { params: { tab: string; filename: string[] } },
) {
  const tab = encodeURIComponent(params.tab);
  const file = params.filename.map(encodeURIComponent).join('/');
  const res = await apiFetch(`/api/mdx/raw/${tab}/${file}`);
  const text = await res.text();
  return new NextResponse(text, {
    status: res.status,
    headers: {
      'content-type':
        res.headers.get('content-type') ?? 'text/plain; charset=utf-8',
    },
  });
}
