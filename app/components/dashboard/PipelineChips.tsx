'use client';

import React from 'react';
import type { PipelineStage } from 'app/types/pipeline';
import { usePipelineStore } from 'app/store/providers/pipeline';

const tabs: { id: PipelineStage; step: string; label: string; helper: string }[] = [
  {
    id: 'risk-knowledge',
    step: '1',
    label: 'Risk Knowledge',
    helper: 'Disaster events & storylines',
  },
  {
    id: 'risk-monitoring',
    step: '2',
    label: 'Risk Monitoring',
    helper: 'Forecasts, thresholds & observations',
  },
];

/**
 * Stage (mode) — two-way segmented toggle in the dashboard control bar.
 *
 * Plain tab order + aria-pressed. Each button's helper text is a real
 * tooltip (aria-describedby) shown on hover AND keyboard focus, instead of a
 * mouse-only `title`.
 */
export function PipelineChips() {
  const { stage, setStage } = usePipelineStore();

  return (
    <div className='dash-control dash-control--stage' role='group' aria-labelledby='dash-label-stage'>
      <span className='dash-control__label' id='dash-label-stage'>
        Stage
      </span>
      <div className='dash-seg dash-seg--stage'>
        {tabs.map((item) => {
          const active = stage === item.id;
          const tipId = `dash-tip-stage-${item.id}`;
          return (
            <span className='dash-seg__item' key={item.id}>
              <button
                type='button'
                className={`dash-seg__btn ${active ? 'is-active' : ''}`}
                aria-pressed={active}
                aria-describedby={tipId}
                onClick={() => setStage(item.id)}
              >
                <span className='dash-seg__step' aria-hidden='true'>
                  {item.step}
                </span>
                {item.label}
              </button>
              <span className='dash-tip' role='tooltip' id={tipId}>
                {item.helper}
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
