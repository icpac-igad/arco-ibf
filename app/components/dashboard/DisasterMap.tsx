'use client';

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { mesh } from 'topojson-client';
import { usePipelineStore } from 'app/store/providers/pipeline';
import {
  fetchEmdatMonthRegions,
  fetchIbfFloodRegions,
  fetchIbfDroughtRegions,
  fetchCrmaMrRegions,
} from 'app/lib/api/emdat';
import type { EmdatRegionDatum } from 'app/types/emdat';
import type { CrmaMrWindow, RiskLevel } from 'app/types/crma-mr';
import { isMrInit } from 'app/lib/crma-mr-range';
import { useResizeObserver } from 'app/utilities/hooks/useResizeObserver';
import { useAdm1Topology } from 'app/lib/hooks/useAdm1Topology';
import { getColorScale, getTotalsColorScale, crmaColor, riskLevelColor, CRMA_TRAFFIC } from 'app/lib/colors';
import { MapLegend, type MapLegendSpec, type MapLegendItem } from './map/MapLegend';

// Compact, prominent date label for the choropleth corner.
// Drought init is YYYY-MM; flood target date is YYYY-MM-DD.
const _MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function formatSelected(s: string | null): string | null {
  if (!s) return null;
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (day) return `${day[3]} ${_MONTHS[+day[2] - 1]} ${day[1]}`;
  const mon = /^(\d{4})-(\d{2})$/.exec(s);
  if (mon) return `${_MONTHS[+mon[2] - 1]} ${mon[1]}`;
  return s;
}

// The topojson carries only GID_1 + NAME_1; the country is the GID_1 prefix.
const COUNTRY_NAMES: Record<string, string> = {
  BDI: 'Burundi', DJI: 'Djibouti', ERI: 'Eritrea', ETH: 'Ethiopia', KEN: 'Kenya',
  RWA: 'Rwanda', SDN: 'Sudan', SOM: 'Somalia', SSD: 'South Sudan', TZA: 'Tanzania',
  UGA: 'Uganda',
};
const countryOf = (gid: string) => {
  const iso = gid.split('.')[0];
  return COUNTRY_NAMES[iso] ?? iso;
};

// Fill for neighbour (context) units on focus-country maps.
const CONTEXT_FILL = '#eef0f1';

// The medium-range belief scale, in risk_level_int order (1..5). Labels only —
// the colours come from riskLevelColor, which fills the polygons.
const RISK_LEVELS: RiskLevel[] = ['Minimal', 'Low', 'Moderate', 'High', 'Extreme'];

// Plain-language lead window (same wording as the lead-window control).
const LEAD_LABEL: Record<string, string> = {
  D1: 'day 1', 'D2-3': 'days 2–3', 'D4-5': 'days 4–5', 'D6-7': 'days 6–7', 'D8-10': 'days 8–10',
};

type RegionDetail = EmdatRegionDatum & {
  inherited?: boolean;
  top_basin?: string;
  top_basin_unit_share?: number | null;
  risk_level?: string;
};

type HoverInfo = { gid: string; name: string; fill: string };

type Overlay = { kind: 'loading' | 'prompt' | 'empty' | 'error'; text: string };

function ZoomIcon({ kind }: { kind: 'in' | 'out' | 'reset' }) {
  return (
    <svg aria-hidden='true' viewBox='0 0 20 20' width='18' height='18' fill='none'
         stroke='currentColor' strokeWidth='1.9' strokeLinecap='round' strokeLinejoin='round'>
      {kind === 'in' && <path d='M10 4v12M4 10h12' />}
      {kind === 'out' && <path d='M4 10h12' />}
      {kind === 'reset' && (
        <path d='M3.5 7.5V3.5h4M16.5 7.5V3.5h-4M3.5 12.5v4h4M16.5 12.5v4h-4' />
      )}
    </svg>
  );
}

export type DisasterMapProps = {
  focusCountry?: string;
  enableZoom?: boolean;
  /**
   * Lead window to draw. Defaults to the store's `selectedWindow` — set it to
   * draw a window other than the selected one (the lead-window row).
   */
  window?: CrmaMrWindow;
  /**
   * Region values to colour by. When given (even `[]` while loading), the map
   * draws these and makes NO request of its own — the caller owns the fetch.
   * When omitted the map fetches for the store's selection, as before.
   */
  regions?: EmdatRegionDatum[];
  /** Map height in px. Defaults to the width-derived height (≈4:3, 300–620). */
  height?: number;
  /**
   * Bare, non-interactive drawing: no header, legend, tooltip, overlays or
   * keyboard targets, and the svg is hidden from assistive tech. For small
   * multiples placed inside a labelled control that owns the interaction.
   */
  bare?: boolean;
  /**
   * Risk Knowledge "all disasters" view: `regions` carry the number of EM-DAT
   * disasters per unit over the whole period (frequency), coloured on a scale
   * sized for totals; the most-reported unit(s) get an outline and a label.
   */
  allPeriod?: {
    /** e.g. "1990–2025" */
    label: string;
    /** GID_1 of the most-reported unit(s); ties allowed. */
    top: string[];
    /** Per-unit first / last year with a recorded disaster, for the tooltip. */
    years?: Map<string, [number, number]>;
  };
};

export function DisasterMap(
  { focusCountry, enableZoom, window: windowProp, regions: regionsProp, height, bare, allPeriod }:
    DisasterMapProps = {},
) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  // Zoom behaviour (for the control buttons) + last transform (preserved across
  // re-renders so zoom survives round changes). Only used when enableZoom.
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const zoomTransformRef = useRef<d3.ZoomTransform | null>(null);
  // Path generator of the current drawing, reused by the selection outline.
  const pathGenRef = useRef<d3.GeoPath<any, any> | null>(null);
  const { width } = useResizeObserver(containerRef, 960, 420);
  // Height follows the card width (≈4:3) so the map is never a thin strip on
  // wide screens nor overflowing on phones. Layout only.
  // A `height` prop (small multiples) overrides it.
  const mapH = height ?? Math.round(Math.min(620, Math.max(300, width * 0.75)));
  const { selectedEventKey, selectedMonth, selectedWindow: storeWindow, selectedBoundary,
          hazard, stage, setSelectedBoundary } = usePipelineStore();
  const selectedWindow = windowProp ?? storeWindow;
  const ownFetch = regionsProp === undefined;
  const [fetchedRegions, setRegions] = useState<EmdatRegionDatum[]>([]);
  const regions = regionsProp ?? fetchedRegions;
  // Parsed once per page and shared with every other map on it.
  const { topology, geojson, error: topoError } = useAdm1Topology();
  const [loading, setLoading] = useState(false);
  // UI-only flags: a failed fetch still sets regions [] exactly as before; the
  // flag only lets the map say "could not load" instead of "no data". (The API
  // answers 200 + empty regions for a date it does not hold, so a thrown
  // error here is a genuine failure, not an empty date.)
  const [loadError, setLoadError] = useState(false);
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [legendPref, setLegendPref] = useState<boolean | null>(null);

  const colorScale = useMemo(
    () => (allPeriod ? getTotalsColorScale(hazard) : getColorScale(hazard)),
    [hazard, allPeriod],
  );

  useEffect(() => {
    // The caller supplied the values: no request, and no state of ours to reset.
    if (!ownFetch) return;
    const isIbfFlood = hazard === 'flood' && stage === 'risk-monitoring';
    const isIbfDrought = hazard === 'drought' && stage === 'risk-monitoring';
    setLoadError(false);

    if (isIbfFlood) {
      // Use selectedMonth as the date key (YYYY-MM-DD for daily mode)
      if (!selectedMonth || !/^\d{4}-\d{2}-\d{2}$/.test(selectedMonth)) {
        setRegions([]);
        // Clear any in-flight spinner: a cancelled fetch never resets it, and
        // the "select a date" overlay must not sit under a stale "Loading".
        setLoading(false);
        return;
      }
      let cancelled = false;
      setLoading(true);
      // Two networks, split by date. Inside MR_RANGE the medium-range CRMA
      // answers per (init, window); before it, the legacy daily BN answers per
      // date. Both return the same `regions` schema — shapeID, frequency and
      // crma_state — so everything downstream is unchanged.
      const load = isMrInit(selectedMonth)
        ? fetchCrmaMrRegions(selectedMonth, (selectedWindow ?? 'D1') as CrmaMrWindow)
        : fetchIbfFloodRegions(selectedMonth);
      load
        .then((payload) => { if (!cancelled) setRegions(payload as EmdatRegionDatum[]); })
        .catch((error) => {
          console.error('Failed to load flood risk-monitoring regions', error);
          if (!cancelled) { setRegions([]); setLoadError(true); }
        })
        .finally(() => !cancelled && setLoading(false));
      return () => { cancelled = true; };
    }

    if (isIbfDrought) {
      // Drought is monthly: selectedMonth is YYYY-MM (slice off day if it's a date)
      const init = selectedMonth && /^\d{4}-\d{2}-\d{2}$/.test(selectedMonth)
        ? selectedMonth.slice(0, 7)
        : selectedMonth;
      if (!init || !/^\d{4}-\d{2}$/.test(init)) {
        setRegions([]);
        setLoading(false);
        return;
      }
      let cancelled = false;
      setLoading(true);
      fetchIbfDroughtRegions(init)
        .then((payload) => { if (!cancelled) setRegions(payload); })
        .catch((error) => {
          console.error('Failed to load IBF drought regions', error);
          if (!cancelled) { setRegions([]); setLoadError(true); }
        })
        .finally(() => !cancelled && setLoading(false));
      return () => { cancelled = true; };
    }

    if (!selectedEventKey) {
      setRegions([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchEmdatMonthRegions(selectedEventKey)
      .then((payload) => { if (!cancelled) setRegions(payload); })
      .catch((error) => {
        console.error('Failed to load region data', error);
        if (!cancelled) { setRegions([]); setLoadError(true); }
      })
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
    // selectedWindow is a dependency: the medium-range choropleth is keyed
    // (init, window), so changing the lead must refetch even though the date
    // has not moved.
  }, [selectedEventKey, selectedMonth, selectedWindow, hazard, stage, ownFetch]);

  const intensityById = useMemo(() => {
    const map = new Map<string, number>();
    regions.forEach((r) => map.set(r.shapeID, r.frequency));
    return map;
  }, [regions]);

  // shapeID → CRMA state, for traffic-light colouring of the IBF choropleth.
  const crmaById = useMemo(() => {
    const map = new Map<string, string>();
    regions.forEach((r) => { if (r.crma_state) map.set(r.shapeID, r.crma_state); });
    return map;
  }, [regions]);

  const regionById = useMemo(() => {
    const map = new Map<string, RegionDetail>();
    regions.forEach((r) => map.set(r.shapeID, r as RegionDetail));
    return map;
  }, [regions]);

  // Admin-1 features (parsed once, in useAdm1Topology) are used by the render
  // effect, the selection outline and the header chip.
  const featureByGid = useMemo(() => {
    const map = new Map<string, any>();
    geojson?.features.forEach((f: any) => map.set(String(f.properties.GID_1), f));
    return map;
  }, [geojson]);

  const isIbfFlood = hazard === 'flood' && stage === 'risk-monitoring';
  const isIbfDrought = hazard === 'drought' && stage === 'risk-monitoring';
  const isIbfClickable = isIbfFlood || isIbfDrought;
  // Same branch the fill callback takes for the belief ramp.
  const isMrFill = isIbfClickable && isMrInit(selectedMonth);

  // Plain-language reading of one unit, shared by the hover tooltip and the
  // screen-reader label so both always say the same thing.
  const describe = (gid: string): { value: string; detail?: string } => {
    if (!isIbfClickable) {
      const value = intensityById.get(gid) ?? 0;
      if (allPeriod) {
        const yrs = allPeriod.years?.get(gid);
        return {
          value: `${value} ${hazard} disaster${value === 1 ? '' : 's'} recorded, ${allPeriod.label}`,
          detail: allPeriod.top.includes(gid)
            ? 'Most reported region'
            : yrs ? (yrs[0] === yrs[1] ? `In ${yrs[0]}` : `Between ${yrs[0]} and ${yrs[1]}`) : undefined,
        };
      }
      return { value: `${value} ${value === 1 ? 'disaster' : 'disasters'} recorded` };
    }
    const r = regionById.get(gid);
    if (!r) return { value: 'No data' };
    const m = r as RegionDetail & { p_high_extreme?: number | null };
    const value = m.risk_level
      ? `${m.risk_level} risk${typeof m.p_high_extreme === 'number'
          ? ` · chance of High or Extreme ${m.p_high_extreme.toFixed(2)}` : ''}`
      : r.crma_state
        ? `CRMA state: ${r.crma_state.replace(/_/g, ' ')}`
        : `Risk level ${r.frequency}`;
    // The medium-range rollup inherits from its top basin rather than
    // localising. A state shown without its share is a basin maximum
    // presented as a location, so the share travels with the label.
    if (r.inherited && r.top_basin) {
      const pct = typeof r.top_basin_unit_share === 'number'
        ? `${(r.top_basin_unit_share * 100).toFixed(r.top_basin_unit_share < 0.1 ? 2 : 1)}%`
        : 'an unknown share';
      return {
        value,
        detail: `Inherited from river basin ${r.top_basin} — this region is ${pct} of that basin`,
      };
    }
    return { value };
  };
  // Latest closures for the d3 handlers (bound once per drawing of the paths).
  const describeRef = useRef(describe);
  describeRef.current = describe;
  // The store's setters are re-created on every state change (useMemo over the
  // whole state). Calling through a ref keeps them out of the render effect's
  // deps, so selecting a region no longer rebuilds all 227 paths (which also
  // dropped keyboard focus) — and the latest setter is always the one called.
  const setBoundaryRef = useRef(setSelectedBoundary);
  setBoundaryRef.current = setSelectedBoundary;

  // ── Tooltip positioning: direct DOM writes, no React render per mousemove ──
  const anchorRef = useRef<{ x: number; y: number } | null>(null);
  const placeTip = () => {
    const tip = tipRef.current;
    const canvas = canvasRef.current;
    const a = anchorRef.current;
    if (!tip || !canvas || !a) return;
    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;
    const tw = tip.offsetWidth;
    const th = tip.offsetHeight;
    const gap = 14;
    let x = a.x + gap;
    if (x + tw > cw - 4) x = Math.max(4, a.x - gap - tw);
    let y = a.y + gap;
    if (y + th > ch - 4) y = Math.max(4, a.y - gap - th);
    tip.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  };
  const placeTipRef = useRef(placeTip);
  placeTipRef.current = placeTip;
  // Re-place once the new content has laid out (its size changed).
  useLayoutEffect(() => { if (hover) placeTipRef.current(); }, [hover]);

  // Selection outline: a separate non-interactive path drawn above all units
  // (white halo + dark line), so it is never hidden under a neighbour's edge and
  // never fights the stylesheet's .adm-path stroke (which beat the old inline
  // stroke attribute, leaving the selection invisible). Re-ordering the
  // selected polygon itself would break keyboard focus and Tab order.
  const drawSelection = () => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    const f = selectedBoundary ? featureByGid.get(selectedBoundary) : null;
    const gen = pathGenRef.current;
    svg.selectAll<SVGPathElement, unknown>('.map-selection path')
      .attr('d', f && gen ? (gen(f) ?? null) : null);
    svg.selectAll<SVGPathElement, any>('path.adm-path[role="button"]')
      .attr('aria-pressed', (d: any) => String(d?.properties?.GID_1 === selectedBoundary));
  };
  const drawSelectionRef = useRef(drawSelection);
  drawSelectionRef.current = drawSelection;

  useEffect(() => {
    if (!svgRef.current || !geojson) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    // Optional country focus: zoom the projection to one country's admin-1s so
    // small countries (Burundi, Rwanda, Djibouti) fill the frame. All polygons
    // are still drawn (neighbours show as context, clipped by the viewport).
    const focusFeatures = focusCountry
      ? geojson.features.filter((f: any) => String(f.properties.GID_1).startsWith(`${focusCountry}.`))
      : geojson.features;
    const fitGeo =
      focusCountry && focusFeatures.length
        ? { type: 'FeatureCollection', features: focusFeatures }
        : geojson;
    // Neighbours stay drawn as context (see above) but are muted: flat grey, no
    // risk colour, no tooltip, not clickable — so a group in a Uganda round is
    // not reading Kenya's risk. Without focusCountry every unit is in focus and
    // the dashboard map is unchanged.
    const inFocus = (d: any) =>
      !focusCountry || String(d?.properties?.GID_1 ?? '').startsWith(`${focusCountry}.`);
    const projection = d3.geoMercator().fitSize([width, mapH], fitGeo as any);
    const path = d3.geoPath(projection);
    pathGenRef.current = path;

    svg.attr('width', width).attr('height', mapH);

    // Single transform layer so zoom/pan moves polygons + graticule together.
    const zoomLayer = svg.append('g').attr('class', 'zoom-layer');

    const polygons = zoomLayer
      .append('g')
      .selectAll('path')
      .data(geojson.features)
      .enter()
      .append('path')
      .attr('class', (d: any) => (inFocus(d) ? 'adm-path' : 'adm-path map-context-path'))
      .attr('d', path as any)
      .attr('fill', (d: any) => {
        if (!inFocus(d)) return CONTEXT_FILL;
        const gid = d.properties.GID_1;
        // IBF risk-monitoring: traffic-light by CRMA state (green→red).
        // The medium-range feed has no crma_state to colour — the decision layer
        // was removed. It carries a belief instead, risk_level_int 1..5, which
        // arrives as `frequency`. Sequential ramp, same reasoning as the
        // calendar: a traffic light would assert a boundary this feed does not
        // hold. The legacy networks keep theirs, because theirs is a decision.
        if (isIbfClickable) {
          if (isMrInit(selectedMonth)) return riskLevelColor(intensityById.get(gid));
          return crmaColor(crmaById.get(gid));
        }
        // EMDAT risk-knowledge: sequential frequency scale.
        const value = intensityById.get(gid) ?? 0;
        return colorScale(value);
      });

    // Interaction and tooltips only on in-focus units; context units are inert.
    const focusPolygons = focusCountry
      ? polygons.filter((d: any) => inFocus(d))
      : polygons;
    polygons.filter((d: any) => !inFocus(d)).style('pointer-events', 'none');

    // Bare small multiple: drawing only. No hover, no keyboard targets — the
    // control wrapping it is the one interactive element.
    const interactive = !bare;

    // Hover tooltip (all stages): React state changes only on enter/leave; the
    // position is written straight to the tooltip element. Paths are never
    // re-rendered by hovering.
    const showTip = (el: SVGPathElement, d: any, x: number, y: number) => {
      anchorRef.current = { x, y };
      d3.select(el).classed('is-hover', true);
      setHover({
        gid: String(d.properties.GID_1),
        name: String(d.properties.NAME_1 ?? d.properties.GID_1),
        fill: el.getAttribute('fill') ?? '',
      });
      placeTipRef.current();
    };
    const hideTip = (el: SVGPathElement) => {
      d3.select(el).classed('is-hover', false);
      setHover(null);
    };
    const localPoint = (event: PointerEvent) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      return rect ? { x: event.clientX - rect.left, y: event.clientY - rect.top } : { x: 0, y: 0 };
    };
    if (interactive) focusPolygons
      .on('pointerenter', function (this: SVGPathElement, event: PointerEvent, d: any) {
        const p = localPoint(event);
        showTip(this, d, p.x, p.y);
      })
      .on('pointermove', (event: PointerEvent) => {
        anchorRef.current = localPoint(event);
        placeTipRef.current();
      })
      .on('pointerleave', function (this: SVGPathElement) { hideTip(this); });

    if (isIbfClickable && interactive) {
      // Keyboard access: each in-focus unit is a button (Tab to reach,
      // Enter/Space to select) — the same setter a click uses.
      focusPolygons
        .style('cursor', 'pointer')
        .attr('tabindex', 0)
        .attr('role', 'button')
        .attr('aria-label', (d: any) => {
          const gid = String(d.properties.GID_1);
          const info = describeRef.current(gid);
          return `${d.properties.NAME_1}, ${countryOf(gid)}: ${info.value}`
               + `${info.detail ? `. ${info.detail}` : ''}`;
        })
        .on('click', (_event: MouseEvent, d: any) => {
          setBoundaryRef.current(d.properties.GID_1 as string);
        })
        .on('keydown', (event: KeyboardEvent, d: any) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setBoundaryRef.current(d.properties.GID_1 as string);
          }
        })
        .on('focus', function (this: SVGPathElement, _event: FocusEvent, d: any) {
          const rect = canvasRef.current?.getBoundingClientRect();
          const b = this.getBoundingClientRect();
          if (!rect) return;
          showTip(this, d, b.left + b.width / 2 - rect.left, b.top + b.height / 2 - rect.top);
          // Keyboard focus ring as an overlay (like the selection): a stroke on
          // the polygon itself is half-covered by later-drawn neighbours.
          if (this.matches(':focus-visible')) {
            svg.selectAll('.map-focus-ring path').attr('d', path(d) ?? null);
          }
        })
        .on('blur', function (this: SVGPathElement) {
          hideTip(this);
          svg.selectAll('.map-focus-ring path').attr('d', null);
        });
    }

    // Focus-country outline: the mesh of arcs on the country's edge (between a
    // focus unit and a non-focus unit, or a focus unit and nothing). Drawn on
    // top of the polygons, non-interactive, constant width under zoom.
    if (focusCountry && focusFeatures.length) {
      const obj = topology.objects.icpac_adm1v3;
      const outline = mesh(topology, obj, (a: any, b: any) =>
        a === b ? inFocus(a) : inFocus(a) !== inFocus(b));
      zoomLayer
        .append('path')
        .datum(outline)
        .attr('class', 'map-focus-outline')
        .attr('d', path as any);
    }

    zoomLayer
      .append('path')
      .datum(d3.geoGraticule10())
      .attr('class', 'graticule')
      .attr('d', path as any);

    // Selected-unit outline layer (its geometry is set by drawSelection).
    // All-period view: outline the most-reported unit(s).
    if (allPeriod && allPeriod.top.length) {
      const topLayer = zoomLayer.append('g').attr('class', 'map-top');
      const feats = (geojson.features as any[]).filter((f) => allPeriod.top.includes(String(f.properties.GID_1)));
      topLayer.selectAll('path.map-top__halo').data(feats).enter().append('path')
        .attr('class', 'map-top__halo').attr('d', path as any);
      topLayer.selectAll('path.map-top__line').data(feats).enter().append('path')
        .attr('class', 'map-top__line').attr('d', path as any);
    }
    const sel = zoomLayer.append('g').attr('class', 'map-selection');
    sel.append('path').attr('class', 'map-selection__halo');
    sel.append('path').attr('class', 'map-selection__line');
    drawSelectionRef.current();
    const ring = zoomLayer.append('g').attr('class', 'map-focus-ring');
    ring.append('path').attr('class', 'map-focus-ring__halo');
    ring.append('path').attr('class', 'map-focus-ring__line');

    // Opt-in zoom + pan (wheel / drag / pinch). Gated so the dashboard map does
    // not capture page scroll. Boundary clicks still fire (a click isn't a
    // drag). The last transform is re-applied so zoom persists when the
    // round/data re-renders.
    if (enableZoom && !bare) {
      const zoom = d3
        .zoom<SVGSVGElement, unknown>()
        .scaleExtent([1, 12])
        .extent([[0, 0], [width, mapH]])
        .translateExtent([[0, 0], [width, mapH]])
        .on('zoom', (event) => {
          zoomLayer.attr('transform', event.transform.toString());
          zoomTransformRef.current = event.transform;
          setHover(null); // the tooltip would point at a moved shape
        });
      svg.call(zoom).style('cursor', 'grab');
      zoomRef.current = zoom;
      if (zoomTransformRef.current) {
        svg.call(zoom.transform, zoomTransformRef.current); // restore prior zoom
      }
    } else {
      zoomRef.current = null;
    }
    // Drop a tooltip left over from the previous drawing.
    setHover(null);
  }, [intensityById, crmaById, geojson, width, mapH, colorScale, isIbfClickable, regions, focusCountry, enableZoom, bare, allPeriod]);

  // A ?boundary= carrying an admin-1 NAME rather than a GID_1 is resolved once
  // the regions load, and the URL is rewritten to the GID. Names are what a
  // person types or copies out of a report; GID_1 is what every payload keys
  // on. Accepting both and normalising to one keeps the address honest without
  // making the reader learn the identifier scheme.
  useEffect(() => {
    if (bare) return;   // the full map on the page does this once
    if (!selectedBoundary || !regions.length) return;
    if (/^[A-Z]{3}\.\d+_\d+$/.test(selectedBoundary)) return;   // already a GID_1
    const wanted = selectedBoundary.trim().toLowerCase();
    const hit = regions.find((r) => (r.shapeName ?? '').trim().toLowerCase() === wanted);
    if (hit) setSelectedBoundary(hit.shapeID);
  }, [selectedBoundary, regions, setSelectedBoundary, bare]);

  // Outline the selected unit. Deliberately its own effect touching only the
  // selection layer: putting selectedBoundary in the render effect above would
  // re-run the whole d3 join — and the projection and zoom with it — on every
  // click.
  useEffect(() => {
    drawSelectionRef.current();
  }, [selectedBoundary, featureByGid, width, mapH, regions]);

  const zoomBy = (k: number) => {
    if (!svgRef.current || !zoomRef.current) return;
    d3.select(svgRef.current).transition().duration(250).call(zoomRef.current.scaleBy, k);
  };
  const resetZoom = () => {
    zoomTransformRef.current = null;
    if (svgRef.current && zoomRef.current) {
      d3.select(svgRef.current)
        .transition()
        .duration(300)
        .call(zoomRef.current.transform, d3.zoomIdentity);
    }
  };

  // In-map state message. Mirrors the fetch effect's own date checks so the
  // overlay says exactly why the map is empty. Order matters: a missing date
  // outranks a (possibly stale) spinner.
  const hasDate = isIbfFlood
    ? !!selectedMonth && /^\d{4}-\d{2}-\d{2}$/.test(selectedMonth)
    : isIbfDrought
      ? !!selectedMonth && /^\d{4}-\d{2}(-\d{2})?$/.test(selectedMonth)
      : allPeriod ? true : !!selectedEventKey;
  const overlay: Overlay | null = topoError
    ? { kind: 'error', text: 'The map boundaries could not be loaded. Reload the page to try again.' }
    : !topology
      ? { kind: 'loading', text: 'Loading map…' }
      : !hasDate
        ? {
            kind: 'prompt',
            text: isIbfClickable
              ? 'Select a date in the calendar to see the risk map'
              : selectedMonth
                ? 'Now pick an event from the list below the calendar to map its affected regions'
                : 'Pick a month in the calendar, then an event from the list, to see affected regions',
          }
        : loading
          ? { kind: 'loading', text: isIbfClickable ? 'Loading risk map…' : 'Loading map…' }
          : loadError
            ? {
                kind: 'error',
                text: isIbfClickable
                  ? 'The risk map for this date could not be loaded. Check the connection, then pick another date or reload the page.'
                  : 'The regions for this event could not be loaded. Check the connection, then pick another event or reload the page.',
              }
            : regions.length === 0
              ? {
                  kind: 'empty',
                  text: isIbfClickable ? 'No data for this date'
                    : allPeriod ? 'No disasters recorded for this period' : 'No regions recorded for this event',
                }
              : null;

  // ── Legend: built from the same colour functions + branch as the fill ─────
  const hz = hazard === 'drought' ? 'Drought' : 'Flood';
  const legend: MapLegendSpec = (() => {
    let spec: MapLegendSpec;
    if (isMrFill) {
      const lead = LEAD_LABEL[selectedWindow ?? 'D1'] ?? selectedWindow ?? 'day 1';
      spec = {
        title: `${hz} risk level — medium-range belief`,
        note: `Most likely level, ${lead} ahead. CRMA applies no threshold.`,
        items: [
          ...RISK_LEVELS.map((label, i) => ({ label, color: riskLevelColor(i + 1) })),
          { label: 'No data', color: riskLevelColor(null) },
        ],
      };
    } else if (isIbfClickable) {
      spec = {
        title: hazard === 'drought'
          ? 'CRMA state — drought (monthly BN)'
          : 'CRMA state — daily flood BN',
        items: [
          ...Object.keys(CRMA_TRAFFIC).map((s) => ({ label: s.replace(/_/g, ' '), color: crmaColor(s) })),
          { label: 'No data', color: crmaColor(null) },
        ],
      };
    } else {
      // Bins straight from the threshold scale: range[i] covers
      // [domain[i-1], domain[i]). The lowest bin (0) is also "none recorded".
      const dom = colorScale.domain();
      const items: MapLegendItem[] = colorScale.range().map((color, i) => {
        const lo = i === 0 ? 0 : dom[i - 1];
        const hi = i < dom.length ? dom[i] : Infinity;
        const label = i === 0
          ? '0 / none'
          : hi === Infinity
            ? `${lo}+`
            : hi - lo === 1 ? `${lo}` : `${lo}–${hi - 1}`;
        return { label, color };
      });
      spec = allPeriod
        ? {
            title: `EM-DAT ${hazard} disasters per region, ${allPeriod.label}`,
            note: 'Outlined: the most reported region.',
            items,
          }
        : { title: `EM-DAT ${hazard} disasters per region`, items };
    }
    if (focusCountry) {
      spec.items = [
        ...spec.items,
        { label: `Outside ${COUNTRY_NAMES[focusCountry] ?? focusCountry}`, color: CONTEXT_FILL },
      ];
    }
    return spec;
  })();
  // Narrow map cards (phones, the scenario runner's side column): the legend
  // moves BELOW the map so it never covers data, and the header stacks.
  const compact = width < 600;
  // All-period view: the legend goes below the map too, so it never covers the
  // outlined most-reported region (often on the coast, under the corner box).
  const legendOpen = legendPref ?? true;
  const showLegend = !!topology && hasDate && !topoError && !loadError;

  const selectedFeature = selectedBoundary ? featureByGid.get(selectedBoundary) : null;
  const dateLabel = isIbfClickable ? formatSelected(selectedMonth ?? null) : null;
  const hoverInfo = hover ? describe(hover.gid) : null;

  if (bare) {
    return (
      <div className='map-mini' ref={containerRef} style={{ height: mapH }}>
        <svg ref={svgRef} aria-hidden='true' focusable='false'
             className={!topology || topoError ? 'is-muted' : undefined} />
      </div>
    );
  }

  return (
    <div className='card map-card' ref={containerRef}>
      <div className={`card__header map-header${compact ? ' map-header--stacked' : ''}`}>
        <div className='map-header__titles'>
          <p className='ds-eyebrow map-eyebrow'>
            {isIbfClickable ? 'Map · admin-1 regions'
              : allPeriod ? `Map · EM-DAT, all disasters ${allPeriod.label}`
              : 'Map · EM-DAT recorded events'}
          </p>
          <h3 className='ds-card__title map-title'>
            {isIbfClickable ? `${hz} risk by region`
              : allPeriod ? `Where ${hazard} disasters were reported most`
              : 'Regions affected by the selected event'}
          </h3>
        </div>
        <div className='map-header__meta'>
          {allPeriod && allPeriod.top.length > 0 && (
            <span className='map-top-chip'>
              <span className='map-top-chip__k'>Most reported</span>{' '}
              {allPeriod.top
                .map((g) => `${featureByGid.get(g)?.properties.NAME_1 ?? g}, ${countryOf(g)}`)
                .join(' · ')}
              {' — '}
              <strong>{intensityById.get(allPeriod.top[0]) ?? 0}</strong> {hazard} disasters
            </span>
          )}
          {dateLabel && (
            <span className='map-date'>
              <span className='ds-visually-hidden'>Map date: </span>{dateLabel}
            </span>
          )}
          {isIbfClickable && selectedBoundary && selectedFeature && (
            <span className='map-chip'>
              <span className='map-chip__label'>
                <span className='ds-visually-hidden'>Selected region: </span>
                {selectedFeature.properties.NAME_1}
                <span className='map-chip__country'>, {countryOf(selectedBoundary)}</span>
              </span>
              <button
                type='button'
                className='map-chip__clear'
                aria-label={`Clear selected region ${selectedFeature.properties.NAME_1}`}
                title='Clear selection'
                onClick={() => setSelectedBoundary(null)}
              >
                <svg aria-hidden='true' viewBox='0 0 16 16' width='12' height='12'>
                  <path d='M4 4l8 8M12 4l-8 8' stroke='currentColor' strokeWidth='2' strokeLinecap='round' />
                </svg>
              </button>
            </span>
          )}
        </div>
      </div>
      <div
        ref={canvasRef}
        className={`map-canvas${overlay ? ' map-canvas--muted' : ''}`}
        style={{ minHeight: mapH }}
      >
        <svg
          ref={svgRef}
          {...(isIbfClickable
            ? {
                role: 'group',
                'aria-label': `${hz} risk map by admin-1 region. Tab to a region and press Enter to open its details.`,
              }
            : { role: 'img', 'aria-label': 'Map of admin-1 regions affected by the selected EM-DAT event' })}
        />

        {enableZoom && (
          <div className='map-controls' role='group' aria-label='Map zoom'>
            <button type='button' className='ds-btn ds-btn--secondary ds-btn--icon map-controls__btn'
                    aria-label='Zoom in' title='Zoom in' onClick={() => zoomBy(1.6)}>
              <ZoomIcon kind='in' />
            </button>
            <button type='button' className='ds-btn ds-btn--secondary ds-btn--icon map-controls__btn'
                    aria-label='Zoom out' title='Zoom out' onClick={() => zoomBy(1 / 1.6)}>
              <ZoomIcon kind='out' />
            </button>
            <button type='button' className='ds-btn ds-btn--secondary ds-btn--icon map-controls__btn'
                    aria-label='Reset map view' title='Reset view (scroll or pinch to zoom, drag to pan)'
                    onClick={resetZoom}>
              <ZoomIcon kind='reset' />
            </button>
          </div>
        )}

        {showLegend && !compact && !allPeriod && (
          <MapLegend
            spec={legend}
            open={legendOpen}
            placement='overlay'
            onToggle={() => setLegendPref(!legendOpen)}
          />
        )}

        <div ref={tipRef} className='map-tooltip' aria-hidden='true' hidden={!hover}>
          {hover && hoverInfo && (
            <>
              <p className='map-tooltip__name'>{hover.name}</p>
              <p className='map-tooltip__country'>{countryOf(hover.gid)}</p>
              <p className='map-tooltip__value'>
                <span className='ds-swatch' style={{ background: hover.fill }} />
                {hoverInfo.value}
              </p>
              {hoverInfo.detail && <p className='map-tooltip__detail'>{hoverInfo.detail}</p>}
              {isIbfClickable && (
                <p className='map-tooltip__hint'>
                  {hover.gid === selectedBoundary ? 'Selected · details below' : 'Click for details'}
                </p>
              )}
            </>
          )}
        </div>

        {overlay && (
          <div className='map-overlay' role='status' aria-live='polite'>
            <div className={`map-overlay__msg ds-state${overlay.kind === 'error' ? ' ds-state--error' : ''}`}>
              {overlay.kind === 'loading' && <span className='ds-spinner' aria-hidden='true' />}
              {overlay.kind === 'error' && <p className='ds-state__title'>Couldn’t load the map</p>}
              <span>{overlay.text}</span>
            </div>
          </div>
        )}
      </div>
      {showLegend && (compact || !!allPeriod) && (
        <MapLegend
          spec={legend}
          open={legendOpen}
          placement='below'
          onToggle={() => setLegendPref(!legendOpen)}
        />
      )}
    </div>
  );
}
