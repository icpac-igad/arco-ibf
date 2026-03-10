'use client';

import React from 'react';
import { usePipelineStore } from 'app/store/providers/pipeline';
import type { PipelineStage } from 'app/types/pipeline';

const copy: Record<
  PipelineStage,
  {
    title: string;
    body: string;
  }
> = {
  events: {
    title: 'Disaster Events',
    body: 'Explore EM-DAT frequency over 45 years. Select a month to drive the downstream stages.',
  },
  storylines: {
    title: 'Storylines',
    body: 'Markdown narratives summarize multiple events within the selected month and provide anchors for related datasets.',
  },
  crma: {
    title: 'Risk Monitoring / CRMA',
    body: 'Link to country-level CRMA dashboards for the chosen hazard. Daily flood monitoring becomes available once the month is selected.',
  },
  ibf: {
    title: 'Impact-Based Forecasting',
    body: 'Launch the Admin1 BN forecast cards for the same period to complete the hazard pipeline.',
  },
};

export function StagePanels() {
  const { stage, hazard, selectedMonth } = usePipelineStore();

  return (
    <div className='card stage-card'>
      <div className='card__header'>
        <div>
          <p className='eyebrow'>Pipeline Stage</p>
          <h3>{copy[stage].title}</h3>
        </div>
      </div>
      <p>{copy[stage].body}</p>
      <div className='stage-actions'>
        {stage === 'crma' && (
          <a
            className='usa-button usa-button--outline'
            href={`https://veda-api/redirect/crma?hazard=${hazard}&month=${selectedMonth ?? ''}`}
            target='_blank'
            rel='noreferrer'
          >
            Open CRMA dashboard
          </a>
        )}
        {stage === 'ibf' && (
          <a
            className='usa-button'
            href={`https://veda-api/redirect/ibf?hazard=${hazard}&month=${selectedMonth ?? ''}`}
            target='_blank'
            rel='noreferrer'
          >
            Open IBF dashboard
          </a>
        )}
      </div>
    </div>
  );
}
