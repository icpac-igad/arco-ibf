import type { DisasterType } from './emdat';

export type PipelineStage = 'risk-knowledge' | 'risk-monitoring' | 'risk-decisions';

export interface CalendarConfig {
  mode: 'monthly' | 'daily';
  startYear: number;
  endYear: number;
}

export interface PipelineState {
  hazard: DisasterType;
  stage: PipelineStage;
  selectedMonth?: string | null;   // YYYY-MM for monthly, YYYY-MM-DD for daily
  selectedEventKey?: string | null; // derived from selectedMonth (top event)
}

export function getCalendarConfig(stage: PipelineStage, hazard: DisasterType): CalendarConfig {
  switch (stage) {
    case 'risk-knowledge':
      return { mode: 'monthly', startYear: 1990, endYear: 2025 };
    case 'risk-monitoring':
      return hazard === 'flood'
        ? { mode: 'daily', startYear: 2022, endYear: 2026 }
        : { mode: 'monthly', startYear: 1981, endYear: 2026 };
    case 'risk-decisions':
      return { mode: 'daily', startYear: 2026, endYear: 2026 };
  }
}
