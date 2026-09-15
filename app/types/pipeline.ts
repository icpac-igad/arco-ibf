import type { DisasterType } from './emdat';
import type { CrmaMrWindow } from './crma-mr';

export type PipelineStage = 'risk-knowledge' | 'risk-monitoring' | 'risk-decisions';

export interface CalendarConfig {
  mode: 'monthly' | 'daily';
  startYear: number;
  endYear: number;
}

export interface PipelineState {
  hazard: DisasterType;
  stage: PipelineStage;
  selectedMonth?: string | null;    // YYYY-MM for monthly, YYYY-MM-DD for daily
  selectedEventKey?: string | null; // derived from selectedMonth (top event)
  selectedBoundary?: string | null; // GID_1 of clicked Admin1 polygon
  // Lead window for the medium-range CRMA feed (flood risk-monitoring, dates
  // inside MR_RANGE). Every medium-range row is keyed (init, window) — a date
  // carries five answers at five leads — so the selected window is state, not a
  // component-local toggle: the calendar, the choropleth and the DAG panel must
  // all read the same one. Ignored outside that feed.
  selectedWindow?: CrmaMrWindow | null;
}

export function getCalendarConfig(stage: PipelineStage, hazard: DisasterType): CalendarConfig {
  switch (stage) {
    case 'risk-knowledge':
      return { mode: 'monthly', startYear: 1990, endYear: 2025 };
    case 'risk-monitoring':
      // Flood RM daily data spans the 2019+ event windows (matches the RK flood
      // storylines from 2019 onward); start at 2019 so none are clipped.
      return hazard === 'flood'
        ? { mode: 'daily', startYear: 2019, endYear: 2026 }
        : { mode: 'monthly', startYear: 1981, endYear: 2026 };
    case 'risk-decisions':
      return { mode: 'daily', startYear: 2026, endYear: 2026 };
  }
}
