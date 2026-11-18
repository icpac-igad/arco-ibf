'use client';

import React, { useEffect, useRef, useState } from 'react';
import { usePipelineStore } from 'app/store/providers/pipeline';
import { fetchDroughtBnDag } from 'app/lib/api/emdat';
import { BNDagDrought, BN_DROUGHT_PARENTS } from 'app/components/mdx/event-components';
import {
  DagModal, EMPTY_PROMPT, LegacyBnGuide, NetworkDisclosure, PanelHeader, PanelState,
} from './DagModal';
import { LegacyBnAnswer, LegacyBnSummary, fmtIsoDay } from './BoundaryDagPanel';

/**
 * BoundaryDagPanelDrought
 *
 * Drought analogue of BoundaryDagPanel. Active when `hazard === 'drought'`
 * and the user is past the risk-knowledge stage. Fetches the 4-parent
 * post-CDI DAG once per init-month from /api/drought-bn-dag/{init},
 * caches all 227 boundaries in state, and renders <BNDagDrought> for the
 * boundary the user clicked on the map.
 *
 * The init-month is derived from `selectedMonth`: drought monthly cells
 * set selectedMonth to YYYY-MM, but if a flood-style YYYY-MM-DD ever leaks
 * in we slice off the day so the API call still resolves to a valid init.
 */
export function BoundaryDagPanelDrought({ expandable }: { expandable?: boolean } = {}) {
  const { selectedMonth, selectedBoundary, hazard, stage } = usePipelineStore();
  const [dagCache, setDagCache] = useState<Record<string, Record<string, unknown>>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const lastFetchedInit = useRef<string | null>(null);

  const isIbfDrought = hazard === 'drought' && stage === 'risk-monitoring';

  // Normalise selectedMonth → YYYY-MM init key.
  const init = (() => {
    if (!selectedMonth) return null;
    if (/^\d{4}-\d{2}$/.test(selectedMonth)) return selectedMonth;
    if (/^\d{4}-\d{2}-\d{2}$/.test(selectedMonth)) return selectedMonth.slice(0, 7);
    return null;
  })();

  // Fetch the full drought-bn-dag JSON once per init-month (all 227 boundaries)
  useEffect(() => {
    if (!isIbfDrought) return;
    if (!init) return;
    if (lastFetchedInit.current === init) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchDroughtBnDag(init)
      .then((data) => {
        if (cancelled) return;
        setDagCache((prev) => ({
          ...prev,
          [init]: data as Record<string, Record<string, unknown>>,
        }));
        lastFetchedInit.current = init;
      })
      .catch((err) => {
        if (!cancelled) setError(`Could not load drought BN DAG for ${init}`);
        console.error('Drought BN DAG fetch error', err);
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [isIbfDrought, init]);

  if (!isIbfDrought) return null;

  const initData = init ? dagCache[init] : undefined;
  const boundaryData = (selectedBoundary && initData ? initData[selectedBoundary] : null) as
    | Record<string, unknown>
    | null;
  const placeName = boundaryData
    ? String((boundaryData as { boundary?: string }).boundary ?? selectedBoundary)
    : selectedBoundary;
  const initStr = (boundaryData as { init?: string } | null)?.init ?? init;
  const dagEl = (fit = false, legend = true) =>
    boundaryData ? (
      <BNDagDrought dataJson={JSON.stringify(boundaryData)} fit={fit} showHeader={false}
        showLegend={legend} />
    ) : null;

  return (
    <div className='card ds-card ev-panel'>
      <PanelHeader
        eyebrow='Drought risk — monthly Bayesian network (post-CDI)'
        title={placeName ?? 'No region selected'}
        busy={loading}
        badges={
          initStr ? (
            <>
              <span className='ds-badge ds-badge--accent'>Init {fmtIsoDay(initStr)}</span>
              <span className='ds-badge'>Monthly</span>
            </>
          ) : undefined
        }
      />

      {error && !initData ? (
        <PanelState kind='error' title='The network could not be loaded'>{error}</PanelState>
      ) : boundaryData ? (
        <>
          <LegacyBnSummary
            parents={BN_DROUGHT_PARENTS}
            data={boundaryData}
            networkName='monthly drought network'
            ladderNote='post-CDI'
          />
          <NetworkDisclosure
            id='ev-drought-bn-network'
            onEnlarge={expandable ? () => setExpanded(true) : undefined}
          >
            {dagEl()}
          </NetworkDisclosure>
        </>
      ) : !selectedBoundary ? (
        <PanelState kind='empty' title={EMPTY_PROMPT}>
          {init ? null : 'Select an init-month first.'}
        </PanelState>
      ) : loading ? (
        <PanelState kind='loading' title='Fetching drought BN data…' />
      ) : (
        <PanelState kind='empty'
          title={initData
            ? 'No drought BN data for this boundary on the selected init-month.'
            : 'Select an init-month to load drought BN data.'} />
      )}

      {expandable && (
        <DagModal
          open={expanded}
          onClose={() => setExpanded(false)}
          eyebrow={`Drought risk — monthly Bayesian network (post-CDI) · init ${fmtIsoDay(initStr)}`}
          title={`${placeName ?? ''}: how the network reached this decision`}
          answer={boundaryData ? <LegacyBnAnswer data={boundaryData} /> : undefined}
          guide={boundaryData ? <LegacyBnGuide parents={BN_DROUGHT_PARENTS} /> : undefined}
        >
          {(fit: boolean) => dagEl(fit, false)}
        </DagModal>
      )}
    </div>
  );
}
