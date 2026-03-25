'use client';

import React from 'react';
import { PipelineProvider } from 'app/store/providers/pipeline';
import { HazardChips } from './HazardChips';
import { PipelineChips } from './PipelineChips';
import { DisasterCalendar } from './DisasterCalendar';
import { DisasterMap } from './DisasterMap';
import { MarkdownPanel } from './MarkdownPanel';

export function DashboardShell() {
  return (
    <PipelineProvider>
      <section className='pipeline-shell grid-container'>
        <div className='grid-row margin-top-4'>
          <div className='tablet:grid-col-12'>
            <p className='eyebrow'>Continuous Risk Monitoring & Assessment</p>
            <h1>Flood & Drought Early Warning</h1>
            <p className='text-base'>
              Explore EM-DAT disaster events across East Africa. Select a hazard, click a calendar
              cell to view affected Admin1 regions and event details.
            </p>
          </div>
        </div>

        <div className='grid-row margin-top-2'>
          <div className='tablet:grid-col-12'>
            <HazardChips />
          </div>
        </div>

        <div className='grid-row margin-top-1'>
          <div className='tablet:grid-col-12'>
            <PipelineChips />
          </div>
        </div>

        <div className='grid-row grid-gap-lg margin-top-3'>
          <div className='tablet:grid-col-6'>
            <DisasterCalendar />
          </div>
          <div className='tablet:grid-col-6'>
            <DisasterMap />
          </div>
        </div>

        <div className='grid-row margin-top-3'>
          <div className='tablet:grid-col-12'>
            <MarkdownPanel />
          </div>
        </div>
      </section>
    </PipelineProvider>
  );
}
