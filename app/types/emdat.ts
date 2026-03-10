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
  events: EmdatRegionEvent[];
}
