/**
 * Which dates the medium-range CRMA network covers.
 *
 * Flood risk-monitoring serves two networks, routed by date:
 *
 *   2019-05-05 … 2026-02   the Julia daily BN — 162 dates across ten historical
 *                          event episodes, 227 admin-1 boundaries, 7-node DAG
 *   2024-03-06 … 2026-09-24  the six-node medium-range CRMA — 933 initialisations
 *                          x 5 lead windows, 55 basins, 13-node DAG, four
 *                          seasons (mam, jja, sond, jf) across three years
 *
 * Both stay reachable rather than one replacing the other, because the older
 * feed carries the retrospective library that Scenario Mode's Act II runs on:
 * of twelve flood scenarios only `nairobi_flood_2026` falls inside the
 * medium-range range, so routing everything to the new network would silently
 * empty Act II for the other eleven.
 *
 * A range check is an OVER-approximation now, and deliberately so. The v4 feed
 * covers 933 initialisations over four seasons across three years, which are
 * seasonal blocks with gaps between them — so a date inside MR_RANGE is not
 * guaranteed to be an initialisation. That is handled rather than ignored: the
 * calendar only offers dates the feed returned, and a `crma-mr` endpoint answers
 * 404 for a date it does not hold, which callers treat as "fall back to the
 * legacy feed". Narrowing this to an exact set would mean shipping 933 dates to
 * the client or awaiting the calendar before routing anything.
 *
 * **Adding a season means editing MR_RANGE.** That is the one maintenance cost
 * of a constant over deriving the set from `/api/crma-mr-calendar`. Callers
 * also treat a 404 from a `crma-mr` endpoint as "fall back to the legacy feed",
 * so a stale constant degrades to the old panel rather than to an error.
 */

export const MR_RANGE = {
  start: '2024-03-06',
  /**
   * Informational only — the newest initialisation at the last doc update, for
   * display. `isMrInit` does NOT test it. See the note below.
   */
  end: '2026-10-05',
} as const;

/**
 * There is deliberately no upper bound in the test.
 *
 * The corpus grows by one initialisation a day. A hardcoded end date is
 * therefore not occasionally stale, it is wrong every day after it is written —
 * and it went stale three times in a week (2026-09-24, then 10-01, then 10-05),
 * each time silently routing the newest dates to the legacy daily BN so the
 * freshest forecast in the system was the one the dashboard would not show.
 *
 * An open upper bound is self-correcting because the two things downstream of
 * this predicate already handle a date the feed does not hold: a `crma-mr`
 * endpoint answers 404, which callers treat as "fall back to the legacy feed",
 * and the calendar only offers dates the feed actually returned. So the cost of
 * guessing high is one 404 on a date nobody can click, against the cost of
 * guessing low, which is hiding real data.
 *
 * The lower bound stays, and matters: it is what keeps 2019–2024 on the legacy
 * network, which is the retrospective library Scenario Mode runs on.
 */
export function isMrInit(date?: string | null): boolean {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  // ISO dates compare correctly as strings, so no Date parsing (and no
  // timezone) is involved. Lower bound only — see the note above.
  return date >= MR_RANGE.start;
}
