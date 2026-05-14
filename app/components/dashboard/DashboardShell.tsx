'use client';

import React from 'react';
import { PipelineProvider, usePipelineStore } from 'app/store/providers/pipeline';
import { getCalendarConfig } from 'app/types/pipeline';
import { HazardChips } from './HazardChips';
import { PipelineChips } from './PipelineChips';
import { DisasterCalendar } from './DisasterCalendar';
import { DisasterMap } from './DisasterMap';
import { MarkdownPanel } from './MarkdownPanel';
import { StagePanels } from './StagePanels';
import { BoundaryDagPanel } from './BoundaryDagPanel';
import { BoundaryDagPanelDrought } from './BoundaryDagPanelDrought';
import { EventListPanel } from './EventListPanel';

function DashboardContent() {
  const { stage, hazard } = usePipelineStore();
  const calendarConfig = getCalendarConfig(stage, hazard);

  return (
    <section className='pipeline-shell grid-container'>
      <div className='grid-row margin-top-4'>
        <div className='tablet:grid-col-12'>
          <p className='eyebrow'>CRMA</p>
          <h1>Continuous Risk Monitoring & Assessment</h1>
          <p className='text-base'>
            Explore disaster events, monitor hazard risk, and access impact-based forecasts
            for flood and drought across East Africa.
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

      <div className='grid-row margin-top-1'>
        <div className='tablet:grid-col-12'>
          <StagePanels />
        </div>
      </div>

      <div className='grid-row grid-gap-lg margin-top-3'>
        <div className='tablet:grid-col-6'>
          <DisasterCalendar
            mode={calendarConfig.mode}
            startYear={calendarConfig.startYear}
            endYear={calendarConfig.endYear}
          />
        </div>
        <div className='tablet:grid-col-6'>
          <DisasterMap />
        </div>
      </div>

      <div className='grid-row margin-top-3'>
        <div className='tablet:grid-col-12'>
          {/* Each panel renders null when its hazard/stage does not match,
              so they're safe to mount together. */}
          <BoundaryDagPanel />
          <BoundaryDagPanelDrought />
          <EventListPanel />
        </div>
      </div>

      <div className='grid-row margin-top-3'>
        <div className='tablet:grid-col-12'>
          <MarkdownPanel />
        </div>
      </div>
    </section>
  );
}

export function DashboardShell() {
  return (
    <PipelineProvider>
      <DashboardContent />
    </PipelineProvider>
  );
}
