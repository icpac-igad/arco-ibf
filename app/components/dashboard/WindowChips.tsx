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
 *
 * Helper text is a tooltip (aria-describedby) shown on hover and keyboard
 * focus. Disabled buttons cannot take focus, so the reason they are disabled
 * is also stated in the visible status note.
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
    <div
      className={`dash-control dash-control--lead ${active ? '' : 'is-inactive'}`}
      role='group'
      aria-labelledby='dash-label-lead'
    >
      <span className='dash-control__label' id='dash-label-lead'>
        Lead time
      </span>
      <div className='dash-seg dash-seg--lead'>
        {CRMA_MR_WINDOWS.map((w) => {
          const on = active && selectedWindow === w;
          const tipId = `dash-tip-lead-${w}`;
          return (
            <span className='dash-seg__item' key={w}>
              <button
                type='button'
                className={`dash-seg__btn ${on ? 'is-active' : ''}`}
                aria-pressed={on}
                aria-describedby={tipId}
                disabled={!active}
                onClick={() => setSelectedWindow(w)}
              >
                <span className='dash-seg__main'>{w}</span>
                <span className='dash-seg__sub'>{HELPER[w]}</span>
              </button>
              <span className='dash-tip' role='tooltip' id={tipId}>
                {active
                  ? `Forecast for ${HELPER[w]} after the initialisation`
                  : `Available for initialisations from ${MR_RANGE.start}`}
              </span>
            </span>
          );
        })}
      </div>

      {!active && (
        <span className='dash-control__note' role='status'>
          {selectedMonth && selectedMonth.length === 10
            ? `${selectedMonth} predates the medium-range network — showing the daily BN`
            : `Pick a day from ${MR_RANGE.start} to use lead times`}
        </span>
      )}
    </div>
  );
}
