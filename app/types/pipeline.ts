import type { DisasterType } from './emdat';

export type PipelineStage = 'events' | 'storylines' | 'crma' | 'ibf';

export interface PipelineState {
  hazard: DisasterType;
  stage: PipelineStage;
  selectedMonth?: string | null;
  selectedEventKey?: string | null;
}
