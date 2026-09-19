import * as d3 from 'd3';
import type { DisasterType } from 'app/types/emdat';

export const droughtColorScale = d3
  .scaleThreshold<number, string>()
  .domain([1, 2, 4, 6, 8, 10])
  .range(['#f5f5f5', '#fee0d2', '#fc9272', '#fb6a4a', '#de2d26', '#a50f15', '#67000d']);

export const floodColorScale = d3
  .scaleThreshold<number, string>()
  .domain([1, 2, 3, 4, 5])
  .range(['#f5f5f5', '#c6dbef', '#6baed6', '#2171b5', '#08519c', '#08306b']);

export function getColorScale(hazard: DisasterType) {
  return hazard === 'drought' ? droughtColorScale : floodColorScale;
}

// ── CRMA traffic-light palette ──────────────────────────────────────────────
// WMO-aligned risk-communication colours, shared by the IBF choropleth and the
// BN-DAG CRMA decision node so the map and the per-boundary panel read the same.
export const CRMA_TRAFFIC: Record<string, string> = {
  Monitor: '#22c55e',          // green
  Evaluate: '#eab308',         // yellow
  Assess: '#f97316',           // orange
  Actionable_Risk: '#dc2626',  // red
};

// Fill colour for an admin1 polygon keyed on its CRMA state. Boundaries with no
// data fall back to a light neutral grey.
export function crmaColor(state?: string | null): string {
  return (state && CRMA_TRAFFIC[state]) || '#e5e7eb';
}

// ── Calendar: % of admin-1 boundaries at Actionable_Risk ────────────────────
// The daily flood calendar boxes are too small for a legible count, so each box
// is coloured by the share of the 227 boundaries in Actionable_Risk that day
// (also used for the monthly drought calendar). 0% is a neutral light slate;
// rising share ramps light→dark red. Thresholds are percentages.
export const actionablePctColor = d3
  .scaleThreshold<number, string>()
  .domain([0.001, 5, 10, 20, 30])
  .range(['#eef2f7', '#fee2e2', '#fca5a5', '#f87171', '#ef4444', '#b91c1c']);

// Legend bins for actionablePctColor, in domain order (low → high).
export const ACTIONABLE_PCT_LEGEND: { label: string; color: string }[] = [
  { label: '0%',      color: '#eef2f7' },
  { label: '<5%',     color: '#fee2e2' },
  { label: '5–10%',   color: '#fca5a5' },
  { label: '10–20%',  color: '#f87171' },
  { label: '20–30%',  color: '#ef4444' },
  { label: '≥30%',    color: '#b91c1c' },
];

// ── Medium-range CRMA: the belief scale ─────────────────────────────────────
// Sequential, one hue, light → dark, over `max_p_high_extreme` — P(High) +
// P(Extreme), the mass on the severe end of the posterior.
//
// Deliberately NOT the traffic light above. Two reasons, and they are
// independent:
//
//   A traffic light is a STATUS palette, reserved for state, and this is a
//   magnitude: a probability on a continuous scale. Magnitude takes a
//   sequential ramp.
//
//   More importantly, green→amber→red asserts good→bad and therefore asserts a
//   boundary between amber and red. That boundary is exactly the trigger
//   `hazards/RISK_SCALE.md` removed. Colouring the belief as a traffic light
//   re-imports the decision through the ramp: a reader sees red and concludes
//   ACT, which is the inference the spec spends a page refusing. The row
//   carries the number and no threshold; so does the colour.
//
// The steps match the API's `level_breaks`, which sit between the values the
// posterior actually takes — it is coarse, and two thirds of cells are exactly
// 0.35. A flat-looking calendar is the posterior, not the rendering.
// Steps chosen for even OKLab lightness, which is the check that applies to a
// sequential ramp (the palette validator's categorical checks — chroma floor,
// adjacent-hue CVD separation — do not: a sequential ramp is MEANT to span
// lightness and go near-neutral at the light end). Searched over the Blues
// family for the most evenly stepped five: L = 0.986 / 0.815 / 0.633 / 0.439 /
// 0.322, monotonic, step spread 0.076. The obvious light-end pick
// (#eef2f7 → #c6dbef) was rejected: ΔE 8.2, too close to read apart.
export const P_SEVERE_STEPS = ['#f7fbff', '#9ecae1', '#4292c6', '#08519c', '#08306b'];

export function pSevereColor(level?: number | null): string {
  if (!level || level < 1) return P_SEVERE_STEPS[0];
  return P_SEVERE_STEPS[Math.min(level, P_SEVERE_STEPS.length) - 1];
}

// Legend for pSevereColor, in domain order. Labels are the VALUE BANDS, not
// rungs — there is no rung.
export const P_SEVERE_LEGEND: { label: string; color: string }[] = [
  { label: '0',          color: P_SEVERE_STEPS[0] },
  { label: '0.15–0.30',  color: P_SEVERE_STEPS[1] },
  { label: '0.35',       color: P_SEVERE_STEPS[2] },
  { label: '0.60–0.70',  color: P_SEVERE_STEPS[3] },
  { label: '0.90',       color: P_SEVERE_STEPS[4] },
];

// The 5-band belief scale for the choropleth: risk_level_int 1..5,
// Minimal → Extreme. Same hue, same reasoning.
export function riskLevelColor(levelInt?: number | null): string {
  if (!levelInt || levelInt < 1) return '#e5e7eb';
  return P_SEVERE_STEPS[Math.min(levelInt, P_SEVERE_STEPS.length) - 1];
}
