'use client';

import React from 'react';
import { usePipelineStore } from 'app/store/providers/pipeline';
import type { PipelineStage } from 'app/types/pipeline';
import { getCalendarConfig } from 'app/types/pipeline';

const copy: Record<PipelineStage, { title: string; body: string }> = {
  'risk-knowledge': {
    title: 'Risk Knowledge',
    body: 'Historical disaster events and storylines from the EM-DAT database. Monthly calendar view spanning 1990–2025 for drought and flood hazards.',
  },
  'risk-monitoring': {
    title: 'Risk Monitoring',
    body: 'Ensemble forecasts, observational thresholds, and situational monitoring. Flood uses daily resolution (2022–2026), drought uses monthly (1981–2026).',
  },
  'risk-decisions': {
    title: 'Risk Decisions',
    body: 'Risk evaluation and impact-based forecasting for the current year. Daily resolution calendar for actionable decision windows.',
  },
};

export function StagePanels() {
  const { stage, hazard } = usePipelineStore();
  const config = getCalendarConfig(stage, hazard);

  return (
    <div className='card stage-card'>
      <div className='card__header'>
        <div>
          <p className='eyebrow'>
            {hazard === 'drought' ? 'Drought' : 'Flood'} — {copy[stage].title}
          </p>
          <h3>{copy[stage].title}</h3>
        </div>
        <span className='stage-badge'>
          {config.mode} · {config.startYear}–{config.endYear}
        </span>
      </div>
      <p>{copy[stage].body}</p>
    </div>
  );
}
