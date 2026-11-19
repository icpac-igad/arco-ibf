'use client';

import React from 'react';
import { usePipelineStore } from 'app/store/providers/pipeline';

const hazards = [
  {
    id: 'flood',
    label: 'Flood',
    meta: 'daily CRMA outlook',
    description: 'Daily CRMA outlook + EM-DAT events',
  },
  {
    id: 'drought',
    label: 'Drought',
    meta: 'monthly BN outlook',
    description: 'Monthly BN outlook + EM-DAT events',
  },
] as const;

/** Hazard (topic) — compact two-way segmented toggle in the dashboard control bar. */
export function HazardChips() {
  const { hazard, setHazard } = usePipelineStore();

  return (
    <div className='dash-control dash-control--hazard' role='group' aria-labelledby='dash-label-hazard'>
      <span className='dash-control__label' id='dash-label-hazard'>
        Hazard
      </span>
      <div className='dash-seg dash-seg--hazard'>
        {hazards.map((item) => {
          const active = hazard === item.id;
          return (
            <button
              key={item.id}
              type='button'
              className={`dash-seg__btn dash-seg__btn--${item.id} ${active ? 'is-active' : ''}`}
              aria-pressed={active}
              title={item.description}
              onClick={() => setHazard(item.id)}
            >
              <span className='dash-seg__dot' aria-hidden='true' />
              {item.label}
              <span className='dash-seg__meta'>{item.meta}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
