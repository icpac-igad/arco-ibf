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
