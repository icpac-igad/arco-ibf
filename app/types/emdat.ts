export type DisasterType = 'drought' | 'flood';

export interface EmdatMonthDatum {
  event_key: string;
  year: number;
  month: number;
  event_count: number;
  total_deaths: number;
  total_affected: number;
  regions_affected: number;
  countries_affected: number;
  level: number;
  disaster_type?: string;
}

export interface EmdatRegionEvent {
  id: string;
  name: string;
  hazard: DisasterType;
  description?: string;
  total_deaths?: number;
  total_affected?: number;
  anchor?: string;
}

export interface EmdatRegionDatum {
  shapeID: string;
  shapeName: string;
  shapeGroup: string;
  frequency: number;
  events?: EmdatRegionEvent[];
  // IBF risk-monitoring payload (drought + flood region endpoints) carries the
  // CRMA decision per boundary; used to colour the choropleth as a traffic light.
  crma_state?: string;
  traffic_light?: string;
  p_high_extreme?: number;
}

export interface IbfCalendarDatum {
  event_key: string;
  year: number;
  month: number;
  level: number;
  n_monitor: number;
  n_evaluate: number;
  n_assess: number;
  n_actionable_risk: number;
  // drought-only
  init_month?: string;
  target_season?: string;
  // flood-only
  day?: number;
}
