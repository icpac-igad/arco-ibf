import { NextRequest, NextResponse } from 'next/server';
import { apiFetch } from 'app/lib/api-fetch';

export async function GET(
  _request: NextRequest,
  { params }: { params: { init: string } },
) {
  // The eleven synoptic loci as OBSERVED in the 24 h before the init — NOAA
  // GMGSI brightness and EUMETSAT MTG-0 cloud-motion winds, each a tercile
  // against the same box's own record. SAT_RUNBOOK §3 is the table.
  //
  // No ?basin=/?boundary= forwarding, unlike the dag and evidence proxies: this
  // is per-LOCUS, not per-basin, and a few KB whole, so there is nothing a
  // filter would save and no basin key to filter on.
  //
  // Nothing here enters the belief. It is context for the synoptic panel; the
  // per-basin satellite node already carries `combined: false` in the DAG, and
  // these rows are not even that.
  //
  // Returns 404 for every init until a producer writes
  // crma-mr/satellite/{init}.json — v4-7 emits per-basin satellite states
  // inside the dag/evidence objects but no per-locus artifact.
  const res = await apiFetch(
    `/api/crma-mr-satellite/${encodeURIComponent(params.init)}`,
  );
  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}
