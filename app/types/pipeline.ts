import type { DisasterType } from './emdat';

export type PipelineStage = 'risk-knowledge' | 'risk-monitoring' | 'decision-support';

export interface CalendarConfig {
  mode: 'monthly' | 'daily';
  startYear: number;
  endYear: number;
}

export interface PipelineState {
  hazard: DisasterType;
  stage: PipelineStage;
  selectedMonth?: string | null;
  selectedEventKey?: string | null;
}

/**
 * Derive calendar configuration from stage + hazard.
 */
export function getCalendarConfig(stage: PipelineStage, hazard: DisasterType): CalendarConfig {
  switch (stage) {
    case 'risk-knowledge':
      return { mode: 'monthly', startYear: 1990, endYear: 2025 };
    case 'risk-monitoring':
      return hazard === 'flood'
        ? { mode: 'daily', startYear: 2022, endYear: 2026 }
        : { mode: 'monthly', startYear: 1981, endYear: 2026 };
    case 'decision-support':
      return { mode: 'daily', startYear: 2026, endYear: 2026 };
  }
}
