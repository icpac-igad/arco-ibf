import type { DisasterType } from './emdat';

/**
 * Scenario Mode types. One Scenario drives a guided replay of a historical
 * event "as if unfolding today": a date cursor steps backward → forward through
 * the real BN-IBF artifacts already in GCS, gating evidence by round, capturing
 * the DOC decision + quiz. See scenario-sim/IMPLEMENTATION_PLAN.md.
 */

export type EvidenceType = 'hard' | 'soft' | 'virtual';
export type Forecastability = 'strong' | 'tail' | 'surprise';
export type HazardAssetType = 'rim2d' | 'wflow_wrsi';

export interface ScenarioHazardLayer {
  type: HazardAssetType;
  asset_url: string;       // hotlinked HuggingFace resolve URL (MVP)
  caption: string;
  validation: 'illustrative' | 'validated';
}

export interface ScenarioMonitoringLayer {
  key_field: 'date' | 'init';            // flood=date YYYY-MM-DD, drought=init YYYY-MM
  calendar: string;                      // /api/ibf-{flood,drought}-calendar
  regions: string;                       // /api/ibf-{flood,drought}-regions/{key}
  dag: string;                           // /api/{bn-dag,drought-bn-dag}/{key}
}

export interface EvidenceCard {
  id: string;
  label: string;
  source?: string;
  bn_node: string;                       // maps to a real BN node (antecedent_rainfall, cur, cdi_class, R_obs…)
  evidence_type: EvidenceType;
  value_by_date: Record<string, string>; // cursor key → human-readable value at that step
  teaching_note?: string;
}

export interface ScenarioRound {
  round: number;
  title: string;
  cursor_date: string;                   // YYYY-MM-DD (flood) | YYYY-MM (drought)
  reveal_evidence: string[];             // EvidenceCard ids unlocked this round
  checkpoint?: boolean;                  // require a decision this round
  quiz?: string[];
  engine_state?: string;                 // human note of the real BN/CRMA state at this cursor
}

export interface ScenarioDecision {
  ladder: string[];                      // DOC verbs (Monitor → Emergency Coordination)
  crma_mapping: Record<string, string>;  // DOC verb → engine CRMA state
  require_uncertainty_note: boolean;
  allow_no_regret: boolean;
  checkpoint_prompt?: string;
}

export interface ScenarioCounterfactual {
  prompt: string;
  virtual_evidence_node: string;
  narrative: string;
}

export interface ScenarioDebrief {
  loss_markdown: string;                 // /api/emdat-event-markdown/{key}
  loss_note_2026?: string;
  reconstruction_quiz: string[];
}

export interface Scenario {
  event_id: string;
  hazard: DisasterType;
  country: string;
  admin1: string;
  gid_1: string;                         // keys the bn-dag JSON; confirm vs icpac_adm1v3.json
  emdat_event_key: string;
  title: string;
  forecastability: Forecastability;
  mode_defaults: { hindsight: 'on' | 'off'; duration_min: number };
  layers: { risk_monitoring: ScenarioMonitoringLayer; hazard: ScenarioHazardLayer };
  brief_outcome_free?: string;
  peak: { date: string; description?: string; hidden_until?: string };
  simulation_start: { cursor_date: string; offset_label: string };
  rounds: ScenarioRound[];
  evidence_cards: EvidenceCard[];
  decision: ScenarioDecision;
  counterfactual?: ScenarioCounterfactual;
  debrief: ScenarioDebrief;
  scoring: Record<string, number>;
}

/** A participant's captured answer at one checkpoint round. */
export interface RoundDecision {
  round: number;
  doc_level: string;                     // chosen ladder rung
  uncertainty_note: string;
  no_regret: boolean;
}
