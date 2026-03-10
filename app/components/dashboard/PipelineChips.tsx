'use client';

import React from 'react';
import type { PipelineStage } from 'app/types/pipeline';
import { usePipelineStore } from 'app/store/providers/pipeline';

const pipeline: { id: PipelineStage; label: string; helper: string }[] = [
  {
    id: 'events',
    label: 'Disaster Events',
    helper: 'Calendar + map of EM-DAT activity',
  },
  {
    id: 'storylines',
    label: 'Storylines',
    helper: 'Event-specific markdown/MDX context',
  },
  { id: 'crma', label: 'Risk Monitoring / CRMA', helper: 'Regional situational awareness' },
  { id: 'ibf', label: 'IBF Forecasts', helper: 'Admin1 BN projections' },
];

export function PipelineChips() {
  const { stage, setStage } = usePipelineStore();

  return (
    <div className='chip-row pipeline'>
      {pipeline.map((item) => {
        const active = stage === item.id;
        return (
          <button
            key={item.id}
            type='button'
            className={`chip ${active ? 'chip--active' : ''}`}
            onClick={() => setStage(item.id)}
          >
            <span className='chip__label'>{item.label}</span>
            <span className='chip__meta'>{item.helper}</span>
          </button>
        );
      })}
    </div>
  );
}
