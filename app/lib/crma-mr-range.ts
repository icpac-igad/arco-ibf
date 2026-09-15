/**
 * Which dates the medium-range CRMA network covers.
 *
 * Flood risk-monitoring serves two networks, routed by date:
 *
 *   2019-05-05 … 2026-02   the Julia daily BN — 162 dates across ten historical
 *                          event episodes, 227 admin-1 boundaries, 7-node DAG
 *   2026-03-01 … 2026-08-23  the six-node medium-range CRMA — 176 initialisations
 *                          x 5 lead windows, 55 basins, 15-node DAG
 *
 * Both stay reachable rather than one replacing the other, because the older
 * feed carries the retrospective library that Scenario Mode's Act II runs on:
 * of twelve flood scenarios only `nairobi_flood_2026` falls inside the
 * medium-range range, so routing everything to the new network would silently
 * empty Act II for the other eleven.
 *
 * A range check is exact rather than approximate here: the 176 initialisations
 * are contiguous across both seasons (2026-03-01 through 2026-05-31 for MAM and
 * 2026-06-01 through 2026-08-23 for JJA, with no gap at the join). Verified on
 * the exported calendar — 175 day-to-day differences, all of exactly one day.
 *
 * **Adding a season means editing MR_RANGE.** That is the one maintenance cost
 * of a constant over deriving the set from `/api/crma-mr-calendar`. Callers
 * also treat a 404 from a `crma-mr` endpoint as "fall back to the legacy feed",
 * so a stale constant degrades to the old panel rather than to an error.
 */

export const MR_RANGE = { start: '2026-03-01', end: '2026-08-23' } as const;

/** True when `date` (YYYY-MM-DD) is a medium-range initialisation. */
export function isMrInit(date?: string | null): boolean {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  // ISO dates compare correctly as strings, so no Date parsing (and no
  // timezone) is involved.
  return date >= MR_RANGE.start && date <= MR_RANGE.end;
}
