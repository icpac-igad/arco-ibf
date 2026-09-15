'use client';

import React from 'react';
import { usePipelineStore } from 'app/store/providers/pipeline';
import { CRMA_MR_WINDOWS, type CrmaMrWindow } from 'app/types/crma-mr';
import { isMrInit, MR_RANGE } from 'app/lib/crma-mr-range';

/**
 * Lead-window selector for the medium-range CRMA feed.
 *
 * This is not a convenience control. Every medium-range row is keyed
 * `(init, window)`: one initialisation carries **five** answers at five leads,
 * so a calendar keyed on the date alone would show one and hide four. The API
 * takes `window` as a required path segment for the same reason — there is no
 * defaulted "the forecast for this day".
 *
 * Shown only for flood risk-monitoring, and disabled when the selected date
 * falls outside `MR_RANGE`, where the legacy daily BN answers instead and has
 * no concept of a lead window.
 */
const HELPER: Record<CrmaMrWindow, string> = {
  D1: 'day 1',
  'D2-3': 'days 2–3',
  'D4-5': 'days 4–5',
  'D6-7': 'days 6–7',
  'D8-10': 'days 8–10',
};

export function WindowChips() {
  const { hazard, stage, selectedMonth, selectedWindow, setSelectedWindow } =
    usePipelineStore();

  if (hazard !== 'flood' || stage !== 'risk-monitoring') return null;

  const active = isMrInit(selectedMonth);

  return (
    <div className='chip-row pipeline' style={{ opacity: active ? 1 : 0.45 }}>
      <span
        className='chip__meta'
        style={{ alignSelf: 'center', paddingRight: '0.75rem', whiteSpace: 'nowrap' }}
      >
        Lead window
      </span>

      {CRMA_MR_WINDOWS.map((w) => (
        <button
          key={w}
          type='button'
          className={`chip ${active && selectedWindow === w ? 'chip--active' : ''}`}
          disabled={!active}
          onClick={() => setSelectedWindow(w)}
          title={
            active
              ? `Forecast for ${HELPER[w]} after the initialisation`
              : `Available for initialisations ${MR_RANGE.start} to ${MR_RANGE.end}`
          }
        >
          <span className='chip__label'>{w}</span>
          <span className='chip__meta'>{HELPER[w]}</span>
        </button>
      ))}

      {!active && (
        <span
          className='chip__meta'
          style={{ alignSelf: 'center', paddingLeft: '0.75rem' }}
        >
          {selectedMonth
            ? `${selectedMonth} predates the medium-range network — showing the daily BN`
            : `Select a date from ${MR_RANGE.start} to ${MR_RANGE.end}`}
        </span>
      )}
    </div>
  );
}
