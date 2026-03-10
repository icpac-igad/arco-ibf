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

export function HazardChips() {
  const { hazard, setHazard } = usePipelineStore();

  return (
    <div className='chip-row'>
      {hazards.map((item) => {
        const active = hazard === item.id;
        return (
          <button
            key={item.id}
            type='button'
            className={`chip ${active ? 'chip--active' : ''}`}
            onClick={() => setHazard(item.id)}
          >
            <span className='chip__label'>{item.label}</span>
            <span className='chip__meta'>{item.description}</span>
          </button>
        );
      })}
    </div>
  );
}
