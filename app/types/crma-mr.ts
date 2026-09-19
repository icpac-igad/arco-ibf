/**
 * Medium-range CRMA feed — the six-node network, MAM/JJA 2026.
 *
 * Three ways this differs from the flood and drought IBF types next door, each
 * of which shows up below:
 *
 *   1. Every row is keyed (init, window). A date carries FIVE answers at five
 *      lead windows, so nothing here is keyed on a date alone.
 *   2. Four terms ride on every row — hazard, exposure, vulnerability,
 *      uncertainty. `EmdatRegionDatum` carries a state and a probability; this
 *      carries why.
 *   3. Two geographies, and the admin-1 one INHERITS from its top basin. Which
 *      is why `top_basin_unit_share` is required, not optional, on
 *      `CrmaMrRegion` — see the comment there.
 */

/** The five lead windows, in order. */
export const CRMA_MR_WINDOWS = ['D1', 'D2-3', 'D4-5', 'D6-7', 'D8-10'] as const;
export type CrmaMrWindow = (typeof CRMA_MR_WINDOWS)[number];

export type CrmaMrSeason = 'mam' | 'jja';

/**
 * The belief scale — the mode of the five-state posterior. This replaced the
 * cost–loss ladder (Monitor/Evaluate/Assess/Actionable_Risk), which was removed
 * upstream because a rung called "actionable" is a piece of a decision and CRMA
 * states it holds no policy number. See hazards/RISK_SCALE.md.
 */
export type RiskLevel = 'Minimal' | 'Low' | 'Moderate' | 'High' | 'Extreme';

/** The ordinal ladder shared by exposure, susceptibility and significance. */
export type CrmaOrdinal = 'limited' | 'elevated' | 'serious' | 'critical';

export interface CrmaMrCalendarDatum {
  event_key: string;
  init: string;
  season: CrmaMrSeason;
  window: CrmaMrWindow;
  year: number;
  month: number;
  day: number;
  /**
   * A colour step over `max_p_high_extreme`, on a sequential ramp. NOT a
   * severity rung and not a threshold count — CRMA holds no threshold. The
   * response carries `level_basis`, `level_breaks` and `level_note` so a
   * legend states what the colour means instead of inventing it.
   */
  level: number;
  n_basins: number;
  /** Counts of a belief band. Not counts of a threshold crossed — there is none. */
  n_minimal: number;
  n_low: number;
  n_moderate: number;
  n_high: number;
  n_extreme: number;
  /** Largest P(High)+P(Extreme) among the basins; what `level` is a step of. */
  max_p_high_extreme: number | null;


  max_post_heavy: number | null;
  mean_post_heavy: number | null;
  max_rp_ratio: number | null;
  mean_confidence: number | null;
}

export interface CrmaMrCalendarResponse {
  data: CrmaMrCalendarDatum[];
  windows: CrmaMrWindow[];
  window: string | null;
  season: string | null;
  level_basis: string;
  level_breaks: number[];
  no_threshold?: string;
  level_note?: string;
}

/**
 * One admin-1 unit, in the same shape as `EmdatRegionDatum` so `DisasterMap`
 * consumes it without a new code path.
 *
 * **`risk_level`, `p_high_extreme` and `confidence` are all inherited from
 * `top_basin`, not computed at admin-1.** `top_basin_unit_share`
 * is non-optional for that reason: on 2026-03-01/D1, 166 of 227 units are under
 * 5% of the basin whose state they display. Rendering the state without the
 * share is presenting a basin maximum as a location.
 */
export interface CrmaMrRegion {
  shapeID: string;
  shapeName: string;
  shapeGroup: string;
  frequency: number;
  // Areal — genuinely computed at admin-1 from the basins it overlaps.
  p_heavy_areal: number | null;
  p_moderate_areal: number | null;
  p_heavy_max: number | null;
  exposure_score_areal: number | null;
  susceptibility_score_areal: number | null;
  n_basins: number;
  area_covered: number | null;
  // Inherited.
  risk_level: string;
  p_high_extreme: number | null;
  confidence: number | null;
  top_basin: string;
  top_basin_unit_share: number | null;
  top_basin_area_share: number | null;
  inherited: true;
}

export interface CrmaMrRegionsResponse {
  regions: CrmaMrRegion[];
  init: string;
  window: CrmaMrWindow;
  season?: CrmaMrSeason;
  windows?: CrmaMrWindow[];
}

// ---------------------------------------------------------------------------
// The DAG
// ---------------------------------------------------------------------------

/**
 * A node descriptor, as the file declares it.
 *
 * The topology travels WITH the data — `<BNDag>` hardcodes its five evidence
 * nodes, which is why adding a node there needs a frontend release. A renderer
 * for this feed walks `schema` instead.
 */
export interface CrmaMrNodeSpec {
  key: string;
  label: string;
  layer:
    | 'evidence'
    | 'measurement'
    | 'observation'
    | 'hazard'
    | 'context'
    | 'risk'
    | 'uncertainty'
    | 'decision';
  unit: string;
  bands?: string[];
  note?: string;
}

/** `kind` is the edge's meaning, not its style — render accordingly. */
export type CrmaMrEdgeKind =
  | 'noisy_or'
  | 'measurement'
  | 'elicited'
  | 'derived'
  | 'cost_loss'
  | 'threshold'
  | 'ordinal';

export interface CrmaMrEdgeSpec {
  from: string;
  to: string;
  kind: CrmaMrEdgeKind;
}

export interface CrmaMrSchema {
  nodes: CrmaMrNodeSpec[];
  edges: CrmaMrEdgeSpec[];
  /** Node keys whose payload is read from `basin.static`. */
  static: string[];
  /** Node keys whose payload is read from `basin.windows[window]`. */
  per_window: string[];
}

/**
 * One circulation node. Decibels, not a probability vector: `build_layer4.py`
 * keeps `db_<node>` and the argmax but does not persist the per-member
 * histogram. That is not a loss — the decibels ADD
 * (`log P(no rain) = log(1−leak) + Σ log Sᵢ`), so `share` answers "which
 * evidence moved the belief", which a normalised vector cannot.
 */
export interface CrmaMrEvidenceNode {
  db: number;
  /** This node's share of `heavy_rain.db_total`. Colour by this, not by band alone. */
  share: number;
  state: string | null;
  state_index: number | null;
  raw: string;
}

/**
 * The node payloads that do not move with lead. The antecedent is an
 * observation made at initialisation; exposure and susceptibility describe
 * buildings, not weather. Rendering them inside the per-window group implies
 * they changed with the window.
 */
export interface CrmaMrStatic {
  antecedent: {
    state: string | null;
    mm_7d: number | null;
    ratio: number | null;
    observed: boolean;
    raw: string;
  };
  exposure: {
    state: CrmaOrdinal | null;
    score: number | null;
    top_elements: string | null;
    bld_per_km2: number | null;
    urban_frac: number | null;
  };
  susceptibility: {
    state: CrmaOrdinal | null;
    score: number | null;
    basis: string | null;
    small_building_frac: number | null;
    thin_evidence: boolean;
  };
}

export interface CrmaMrWindowNodes {
  [evidenceKey: string]: unknown;
  precipitation: { state: string | null; mm_per_day: number | null; raw: string };
  tail: {
    rp_ratio_p90: number | null;
    rp_ratio_ensmax: number | null;
    frac_members_rp1: number | null;
    spatial_coverage: number | null;
    ens_cv: number | null;
    raw: string;
  };
  heavy_rain: {
    prior: (number | null)[];
    post: (number | null)[];
    p_heavy: number | null;
    leak: number | null;
    db_total: number | null;
    state: string;
  };
  risk: {
    probs: (number | null)[];
    state: string | null;
    p_high_extreme: number | null;
  };
  confidence: {
    value: number | null;
    /**
     * Percentile rank within this initialisation. **Colour this, not `value`.**
     * The definition changed to `1 − H/H_max` and levels dropped ~0.17, so a
     * fixed 0–1 scale inherited from `max(action_probs)` now reads uniformly
     * low. Rank survived the change (+0.910).
     */
    rank: number;
  };

}

export interface CrmaMrBasinDag {
  static: CrmaMrStatic;
  windows: Record<string, CrmaMrWindowNodes>;
}

export interface CrmaMrAdmin1Window {
  p_heavy_areal: number | null;
  p_moderate_areal: number | null;
  p_heavy_max: number | null;
  top_basin: string | null;
  top_basin_unit_share: number | null;
  top_basin_area_share: number | null;
  top_basin_p_heavy: number | null;
  n_basins: number;
  area_covered: number | null;
  wetness: string | null;
  exposure: CrmaOrdinal | null;
  susceptibility: CrmaOrdinal | null;
  rp_ratio_max: number | null;
  tp_mm_per_day: number | null;
  /** Kept under its own key so nothing in it reads as an admin-1 value. */
  inherited: {
    crma_state: string | null;
    crma_state_baseline: string | null;
    traffic_light: string | null;
    risk_level: string | null;
    risk_level_int: number;
    p_high_extreme: number | null;
    confidence: number | null;
    significance: string | null;
  } | null;
}

export interface CrmaMrDagResponse {
  init: string;
  season: CrmaMrSeason;
  windows: CrmaMrWindow[];
  schema: CrmaMrSchema;
  basins: Record<string, CrmaMrBasinDag>;
  admin1: Record<string, { name: string | null; windows: Record<string, CrmaMrAdmin1Window> }>;
}

export interface CrmaMrMarkdownResponse {
  markdown: string;
  init: string;
  kind: 'brief' | 'synoptic';
}
