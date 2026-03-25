'use client';

import React from 'react';
import type { PipelineStage } from 'app/types/pipeline';
import { usePipelineStore } from 'app/store/providers/pipeline';

const tabs: { id: PipelineStage; label: string; helper: string }[] = [
  {
    id: 'risk-knowledge',
    label: 'Risk Knowledge',
    helper: 'Disaster events & storylines',
  },
  {
    id: 'risk-monitoring',
    label: 'Risk Monitoring',
    helper: 'Forecasts, thresholds & observations',
  },
  {
    id: 'decision-support',
    label: 'Decision Support',
    helper: 'Risk evaluation & impact-based forecasting',
  },
];

export function PipelineChips() {
  const { stage, setStage } = usePipelineStore();

  return (
    <div className='chip-row pipeline'>
      {tabs.map((item) => {
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
