'use client';

import React, { useEffect, useRef, useState } from 'react';
import { usePipelineStore } from 'app/store/providers/pipeline';
import { fetchDroughtBnDag } from 'app/lib/api/emdat';
import { BNDagDrought } from 'app/components/mdx/event-components';

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
export function BoundaryDagPanelDrought() {
  const { selectedMonth, selectedBoundary, hazard, stage } = usePipelineStore();
  const [dagCache, setDagCache] = useState<Record<string, Record<string, unknown>>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastFetchedInit = useRef<string | null>(null);

  const isIbfDrought = hazard === 'drought' && stage !== 'risk-knowledge';

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
  const boundaryData =
    selectedBoundary && initData ? initData[selectedBoundary] : null;

  return (
    <div className='card'>
      <div className='card__header'>
        <div>
          <p className='eyebrow'>Drought BN — Boundary Detail</p>
          <h3>
            {selectedBoundary
              ? boundaryData
                ? (boundaryData as { boundary?: string }).boundary ?? selectedBoundary
                : selectedBoundary
              : 'Click a boundary on the map'}
          </h3>
        </div>
        {loading && <span className='usa-tag usa-tag--warm'>Loading</span>}
        {error && <span className='usa-tag usa-tag--error'>{error}</span>}
      </div>

      {boundaryData ? (
        <BNDagDrought dataJson={JSON.stringify(boundaryData)} />
      ) : (
        <div style={{ padding: '1.5rem', color: '#9ca3af', fontSize: '0.875rem' }}>
          {selectedBoundary
            ? initData
              ? 'No drought BN data for this boundary on the selected init-month.'
              : loading
              ? 'Fetching drought BN data…'
              : 'Select an init-month to load drought BN data.'
            : 'Select an init-month, then click an Admin1 polygon to view its drought BN DAG.'}
        </div>
      )}
    </div>
  );
}
