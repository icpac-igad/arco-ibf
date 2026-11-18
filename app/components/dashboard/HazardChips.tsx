'use client';

import React from 'react';
import { usePipelineStore } from 'app/store/providers/pipeline';

const hazards = [
  {
    id: 'drought',
    label: 'Drought',
    description: 'Monthly BN outlook + EM-DAT events',
  },
  {
    id: 'flood',
    label: 'Flood',
    description: 'Daily CRMA outlook + EM-DAT events',
  },
] as const;

/** Hazard (topic) — compact two-way segmented toggle in the dashboard control bar. */
export function HazardChips() {
  const { hazard, setHazard } = usePipelineStore();

  return (
    <div className='dash-control' role='group' aria-labelledby='dash-label-hazard'>
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
              className={`dash-seg__btn ${active ? 'is-active' : ''}`}
              aria-pressed={active}
              title={item.description}
              onClick={() => setHazard(item.id)}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
