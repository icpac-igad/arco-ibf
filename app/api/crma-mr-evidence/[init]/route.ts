import { NextRequest, NextResponse } from 'next/server';
import { apiFetch } from 'app/lib/api-fetch';

export async function GET(
  request: NextRequest,
  { params }: { params: { init: string } },
) {
  // The evidence graph: the DAG's nodes plus the edges' fitted parameters, the
  // path that moved each basin's belief, and the provenance of every number.
  // EVIDENCE_GRAPH_API_BRIEF.md §3/§4 — a proxy only, no UI consumes it yet.
  //
  // Unfiltered is ~435 KB at phase 1 and ~1-1.5 MB at phase 2. ?basin= or
  // ?boundary= returns ~20 KB, which is the form an LLM is given and the only
  // form inside the brief's 30 KB budget; agent web-fetch tools truncate the
  // unfiltered body into something that will not parse.
  //
  // No `dynamic = 'force-dynamic'` needed: a [param] route is never prerendered,
  // so the build does not call the unreachable sandbox API URL.
  const qs = new URLSearchParams();
  for (const key of ['boundary', 'basin']) {
    const v = request.nextUrl.searchParams.get(key);
    if (v) qs.set(key, v);
  }
  const query = qs.toString();

  const res = await apiFetch(
    `/api/crma-mr-evidence/${encodeURIComponent(params.init)}${query ? `?${query}` : ''}`,
  );
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
