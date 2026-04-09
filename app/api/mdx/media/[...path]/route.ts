import { NextRequest, NextResponse } from 'next/server';
import { apiFetch } from 'app/lib/api-fetch';

/**
 * Proxies media (png/gif/jpg/...) from crma-api → browser, attaching the
 * Cloud Run identity token server-side. MDX files reference assets as
 *   <img src="/api/mdx/media/rm/fl-rm-2026-04/v2_results_peak.png" />
 * which hits this handler, which streams the binary from the API.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { path: string[] } },
) {
  const rel = params.path.map(encodeURIComponent).join('/');
  const res = await apiFetch(`/api/mdx/media/${rel}`);

  if (!res.ok) {
    return new NextResponse(`media fetch failed: ${res.status}`, { status: res.status });
  }

  const contentType = res.headers.get('content-type') ?? 'application/octet-stream';
  const cacheControl = res.headers.get('cache-control') ?? 'public, max-age=3600';
  const body = await res.arrayBuffer();

  return new NextResponse(body, {
    status: 200,
    headers: {
      'content-type': contentType,
      'cache-control': cacheControl,
    },
  });
}
