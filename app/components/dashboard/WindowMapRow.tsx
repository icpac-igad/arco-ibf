'use client';

import React, { useMemo, useRef } from 'react';
import { usePipelineStore } from 'app/store/providers/pipeline';
import { CRMA_MR_WINDOWS, type CrmaMrWindow, type RiskLevel } from 'app/types/crma-mr';
import type { EmdatRegionDatum } from 'app/types/emdat';
import { isMrInit } from 'app/lib/crma-mr-range';
import { useCrmaMrDag } from 'app/lib/hooks/useCrmaMrDag';
import { useResizeObserver } from 'app/utilities/hooks/useResizeObserver';
import { DisasterMap } from './DisasterMap';
import { LEAD_HELPER } from './WindowChips';

const RISK_LEVELS: RiskLevel[] = ['Minimal', 'Low', 'Moderate', 'High', 'Extreme'];
const GAP = 8; // px between cells; matches the SCSS grid gap (var(--ds-2))

type WindowSummary = { regions: EmdatRegionDatum[]; peak: number; peakCount: number };

/**
 * The five lead windows of one medium-range initialisation, side by side, as
 * small maps — and the lead-window selector. Clicking (or arrowing to) a map
 * selects that window; the big map below draws it in full.
 *
 * All five are coloured from ONE response: `/api/crma-mr-dag/{init}` carries
 * `admin1[gid].windows[w].inherited.risk_level_int` for every window, which is
 * the same value the regions endpoint serves as `frequency` (checked 1:1 for
 * all 227 units × 5 windows), and the request is shared with the region panel
 * through useCrmaMrDag. Colours come from the big map's own fill branch
 * (riskLevelColor), because each small map IS a DisasterMap.
 *
 * Shown for flood risk-monitoring on a medium-range date only; above 640px.
 * At phone width the WindowChips in the control bar are the selector instead
 * (five maps 70px wide are not readable).
 */
export function WindowMapRow() {
  const { hazard, stage, selectedMonth } = usePipelineStore();
  if (hazard !== 'flood' || stage !== 'risk-monitoring' || !isMrInit(selectedMonth)) return null;
  // The inner component owns the resize observer, so it mounts with its
  // element present (the observer does not attach to a late-mounting ref).
  return <WindowMapRowInner init={selectedMonth as string} />;
}

function WindowMapRowInner({ init }: { init: string }) {
  const { selectedWindow, setSelectedWindow } = usePipelineStore();
  const current: CrmaMrWindow = (selectedWindow ?? 'D1') as CrmaMrWindow;
  const { data, loading, error } = useCrmaMrDag(init);
  const rowRef = useRef<HTMLDivElement>(null);
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const { width } = useResizeObserver(rowRef, 960, 200);

  // One memo per payload: stable arrays, so the small maps redraw only when
  // the data changes — not on every store change (e.g. a region click).
  const byWindow = useMemo(() => {
    const out = {} as Record<CrmaMrWindow, WindowSummary>;
    CRMA_MR_WINDOWS.forEach((w) => {
      const regions: EmdatRegionDatum[] = [];
      let peak = 0;
      let peakCount = 0;
      Object.entries(data?.admin1 ?? {}).forEach(([gid, unit]) => {
        const level = unit.windows?.[w]?.inherited?.risk_level_int;
        if (typeof level !== 'number') return;   // no value → drawn as "No data"
        regions.push({
          shapeID: gid,
          shapeName: unit.name ?? gid,
          shapeGroup: gid.split('.')[0],
          frequency: level,
        });
        if (level > peak) { peak = level; peakCount = 1; } else if (level === peak) peakCount += 1;
      });
      out[w] = { regions, peak, peakCount };
    });
    return out;
  }, [data]);

  // Cell width from the row; small-map height follows it (the region is a
  // little taller than wide in Mercator).
  const cellW = Math.max(60, (width - GAP * (CRMA_MR_WINDOWS.length - 1)) / CRMA_MR_WINDOWS.length);
  const mapH = Math.round(Math.min(220, Math.max(72, cellW * 1.05)));

  const select = (i: number) => {
    const n = CRMA_MR_WINDOWS.length;
    const k = (i + n) % n;
    setSelectedWindow(CRMA_MR_WINDOWS[k]);
    btnRefs.current[k]?.focus();
  };
  const onKeyDown = (e: React.KeyboardEvent, i: number) => {
    switch (e.key) {
      case 'ArrowRight': case 'ArrowDown': e.preventDefault(); select(i + 1); break;
      case 'ArrowLeft': case 'ArrowUp': e.preventDefault(); select(i - 1); break;
      case 'Home': e.preventDefault(); select(0); break;
      case 'End': e.preventDefault(); select(CRMA_MR_WINDOWS.length - 1); break;
      default:
    }
  };

  const status = error
    ? 'The five lead-window maps could not be loaded. The large map below still shows the selected window.'
    : loading ? 'Loading the five lead-window maps…' : null;

  return (
    <section className='map-row' aria-labelledby='map-row-title'>
      <div className='map-row__head'>
        <h3 className='map-row__title' id='map-row-title'>Lead time</h3>
        <p className='map-row__hint'>
          Risk level at each lead; under each map, its highest level × regions at it.
          Pick one to show it in full below.
        </p>
      </div>
      <div
        className='map-row__grid'
        role='radiogroup'
        aria-labelledby='map-row-title'
        ref={rowRef}
      >
        {CRMA_MR_WINDOWS.map((w, i) => {
          const on = w === current;
          const s = byWindow[w];
          const peakLabel = s.peak ? RISK_LEVELS[s.peak - 1] : null;
          const summary = peakLabel
            ? `highest level ${peakLabel} in ${s.peakCount} ${s.peakCount === 1 ? 'region' : 'regions'}`
            : error ? 'map unavailable' : loading ? 'loading' : 'no data';
          return (
            <button
              key={w}
              ref={(el) => { btnRefs.current[i] = el; }}
              type='button'
              role='radio'
              aria-checked={on}
              tabIndex={on ? 0 : -1}
              aria-label={`${w}, ${LEAD_HELPER[w]} ahead: ${summary}`}
              className={`map-row__cell${on ? ' is-active' : ''}`}
              onClick={() => setSelectedWindow(w)}
              onKeyDown={(e) => onKeyDown(e, i)}
            >
              <span className='map-row__label' aria-hidden='true'>
                <span className='map-row__win'>{w}</span>
                <span className='map-row__days'>{LEAD_HELPER[w]}</span>
              </span>
              <span className={`map-row__map${data ? '' : ' is-muted'}`} aria-hidden='true'>
                <DisasterMap bare window={w} regions={s.regions} height={mapH} />
              </span>
              <span className='map-row__peak' aria-hidden='true'>
                {peakLabel ? <><strong>{peakLabel}</strong> ×{s.peakCount}</> :' '}
              </span>
            </button>
          );
        })}
      </div>
      {status && (
        <p className={`map-row__status${error ? ' is-error' : ''}`} role='status'>{status}</p>
      )}
    </section>
  );
}
