'use client';

import React, { useEffect, useRef, useState } from 'react';
import { usePipelineStore } from 'app/store/providers/pipeline';
import { fetchCrmaMrDag } from 'app/lib/api/emdat';
import { CrmaMrDag } from 'app/components/mdx/CrmaMrDag';
import { isMrInit } from 'app/lib/crma-mr-range';
import type { CrmaMrDagResponse, CrmaMrWindow } from 'app/types/crma-mr';
import { DagModal } from './DagModal';

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
 * basin is stated in the header, always — a level-4 basin reaches 211,000 km²,
 * and on 2026-03-01/D1, 166 of 227 units are under 5% of the basin whose state
 * they display. Showing the DAG without the share presents a basin maximum as
 * a location.
 */
export function BoundaryCrmaMrPanel({ expandable }: { expandable?: boolean } = {}) {
  const { selectedMonth, selectedBoundary, selectedWindow, hazard, stage } =
    usePipelineStore();
  const [dagCache, setDagCache] = useState<Record<string, CrmaMrDagResponse>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const lastFetchedInit = useRef<string | null>(null);

  const isMr =
    hazard === 'flood' && stage === 'risk-monitoring' && isMrInit(selectedMonth);
  const init = isMr ? (selectedMonth as string) : null;
  const win = (selectedWindow ?? 'D1') as CrmaMrWindow;

  // One fetch per initialisation. The payload carries all five windows and both
  // geographies (~58 KB gzipped), so changing the lead window re-reads loaded
  // data rather than issuing a request.
  useEffect(() => {
    if (!init) return;
    if (lastFetchedInit.current === init) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchCrmaMrDag(init)
      .then((data) => {
        if (cancelled) return;
        setDagCache((prev) => ({ ...prev, [init]: data }));
        lastFetchedInit.current = init;
      })
      .catch((err) => {
        if (!cancelled) setError(`Could not load the CRMA network for ${init}`);
        console.error('CRMA MR DAG fetch error', err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [init]);

  if (!isMr) return null;

  const dag = init ? dagCache[init] : undefined;
  const unit = selectedBoundary && dag ? dag.admin1?.[selectedBoundary] : undefined;
  const unitWindow = unit?.windows?.[win];
  const topBasin = unitWindow?.top_basin ?? null;
  const basin = topBasin && dag ? dag.basins?.[topBasin] : undefined;
  const share = unitWindow?.top_basin_unit_share;

  const dagEl =
    dag && basin && topBasin ? (
      <CrmaMrDag
        schema={dag.schema}
        basin={basin}
        window={win}
        basinId={topBasin}
        init={dag.init}
        season={dag.season}
      />
    ) : null;

  return (
    <div className='card'>
      <div className='card__header'>
        <div>
          <p className='eyebrow'>CRMA medium-range — {win}</p>
          <h3>
            {selectedBoundary
              ? unit?.name ?? selectedBoundary
              : 'Click a boundary on the map'}
          </h3>
          {/* Not a footnote. The number below is the whole reason this panel
              can show a basin's network under an admin-1 unit's name. */}
          {topBasin && (
            <p className='text-base-dark' style={{ fontSize: '0.8rem', margin: '0.25rem 0 0' }}>
              Inherited from basin <code>{topBasin}</code> —{' '}
              {typeof share === 'number' ? (
                <strong
                  style={{ color: share < 0.05 ? '#b45309' : 'inherit' }}
                  title='Fraction of this basin that the selected admin-1 unit covers'
                >
                  {(share * 100).toFixed(share < 0.1 ? 2 : 1)}% of it
                </strong>
              ) : (
                'share unknown'
              )}
              . The network runs on basins; this unit did not get its own assessment.
            </p>
          )}
        </div>
        {expandable && dagEl && (
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

      {dagEl ? (
        <div
          onClick={expandable ? () => setExpanded(true) : undefined}
          style={expandable ? { cursor: 'zoom-in' } : undefined}
          title={expandable ? 'Click to enlarge' : undefined}
        >
          {dagEl}
        </div>
      ) : (
        <div style={{ padding: '1.5rem', color: '#9ca3af', fontSize: '0.875rem' }}>
          {selectedBoundary
            ? dag
              ? unit
                ? `No basin resolved for this unit at ${win}.`
                : 'This boundary is outside the 227 units the rollup covers.'
              : loading
                ? 'Fetching the CRMA network…'
                : 'Select an initialisation to load the network.'
            : 'Select an initialisation, then click an Admin1 polygon to view its network.'}
        </div>
      )}

      {expandable && (
        <DagModal
          open={expanded}
          onClose={() => setExpanded(false)}
          title={`CRMA medium-range — ${init} · ${win}`}
        >
          {dagEl}
        </DagModal>
      )}
    </div>
  );
}
