'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { feature } from 'topojson-client';
import { usePipelineStore } from 'app/store/providers/pipeline';
import { fetchEmdatMonthRegions, fetchIbfFloodRegions, fetchIbfDroughtRegions } from 'app/lib/api/emdat';
import type { EmdatRegionDatum } from 'app/types/emdat';
import { useResizeObserver } from 'app/utilities/hooks/useResizeObserver';
import { getColorScale, crmaColor } from 'app/lib/colors';

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

export function DisasterMap() {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { width } = useResizeObserver(containerRef, 960, 420);
  const { selectedEventKey, selectedMonth, hazard, stage, setSelectedBoundary } = usePipelineStore();
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
      fetchIbfFloodRegions(selectedMonth)
        .then((payload) => { if (!cancelled) setRegions(payload); })
        .catch((error) => {
          console.error('Failed to load IBF flood regions', error);
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
  }, [selectedEventKey, selectedMonth, hazard, stage]);

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
    const projection = d3.geoMercator().fitSize([width, 420], geojson);
    const path = d3.geoPath(projection);

    svg.attr('width', width).attr('height', 420);

    const polygons = svg
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
        if (isIbfClickable) return crmaColor(crmaById.get(gid));
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
        const r = regions.find((x) => x.shapeID === d.properties.GID_1);
        const label = r
          ? (r.crma_state ? r.crma_state.replace(/_/g, ' ') : `Risk level ${r.frequency}`)
          : 'No data';
        return `${d.properties.NAME_1} — ${label}`;
      });
    } else {
      polygons.append('title').text((d: any) => {
        const value = intensityById.get(d.properties.GID_1) ?? 0;
        return `${d.properties.NAME_1} — ${value} events`;
      });
    }

    svg
      .append('path')
      .datum(d3.geoGraticule10())
      .attr('class', 'graticule')
      .attr('d', path as any);
  }, [intensityById, crmaById, topology, width, colorScale, isIbfClickable, regions, setSelectedBoundary]);

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
          {isIbfClickable && formatSelected(selectedMonth) && (
            <span style={{ fontSize: '1.15rem', fontWeight: 700, color: '#111827',
                           letterSpacing: '0.01em' }}>
              {formatSelected(selectedMonth)}
            </span>
          )}
          {loading && <span className='usa-tag usa-tag--warm'>Loading</span>}
        </div>
      </div>
      <svg ref={svgRef} role='img' aria-label='Admin1 region choropleth' />
    </div>
  );
}
