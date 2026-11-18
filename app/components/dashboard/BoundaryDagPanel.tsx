'use client';

import React, { useEffect, useRef, useState } from 'react';
import { usePipelineStore } from 'app/store/providers/pipeline';
import { fetchBnDag } from 'app/lib/api/emdat';
import {
  BNDag,
  BN_CRMA_LADDER,
  BN_FLOOD_PARENTS,
  BN_RISK_BANDS,
  bnCrmaColour,
  inkOn,
  type LegacyBnCrma,
  type LegacyBnNode,
  type LegacyBnParentCfg,
  type LegacyBnRisk,
} from 'app/components/mdx/event-components';
import { isMrInit } from 'app/lib/crma-mr-range';
import {
  DagModal, EMPTY_PROMPT, LegacyBnGuide, NetworkAnswer, NetworkDisclosure, PanelHeader, PanelState,
} from './DagModal';

const _pct = (v: number, dp = 0) => `${(v * 100).toFixed(dp)}%`;
const _fmtState = (s: string | null | undefined) => String(s ?? '—').replace(/_/g, ' ');

/** "2019-05-10" → "10 May 2019"; "2022-03" → "Mar 2022". UTC, no time zone drift. */
export function fmtIsoDay(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(String(iso ?? ''));
  if (!m) return String(iso ?? '');
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, m[3] ? +m[3] : 1));
  return d.toLocaleDateString('en-GB', {
    ...(m[3] ? { day: 'numeric' } : {}), month: 'short', year: 'numeric', timeZone: 'UTC',
  });
}

/**
 * Layer 1 of the legacy daily flood and monthly drought panels: the CRMA
 * decision as a large traffic-light chip, the chance of High/Extreme risk, the
 * most likely risk level, and every input the network saw. Read straight off
 * the bn-dag payload — nothing is computed beyond picking the most likely
 * state of each distribution. The legacy payload carries no per-input share,
 * so the inputs are listed, not ranked: no "main driver" is claimed.
 */
export function LegacyBnSummary({
  parents, data, networkName, ladderNote,
}: {
  parents: LegacyBnParentCfg[];
  data: Record<string, unknown>;
  /** e.g. "daily flood network" — used in the plain-language sentences. */
  networkName: string;
  /** Extra sourced qualifier for the ladder line, e.g. "post-CDI". */
  ladderNote?: string;
}) {
  const crma = data.crma as LegacyBnCrma | undefined;
  const risk = data.risk as LegacyBnRisk | undefined;
  const state = crma?.state ?? null;
  const clr = bnCrmaColour(state);
  const step = state ? (BN_CRMA_LADDER as readonly string[]).indexOf(state) : -1;
  const probs = (risk?.probs ?? []).map((p) => p ?? 0);
  const riskIdx = probs.length ? probs.indexOf(Math.max(...probs)) : -1;

  return (
    <div className='ev-summary'>
      <div className='ev-summary__risk'>
        <span className='ev-riskchip' style={{ background: clr, color: inkOn(clr) }}>
          {_fmtState(state ?? 'No decision')}
        </span>
        <p className='ev-summary__riskline'>
          {typeof crma?.p_he === 'number' && (
            <>
              Chance of <strong>High or Extreme</strong> risk:{' '}
              <strong>{_pct(crma.p_he, 1)}</strong>.{' '}
            </>
          )}
          {risk?.state && (
            <span className='ev-summary__muted'>
              Most likely risk level: <strong>{risk.state}</strong>
              {riskIdx >= 0 && ` (${_pct(probs[riskIdx])})`}.
            </span>
          )}
        </p>
      </div>

      <dl className='ev-facts'>
        <div>
          <dt>What this decision means</dt>
          <dd>
            {step >= 0 ? (
              <>
                Step <strong>{step + 1} of {BN_CRMA_LADDER.length}</strong> on the {networkName}&rsquo;s
                decision ladder:
              </>
            ) : (
              <>The {networkName}&rsquo;s decision ladder:</>
            )}
            <ol className='ev-ladder' aria-label='Decision ladder, lowest to highest'>
              {BN_CRMA_LADDER.map((s, i) => {
                const on = i === step;
                const c = bnCrmaColour(s);
                return (
                  <li key={s} className={on ? 'is-current' : undefined}
                    aria-current={on ? 'step' : undefined}
                    style={on ? { background: c, color: inkOn(c), borderColor: c } : undefined}>
                    {!on && <span className='ds-swatch' style={{ background: c }} aria-hidden='true' />}
                    {_fmtState(s)}
                  </li>
                );
              })}
            </ol>
            <span className='ev-summary__small'>
              A cost–loss decision ladder (CRMA OUTPUT, γ = 0.20){ladderNote ? ` — ${ladderNote}` : ''}.
              Same traffic-light colours as the map.
            </span>
          </dd>
        </div>

        <div>
          <dt>What the network saw</dt>
          <dd>
            <ul className='ev-facts__list'>
              {parents.map((p) => {
                const nd = data[p.key] as LegacyBnNode | undefined;
                const pmax = nd?.probs?.length ? Math.max(...nd.probs) : null;
                return (
                  <li key={p.key}>
                    <strong>{p.title}</strong>: {_fmtState(nd?.state)}
                    {nd?.raw ? <span className='ev-summary__muted'> ({nd.raw})</span> : null}
                    {typeof pmax === 'number' && (
                      <span className='ev-summary__muted'> — {_pct(pmax)} likely</span>
                    )}
                  </li>
                );
              })}
            </ul>
            <span className='ev-summary__small'>
              All {parents.length} inputs feed the risk level together; this network does not
              report how much each one contributed.
            </span>
          </dd>
        </div>

        {probs.length === BN_RISK_BANDS.length && (
          <div>
            <dt>Risk level, all states</dt>
            <dd className='ev-summary__muted'>
              {BN_RISK_BANDS.map((b, i) => (
                <React.Fragment key={b}>
                  {i > 0 && ' · '}
                  {i === riskIdx ? <strong>{b} {_pct(probs[i])}</strong> : `${b} ${_pct(probs[i])}`}
                </React.Fragment>
              ))}
            </dd>
          </div>
        )}
      </dl>
    </div>
  );
}

/**
 * The full-screen dialog's one-line answer for the legacy networks: the CRMA
 * decision chip and the same two numbers the summary card leads with.
 */
export function LegacyBnAnswer({ data }: { data: Record<string, unknown> }) {
  const crma = data.crma as LegacyBnCrma | undefined;
  const risk = data.risk as LegacyBnRisk | undefined;
  const state = crma?.state ?? null;
  return (
    <NetworkAnswer chip={_fmtState(state ?? 'No decision')} colour={bnCrmaColour(state)}>
      {typeof crma?.p_he === 'number' && (
        <>Chance of <strong>High or Extreme</strong> risk: <strong>{_pct(crma.p_he, 1)}</strong>. </>
      )}
      {risk?.state && <>Most likely risk level: <strong>{risk.state}</strong>.</>}
    </NetworkAnswer>
  );
}

export function BoundaryDagPanel({ expandable }: { expandable?: boolean } = {}) {
  const { selectedMonth, selectedBoundary, hazard, stage } = usePipelineStore();
  const [dagCache, setDagCache] = useState<Record<string, Record<string, unknown>>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const lastFetchedDate = useRef<string | null>(null);

  // Flood risk-monitoring is served by two networks, split by date. This panel
  // owns the legacy daily BN; BoundaryCrmaMrPanel owns the medium-range
  // initialisations. See app/lib/crma-mr-range.ts.
  const isIbfFlood =
    hazard === 'flood' && stage === 'risk-monitoring' && !isMrInit(selectedMonth);

  // Fetch the full bn-dag JSON once per date (all 227 boundaries)
  useEffect(() => {
    if (!isIbfFlood) return;
    if (!selectedMonth || !/^\d{4}-\d{2}-\d{2}$/.test(selectedMonth)) return;
    if (lastFetchedDate.current === selectedMonth) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchBnDag(selectedMonth)
      .then((data) => {
        if (cancelled) return;
        setDagCache((prev) => ({ ...prev, [selectedMonth]: data as Record<string, Record<string, unknown>> }));
        lastFetchedDate.current = selectedMonth;
      })
      .catch((err) => {
        if (!cancelled) setError(`Could not load BN DAG for ${selectedMonth}`);
        console.error('BN DAG fetch error', err);
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [isIbfFlood, selectedMonth]);

  if (!isIbfFlood) return null;

  const dateData = selectedMonth ? dagCache[selectedMonth] : undefined;
  const boundaryData = (selectedBoundary && dateData ? dateData[selectedBoundary] : null) as
    | Record<string, unknown>
    | null;
  const placeName = boundaryData
    ? String((boundaryData as { boundary?: string }).boundary ?? selectedBoundary)
    : selectedBoundary;
  const dateStr = (boundaryData as { date?: string } | null)?.date ?? selectedMonth;
  const dagEl = (fit = false, legend = true) =>
    boundaryData ? (
      <BNDag dataJson={JSON.stringify(boundaryData)} fit={fit} showHeader={false}
        showLegend={legend} />
    ) : null;

  return (
    <div className='card ds-card ev-panel'>
      <PanelHeader
        eyebrow='Flood risk — daily Bayesian network'
        title={placeName ?? 'No region selected'}
        busy={loading}
        badges={
          dateStr ? (
            <>
              <span className='ds-badge ds-badge--accent'>{fmtIsoDay(dateStr)}</span>
              <span className='ds-badge'>Daily</span>
            </>
          ) : undefined
        }
      />

      {error && !dateData ? (
        <PanelState kind='error' title='The network could not be loaded'>{error}</PanelState>
      ) : boundaryData ? (
        <>
          <LegacyBnSummary
            parents={BN_FLOOD_PARENTS}
            data={boundaryData}
            networkName='daily flood network'
          />
          <NetworkDisclosure
            id='ev-flood-bn-network'
            onEnlarge={expandable ? () => setExpanded(true) : undefined}
          >
            {dagEl()}
          </NetworkDisclosure>
        </>
      ) : !selectedBoundary ? (
        <PanelState kind='empty' title={EMPTY_PROMPT}>
          {selectedMonth ? null : 'Select a date first.'}
        </PanelState>
      ) : loading ? (
        <PanelState kind='loading' title='Fetching BN data…' />
      ) : (
        <PanelState kind='empty'
          title={dateData ? 'No BN data for this boundary on the selected date.' : 'Select a date to load BN data.'} />
      )}

      {expandable && (
        <DagModal
          open={expanded}
          onClose={() => setExpanded(false)}
          eyebrow={`Flood risk — daily Bayesian network · ${fmtIsoDay(dateStr)}`}
          title={`${placeName ?? ''}: how the network reached this decision`}
          answer={boundaryData ? <LegacyBnAnswer data={boundaryData} /> : undefined}
          guide={boundaryData ? <LegacyBnGuide parents={BN_FLOOD_PARENTS} /> : undefined}
        >
          {(fit: boolean) => dagEl(fit, false)}
        </DagModal>
      )}
    </div>
  );
}
