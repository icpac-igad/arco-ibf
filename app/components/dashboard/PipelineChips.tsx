'use client';

import React from 'react';
import type { PipelineStage } from 'app/types/pipeline';
import { usePipelineStore } from 'app/store/providers/pipeline';

const pipeline: { id: PipelineStage; label: string; helper: string; enabled: boolean }[] = [
  {
    id: 'events',
    label: 'Disaster Events',
    helper: 'Calendar + map of EM-DAT activity',
    enabled: true,
  },
  {
    id: 'storylines',
    label: 'Storylines',
    helper: 'Coming soon',
    enabled: false,
  },
  { id: 'crma', label: 'Risk Monitoring / CRMA', helper: 'Coming soon', enabled: false },
  { id: 'ibf', label: 'IBF Forecasts', helper: 'Coming soon', enabled: false },
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
            className={`chip ${active ? 'chip--active' : ''} ${!item.enabled ? 'chip--disabled' : ''}`}
            onClick={() => item.enabled && setStage(item.id)}
            disabled={!item.enabled}
            title={!item.enabled ? 'Coming soon' : undefined}
          >
            <span className='chip__label'>{item.label}</span>
            <span className='chip__meta'>{item.helper}</span>
          </button>
        );
      })}
    </div>
  );
}
