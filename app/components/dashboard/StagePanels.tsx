'use client';

import React from 'react';
import { usePipelineStore } from 'app/store/providers/pipeline';
import type { PipelineStage } from 'app/types/pipeline';
import { getCalendarConfig } from 'app/types/pipeline';
import { MR_RANGE } from 'app/lib/crma-mr-range';

/**
 * One-line description of what the current hazard + stage shows.
 *
 * The stage name itself is already visible in the Stage toggle, so it is not
 * repeated here. Year ranges come from `getCalendarConfig`, the same source the
 * calendar uses, so the text cannot drift from what the calendar offers.
 */
function describe(stage: PipelineStage, hazard: string, range: string): string {
  switch (stage) {
    case 'risk-knowledge':
      return `Historical disaster events and storylines from EM-DAT · monthly calendar, ${range}.`;
    case 'risk-monitoring':
      return hazard === 'flood'
        ? `Daily flood risk, ${range}. Dates from ${MR_RANGE.start} use the medium-range CRMA network (five lead times); earlier dates use the daily BN.`
        : `Monthly drought outlook from the BN, ${range}.`;
  }
}

export function StagePanels() {
  const { stage, hazard } = usePipelineStore();
  const config = getCalendarConfig(stage, hazard);
  const range =
    config.startYear === config.endYear
      ? `${config.startYear}`
      : `${config.startYear}–${config.endYear}`;

  return <p className='dash-subtitle'>{describe(stage, hazard, range)}</p>;
}
