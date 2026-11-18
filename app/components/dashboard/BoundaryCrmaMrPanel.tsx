'use client';

import React, { useState } from 'react';
import { usePipelineStore } from 'app/store/providers/pipeline';
import { useCrmaMrDag } from 'app/lib/hooks/useCrmaMrDag';
import { CrmaMrDag, crmaRiskColour } from 'app/components/mdx/CrmaMrDag';
import { inkOn } from 'app/components/mdx/event-components';
import { isMrInit } from 'app/lib/crma-mr-range';
import type { CrmaMrWindow } from 'app/types/crma-mr';
import {
  CrmaMrGuide, DagModal, EMPTY_PROMPT, NetworkAnswer, NetworkDisclosure, PanelHeader, PanelState,
} from './DagModal';
import { PromptButton } from './PromptButton';

// ── Layer-1 helpers (presentation only) ─────────────────────────────────────

/** Lead window → days after initialisation (first, last). D1 = the day after. */
const _WIN_DAYS: Record<string, [number, number]> = {
  D1: [1, 1], 'D2-3': [2, 3], 'D4-5': [4, 5], 'D6-7': [6, 7], 'D8-10': [8, 10],
};

/** Date arithmetic in UTC: an ISO init has no time zone, and must not gain one. */
function _addDays(iso: string, n: number): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + n));
}
const _fmt = (d: Date, year = true) =>
  d.toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', ...(year ? { year: 'numeric' } : {}), timeZone: 'UTC',
  });

function _forecastDates(init: string, win: string) {
  const days = _WIN_DAYS[win];
  const issued = _addDays(init, 0);
  if (!days || !issued) return null;
  const a = _addDays(init, days[0])!, b = _addDays(init, days[1])!;
  const target = days[0] === days[1]
    ? _fmt(a)
    : a.getUTCMonth() === b.getUTCMonth()
      ? `${a.getUTCDate()}–${_fmt(b)}`
      : `${_fmt(a, false)} – ${_fmt(b)}`;
  const lead = days[0] === days[1] ? `day ${days[0]}` : `days ${days[0]}–${days[1]}`;
  return { target, issued: _fmt(issued), lead, multi: days[0] !== days[1] };
}

/**
 * Plain glosses for the circulation evidence nodes, used only in the summary
 * sentence. Falls back to the schema label for anything not listed, so a new
 * node still reads correctly. These are atmospheric signals: none of them is
 * soil wetness (that is `antecedent`, which has no share of the signal).
 */
const _EVIDENCE_PLAIN: Record<string, string> = {
  moisture: 'atmospheric moisture',
  transport: 'moisture transport',
  disturbance: 'weather disturbances',
  vertical: 'rising air (vertical motion)',
  convective: 'convective (storm) activity',
};

/**
 * Sharpness in words. Banded on `confidence.rank` (percentile within this
 * initialisation), never on `value`: the definition changed to 1 − H/H_max and
 * absolute levels dropped ~0.17, so a fixed scale reads uniformly low (see
 * `CrmaMrWindowNodes.confidence`). Hence the words are RELATIVE to the other
 * basins in the same forecast — and they describe concentration, not skill.
 */
function _sharpnessWords(rank: number): { word: string; gloss: string } {
  if (rank < 1 / 3) return { word: 'Low', gloss: 'more spread out than most basins in this forecast' };
  if (rank < 2 / 3) return { word: 'Medium', gloss: 'about as concentrated as other basins in this forecast' };
  return { word: 'High', gloss: 'more concentrated than most basins in this forecast' };
}

/** Readable text on the risk colour: shared WCAG-contrast pick (see inkOn). */
const _onColour = inkOn;

const _pct = (v: number, dp = 0) => `${(v * 100).toFixed(dp)}%`;

/**
 * The medium-range CRMA network for the clicked boundary.
 *
 * A sibling of `BoundaryDagPanel` rather than a branch inside it: the two draw
 * different networks with different keys (a date vs an initialisation),
 * different cache shapes, and different renderers. Both are mounted together
 * and self-gate to null, which is the pattern `BoundaryDagPanel` and
 * `BoundaryDagPanelDrought` already use.
 *
 * **The map is admin-1 and the network is basins.** A click gives a `GID_1`;
 * the payload's `admin1` index resolves it to the basin that dominates that
 * unit, and the panel renders *that basin's* network. The unit's share of the
 * basin is stated in the summary card, always — a level-4 basin reaches 211,000 km²,
 * and on 2026-03-01/D1, 166 of 227 units are under 5% of the basin whose state
 * they display. Showing the DAG without the share presents a basin maximum as
 * a location.
 */
export function BoundaryCrmaMrPanel({ expandable }: { expandable?: boolean } = {}) {
  const { selectedMonth, selectedBoundary, selectedWindow, hazard, stage } =
    usePipelineStore();
  const [expanded, setExpanded] = useState(false);
  // Layer 2 (the network) is opened on request — NetworkDisclosure owns that
  // toggle: groups argue over the summary, the facilitator opens the graph
  // for the "why".

  const isMr =
    hazard === 'flood' && stage === 'risk-monitoring' && isMrInit(selectedMonth);
  const init = isMr ? (selectedMonth as string) : null;
  const win = (selectedWindow ?? 'D1') as CrmaMrWindow;

  // One fetch per initialisation. The payload carries all five windows and both
  // geographies (~58 KB gzipped), so changing the lead window re-reads loaded
  // data rather than issuing a request. The request is shared (useCrmaMrDag)
  // with the lead-window maps, which colour from the same payload.
  const { data: dagData, loading, error: dagError } = useCrmaMrDag(init);
  const error = dagError ? `Could not load the CRMA network for ${init}` : null;

  if (!isMr) return null;

  const dag = dagData ?? undefined;
  const unit = selectedBoundary && dag ? dag.admin1?.[selectedBoundary] : undefined;
  const unitWindow = unit?.windows?.[win];
  const topBasin = unitWindow?.top_basin ?? null;
  const basin = topBasin && dag ? dag.basins?.[topBasin] : undefined;
  const share = unitWindow?.top_basin_unit_share;
  const areaShare = unitWindow?.top_basin_area_share;
  const placeName = unit?.name ?? selectedBoundary ?? '';

  const dagEl = (fit = false, legend = true) =>
    dag && basin && topBasin ? (
      <CrmaMrDag
        fit={fit}
        showLegend={legend}
        schema={dag.schema}
        basin={basin}
        window={win}
        basinId={topBasin}
        init={dag.init}
        season={dag.season}
        // The summary card above already states place, basin, dates and
        // window; the graph's own header strip would repeat them.
        showHeader={false}
      />
    ) : null;

  // ── Layer 1: the summary, read straight off the same basin payload the
  // graph draws. Nothing here is computed beyond picking and wording.
  const wn = basin?.windows?.[win] as Record<string, any> | undefined;
  const st = basin?.static as Record<string, any> | undefined;
  const riskState: string | null = wn?.risk?.state ?? null;
  const pHighExt: number | null = wn?.risk?.p_high_extreme ?? null;
  const pHeavy: number | null = wn?.heavy_rain?.p_heavy ?? null;
  const sharp = wn?.confidence as { value: number | null; rank: number } | undefined;
  const dates = dag ? _forecastDates(dag.init, win) : null;

  const evidence = (dag?.schema.nodes ?? [])
    .filter((n) => n.layer === 'evidence')
    .map((n) => ({ spec: n, d: wn?.[n.key] as Record<string, any> | undefined }))
    .filter((e) => typeof e.d?.share === 'number')
    .sort((a, b) => (b.d!.share as number) - (a.d!.share as number));
  const driver = evidence[0];

  // "Not included" comes from the schema's own flag, not from whether there is
  // a reading: a captured fluvial value is still not combined into risk.
  const notCombined = (dag?.schema.nodes ?? []).filter((n) => n.combined === false);

  const riskClr = crmaRiskColour(riskState);
  const antecedent = st?.antecedent as Record<string, any> | undefined;

  const summary =
    dag && basin && topBasin && wn ? (
      <div className='ev-summary'>
        {dates && (
          <p className='ev-summary__date'>
            Forecast for <strong>{dates.target}</strong>{' '}
            <span className='ev-summary__muted'>
              (issued {dates.issued}, lead: {dates.lead})
            </span>
          </p>
        )}

        <div className='ev-summary__risk'>
          <span
            className='ev-riskchip'
            style={{ background: riskClr, color: _onColour(riskClr) }}
          >
            {riskState ?? 'No'} risk
          </span>
          {typeof pHighExt === 'number' && (
            <p className='ev-summary__riskline'>
              Chance of <strong>High or Extreme</strong>: <strong>{_pct(pHighExt)}</strong>.{' '}
              <span className='ev-summary__muted'>
                CRMA applies no threshold to this — compare it with the level your own
                plan acts on.
              </span>
            </p>
          )}
        </div>

        <dl className='ev-facts'>
          {driver && (
            <div>
              <dt>Main driver</dt>
              <dd>
                <strong>
                  {_EVIDENCE_PLAIN[driver.spec.key] ?? driver.spec.label.toLowerCase()}
                </strong>
                {driver.d?.state ? ` (${String(driver.d.state).replace(/_/g, ' ')})` : ''} —{' '}
                <strong>{_pct(driver.d!.share)}</strong> of the heavy-rain signal.
                {typeof pHeavy === 'number' && (
                  <span className='ev-summary__muted'>
                    {' '}Chance of heavy rain: {_pct(pHeavy)}.
                    {evidence.length > 1 && ` The other ${evidence.length - 1} signals add the rest.`}
                  </span>
                )}
              </dd>
            </div>
          )}

          {antecedent?.state && (
            <div>
              <dt>Ground before the forecast</dt>
              <dd>
                <strong>{antecedent.state}</strong>
                {typeof antecedent.mm_7d === 'number' &&
                  ` — ${antecedent.mm_7d.toFixed(0)} mm of rain in the last 7 days`}
                <span className='ev-summary__muted'>
                  {' '}({antecedent.observed ? 'satellite observed' : 'climatological estimate, no observation'})
                </span>
              </dd>
            </div>
          )}

          {sharp && (
            <div>
              <dt>How concentrated the model&rsquo;s belief is</dt>
              <dd>
                <strong>{_sharpnessWords(sharp.rank).word}</strong> —{' '}
                {_sharpnessWords(sharp.rank).gloss}.
                <span className='ev-summary__small'>
                  Sharpness {typeof sharp.value === 'number' ? sharp.value.toFixed(2) : '—'},
                  rank {(sharp.rank * 100).toFixed(0)} of 100 in this forecast. This is how
                  concentrated the belief is, <em>not</em> forecast skill — a sharp forecast
                  can still be wrong. Assessment confidence is not available yet: the
                  rain-to-flood link is expert-judged and unverified.
                </span>
              </dd>
            </div>
          )}

          <div>
            <dt>Not included</dt>
            <dd>
              <ul className='ev-facts__list'>
                {notCombined.map((n) => {
                  const d = wn?.[n.key] as Record<string, any> | undefined;
                  const obs = Boolean(d?.observed);
                  const reading = obs && typeof d?.p_high === 'number'
                    ? `${_pct(d.p_high)} of members over the 2-year flow`
                    : 'no reading for this issue';
                  return (
                    <li key={n.key}>
                      <strong>{n.key === 'fluvial' ? 'River flow (fluvial)' : n.label}</strong>:{' '}
                      {reading} — shown for reference only, not used in the risk level.
                    </li>
                  );
                })}
                <li>No impact estimate (people or assets affected) is available or implied.</li>
              </ul>
            </dd>
          </div>

          {/* Not a footnote. The share is the whole reason this panel can show a
              basin's assessment under an admin-1 unit's name. */}
          <div>
            <dt>Where this comes from</dt>
            <dd>
              {placeName}&rsquo;s risk is taken from the river basin it sits in — the model
              runs on basins, not on counties or other administrative units, so{' '}
              {placeName} did not get its own assessment.{' '}
              {typeof share === 'number' ? (
                <>
                  {placeName} makes up{' '}
                  <strong
                    className={share < 0.05 ? 'ev-warn' : undefined}
                    title='Fraction of this basin that the selected admin-1 unit covers'
                  >
                    {share < 0.05 ? 'only ' : ''}
                    {(share * 100).toFixed(share < 0.1 ? 2 : 1)}%
                  </strong>{' '}
                  of that basin
                  {share < 0.05
                    ? `, so this level describes the basin as a whole, not ${placeName} specifically`
                    : ''}
                  .
                </>
              ) : (
                <>Its share of that basin is unknown.</>
              )}
              {typeof areaShare === 'number' && (
                <> The basin covers {_pct(areaShare)} of {placeName}.</>
              )}
              <span className='ev-summary__small'>
                Basin ID <code>{topBasin}</code>
                {dag.season ? ` · season ${dag.season.toUpperCase()}` : ''} · window {win}
              </span>
            </dd>
          </div>
        </dl>
      </div>
    ) : null;

  return (
    <div className='card ds-card ev-panel'>
      <PanelHeader
        eyebrow='Flood risk outlook — CRMA medium-range'
        title={selectedBoundary ? placeName : 'No region selected'}
        busy={loading}
        badges={
          init ? (
            <>
              <span className='ds-badge ds-badge--accent'>Lead {win}</span>
              {dates && <span className='ds-badge'>Issued {dates.issued}</span>}
              {dag && init && selectedBoundary && (
                <PromptButton target={{ init, window: win, boundary: selectedBoundary, placeName }} />
              )}
            </>
          ) : undefined
        }
      />

      {error && !dag ? (
        <PanelState kind='error' title='The network could not be loaded'>{error}</PanelState>
      ) : summary ? (
        summary
      ) : !selectedBoundary ? (
        <PanelState kind='empty' title={EMPTY_PROMPT}>
          {init ? null : 'Select an initialisation first.'}
        </PanelState>
      ) : loading && !dag ? (
        <PanelState kind='loading' title='Fetching the CRMA network…' />
      ) : (
        <PanelState
          kind='empty'
          title={
            dag
              ? unit
                ? `No basin resolved for this unit at ${win}.`
                : 'This boundary is outside the 227 units the rollup covers.'
              : 'Select an initialisation to load the network.'
          }
        />
      )}

      {dagEl() && (
        <NetworkDisclosure
          id='ev-crma-network'
          onEnlarge={expandable ? () => setExpanded(true) : undefined}
        >
          {dagEl()}
        </NetworkDisclosure>
      )}

      {expandable && (
        <DagModal
          open={expanded}
          onClose={() => setExpanded(false)}
          eyebrow={`Flood risk outlook — CRMA medium-range · basin ${topBasin ?? '—'} · lead ${win}`}
          title={`${placeName}: how the network reached this risk level`}
          answer={riskState ? (
            <NetworkAnswer chip={`${riskState} risk`} colour={riskClr}>
              {dates && <>Forecast for <strong>{dates.target}</strong> (issued {dates.issued}). </>}
              {typeof pHighExt === 'number' && (
                <>Chance of <strong>High or Extreme</strong>: <strong>{_pct(pHighExt)}</strong>. </>
              )}
              {typeof share === 'number' && share < 0.05 && (
                <>Describes the whole river basin, not {placeName} specifically.</>
              )}
            </NetworkAnswer>
          ) : undefined}
          guide={dag && basin ? <CrmaMrGuide schema={dag.schema} basin={basin} window={win} /> : undefined}
        >
          {(fit: boolean) => dagEl(fit, false)}
        </DagModal>
      )}
    </div>
  );
}
