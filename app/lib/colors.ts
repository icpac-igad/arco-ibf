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
