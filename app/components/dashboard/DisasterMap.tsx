'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { feature } from 'topojson-client';
import { usePipelineStore } from 'app/store/providers/pipeline';
import {
  fetchEmdatMonthRegions,
  fetchIbfFloodRegions,
  fetchIbfDroughtRegions,
  fetchCrmaMrRegions,
} from 'app/lib/api/emdat';
import type { EmdatRegionDatum } from 'app/types/emdat';
import type { CrmaMrWindow } from 'app/types/crma-mr';
import { isMrInit } from 'app/lib/crma-mr-range';
import { useResizeObserver } from 'app/utilities/hooks/useResizeObserver';
import { getColorScale, crmaColor, riskLevelColor } from 'app/lib/colors';

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

export function DisasterMap(
  { focusCountry, enableZoom }: { focusCountry?: string; enableZoom?: boolean } = {},
) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // Zoom behaviour (for the reset button) + last transform (preserved across
  // re-renders so zoom survives round changes). Only used when enableZoom.
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const zoomTransformRef = useRef<d3.ZoomTransform | null>(null);
  const { width } = useResizeObserver(containerRef, 960, 420);
  const { selectedEventKey, selectedMonth, selectedWindow, selectedBoundary, hazard, stage,
          setSelectedBoundary } = usePipelineStore();
  const [regions, setRegions] = useState<EmdatRegionDatum[]>([]);
  const [topology, setTopology] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const colorScale = useMemo(() => getColorScale(hazard), [hazard]);

  useEffect(() => {
    if (topology) return;
    fetch('/icpac_adm1v3.json')
      .then((res) => res.json())
      .then((data) => setTopology(data))
      .catch((error) => console.error('Failed to load Admin1 topojson', error));
  }, [topology]);

  useEffect(() => {
    const isIbfFlood = hazard === 'flood' && stage === 'risk-monitoring';
    const isIbfDrought = hazard === 'drought' && stage === 'risk-monitoring';

    if (isIbfFlood) {
      // Use selectedMonth as the date key (YYYY-MM-DD for daily mode)
      if (!selectedMonth || !/^\d{4}-\d{2}-\d{2}$/.test(selectedMonth)) {
        setRegions([]);
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
          if (!cancelled) setRegions([]);
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
        return;
      }
      let cancelled = false;
      setLoading(true);
      fetchIbfDroughtRegions(init)
        .then((payload) => { if (!cancelled) setRegions(payload); })
        .catch((error) => {
          console.error('Failed to load IBF drought regions', error);
          if (!cancelled) setRegions([]);
        })
        .finally(() => !cancelled && setLoading(false));
      return () => { cancelled = true; };
    }

    if (!selectedEventKey) {
      setRegions([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchEmdatMonthRegions(selectedEventKey)
      .then((payload) => { if (!cancelled) setRegions(payload); })
      .catch((error) => {
        console.error('Failed to load region data', error);
        if (!cancelled) setRegions([]);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
    // selectedWindow is a dependency: the medium-range choropleth is keyed
    // (init, window), so changing the lead must refetch even though the date
    // has not moved.
  }, [selectedEventKey, selectedMonth, selectedWindow, hazard, stage]);

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

  const isIbfFlood = hazard === 'flood' && stage === 'risk-monitoring';
  const isIbfDrought = hazard === 'drought' && stage === 'risk-monitoring';
  const isIbfClickable = isIbfFlood || isIbfDrought;

  useEffect(() => {
    if (!svgRef.current || !topology) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const geojson: any = feature(topology, topology.objects.icpac_adm1v3);
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
    const projection = d3.geoMercator().fitSize([width, 420], fitGeo as any);
    const path = d3.geoPath(projection);

    svg.attr('width', width).attr('height', 420);

    // Single transform layer so zoom/pan moves polygons + graticule together.
    const zoomLayer = svg.append('g').attr('class', 'zoom-layer');

    const polygons = zoomLayer
      .append('g')
      .selectAll('path')
      .data(geojson.features)
      .enter()
      .append('path')
      .attr('class', 'adm-path')
      .attr('d', path as any)
      .attr('fill', (d: any) => {
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

    if (isIbfClickable) {
      polygons
        .style('cursor', 'pointer')
        .on('click', (_event: MouseEvent, d: any) => {
          setSelectedBoundary(d.properties.GID_1 as string);
        });
      polygons.append('title').text((d: any) => {
        const r = regions.find((x) => x.shapeID === d.properties.GID_1) as
          | (EmdatRegionDatum & {
              inherited?: boolean; top_basin?: string; top_basin_unit_share?: number | null;
            })
          | undefined;
        const m = r as (typeof r) & { risk_level?: string; p_high_extreme?: number | null };
        const label = !r
          ? 'No data'
          : m.risk_level
            ? `${m.risk_level}${typeof m.p_high_extreme === 'number'
                ? ` — P(High∪Extreme) ${m.p_high_extreme.toFixed(2)}` : ''}`
            : r.crma_state
              ? r.crma_state.replace(/_/g, ' ')
              : `Risk level ${r.frequency}`;
        // The medium-range rollup inherits from its top basin rather than
        // localising. A state shown without its share is a basin maximum
        // presented as a location, so the share travels in the tooltip.
        if (r?.inherited && r.top_basin) {
          const pct = typeof r.top_basin_unit_share === 'number'
            ? `${(r.top_basin_unit_share * 100).toFixed(r.top_basin_unit_share < 0.1 ? 2 : 1)}%`
            : 'unknown share';
          return `${d.properties.NAME_1} — ${label}\n`
               + `inherited from basin ${r.top_basin} (this unit is ${pct} of it)`;
        }
        return `${d.properties.NAME_1} — ${label}`;
      });
    } else {
      polygons.append('title').text((d: any) => {
        const value = intensityById.get(d.properties.GID_1) ?? 0;
        return `${d.properties.NAME_1} — ${value} events`;
      });
    }

    zoomLayer
      .append('path')
      .datum(d3.geoGraticule10())
      .attr('class', 'graticule')
      .attr('d', path as any);

    // Opt-in zoom + pan (wheel / drag / pinch). Gated so the dashboard map is
    // unchanged. Boundary clicks still fire (a click isn't a drag). The last
    // transform is re-applied so zoom persists when the round/data re-renders.
    if (enableZoom) {
      const zoom = d3
        .zoom<SVGSVGElement, unknown>()
        .scaleExtent([1, 12])
        .extent([[0, 0], [width, 420]])
        .translateExtent([[0, 0], [width, 420]])
        .on('zoom', (event) => {
          zoomLayer.attr('transform', event.transform.toString());
          zoomTransformRef.current = event.transform;
        });
      svg.call(zoom).style('cursor', 'grab');
      zoomRef.current = zoom;
      if (zoomTransformRef.current) {
        svg.call(zoom.transform, zoomTransformRef.current); // restore prior zoom
      }
    }
  }, [intensityById, crmaById, topology, width, colorScale, isIbfClickable, regions, setSelectedBoundary, focusCountry, enableZoom]);

  // A ?boundary= carrying an admin-1 NAME rather than a GID_1 is resolved once
  // the regions load, and the URL is rewritten to the GID. Names are what a
  // person types or copies out of a report; GID_1 is what every payload keys
  // on. Accepting both and normalising to one keeps the address honest without
  // making the reader learn the identifier scheme.
  useEffect(() => {
    if (!selectedBoundary || !regions.length) return;
    if (/^[A-Z]{3}\.\d+_\d+$/.test(selectedBoundary)) return;   // already a GID_1
    const wanted = selectedBoundary.trim().toLowerCase();
    const hit = regions.find((r) => (r.shapeName ?? '').trim().toLowerCase() === wanted);
    if (hit) setSelectedBoundary(hit.shapeID);
  }, [selectedBoundary, regions, setSelectedBoundary]);

  // Outline the selected unit. Deliberately its own effect touching only the
  // stroke of already-drawn paths: putting selectedBoundary in the render
  // effect above would re-run the whole d3 join — and the projection and zoom
  // with it — on every click.
  useEffect(() => {
    if (!svgRef.current) return;
    d3.select(svgRef.current)
      .selectAll<SVGPathElement, any>('path.adm-path')
      // null removes the inline attribute rather than guessing a default, so
      // unselected polygons keep whatever the stylesheet gives them.
      .attr('stroke', (d: any) =>
        d?.properties?.GID_1 === selectedBoundary ? '#111827' : null)
      .attr('stroke-width', (d: any) =>
        d?.properties?.GID_1 === selectedBoundary ? 1.8 : null);
  }, [selectedBoundary, topology, width, regions]);

  return (
    <div className='card map-card' ref={containerRef}>
      <div className='card__header'>
        <div>
          {isIbfClickable ? (
            <h3>Risk Monitoring</h3>
          ) : (
            <>
              <p className='eyebrow'>Affected Regions</p>
              <h3>Admin1 Frequency Choropleth</h3>
            </>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {enableZoom && (
            <>
              <span className='font-mono-3xs text-base-dark'>scroll / pinch to zoom · drag to pan</span>
              <button
                type='button'
                className='usa-button usa-button--outline usa-button--small'
                onClick={() => {
                  zoomTransformRef.current = null;
                  if (svgRef.current && zoomRef.current) {
                    d3.select(svgRef.current)
                      .transition()
                      .duration(300)
                      .call(zoomRef.current.transform, d3.zoomIdentity);
                  }
                }}
              >
                Reset
              </button>
            </>
          )}
          {isIbfClickable && formatSelected(selectedMonth ?? null) && (
            <span style={{ fontSize: '1.15rem', fontWeight: 700, color: '#111827',
                           letterSpacing: '0.01em' }}>
              {formatSelected(selectedMonth ?? null)}
            </span>
          )}
          {loading && <span className='usa-tag usa-tag--warm'>Loading</span>}
        </div>
      </div>
      <svg ref={svgRef} role='img' aria-label='Admin1 region choropleth' />
    </div>
  );
}
