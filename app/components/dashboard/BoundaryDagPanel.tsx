'use client';

import React, { useEffect, useRef, useState } from 'react';
import { usePipelineStore } from 'app/store/providers/pipeline';
import { fetchBnDag } from 'app/lib/api/emdat';
import { BNDag } from 'app/components/mdx/event-components';
import { DagModal } from './DagModal';

export function BoundaryDagPanel({ expandable }: { expandable?: boolean } = {}) {
  const { selectedMonth, selectedBoundary, hazard, stage } = usePipelineStore();
  const [dagCache, setDagCache] = useState<Record<string, Record<string, unknown>>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const lastFetchedDate = useRef<string | null>(null);

  const isIbfFlood = hazard === 'flood' && stage === 'risk-monitoring';

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

  return (
    <div className='card'>
      <div className='card__header'>
        <div>
          <p className='eyebrow'>Flood BN — Boundary Detail</p>
          <h3>
            {selectedBoundary
              ? boundaryData
                ? (boundaryData as any).boundary
                : selectedBoundary
              : 'Click a boundary on the map'}
          </h3>
        </div>
        {expandable && boundaryData && (
          <button
            type='button'
            className='usa-button usa-button--outline usa-button--small'
            onClick={() => setExpanded(true)}
          >
            Enlarge ⤢
          </button>
        )}
        {loading && <span className='usa-tag usa-tag--warm'>Loading</span>}
        {error && <span className='usa-tag usa-tag--error'>{error}</span>}
      </div>

      {boundaryData ? (
        <div
          onClick={expandable ? () => setExpanded(true) : undefined}
          style={expandable ? { cursor: 'zoom-in' } : undefined}
          title={expandable ? 'Click to enlarge' : undefined}
        >
          <BNDag dataJson={JSON.stringify(boundaryData)} />
        </div>
      ) : (
        <div style={{ padding: '1.5rem', color: '#9ca3af', fontSize: '0.875rem' }}>
          {selectedBoundary
            ? dateData
              ? 'No BN data for this boundary on the selected date.'
              : loading
              ? 'Fetching BN data…'
              : 'Select a date to load BN data.'
            : 'Select a date, then click an Admin1 polygon to view its BN DAG.'}
        </div>
      )}

      {expandable && (
        <DagModal open={expanded} onClose={() => setExpanded(false)} title='Flood BN DAG'>
          {boundaryData && <BNDag dataJson={JSON.stringify(boundaryData)} />}
        </DagModal>
      )}
    </div>
  );
}
