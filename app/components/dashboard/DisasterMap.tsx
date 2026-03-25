'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { feature } from 'topojson-client';
import { usePipelineStore } from 'app/store/providers/pipeline';
import { fetchEmdatMonthRegions } from 'app/lib/api/emdat';
import type { EmdatRegionDatum } from 'app/types/emdat';
import { useResizeObserver } from 'app/utilities/hooks/useResizeObserver';
import { getColorScale } from 'app/lib/colors';

export function DisasterMap() {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { width } = useResizeObserver(containerRef, 960, 420);
  const { selectedEventKey, hazard } = usePipelineStore();
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
    if (!selectedEventKey) {
      setRegions([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchEmdatMonthRegions(selectedEventKey)
      .then((payload) => {
        if (!cancelled) setRegions(payload);
      })
      .catch((error) => {
        console.error('Failed to load region data', error);
        if (!cancelled) setRegions([]);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [selectedEventKey]);

  const intensityById = useMemo(() => {
    const map = new Map<string, number>();
    regions.forEach((r) => map.set(r.shapeID, r.frequency));
    return map;
  }, [regions]);

  useEffect(() => {
    if (!svgRef.current || !topology) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const geojson: any = feature(topology, topology.objects.icpac_adm1v3);
    const projection = d3.geoMercator().fitSize([width, 420], geojson);
    const path = d3.geoPath(projection);

    svg.attr('width', width).attr('height', 420);

    svg
      .append('g')
      .selectAll('path')
      .data(geojson.features)
      .enter()
      .append('path')
      .attr('class', 'adm-path')
      .attr('d', path as any)
      .attr('fill', (d: any) => {
        const value = intensityById.get(d.properties.GID_1) ?? 0;
        return colorScale(value);
      })
      .append('title')
      .text((d: any) => {
        const value = intensityById.get(d.properties.GID_1) ?? 0;
        return `${d.properties.NAME_1} — ${value} events`;
      });

    svg
      .append('path')
      .datum(d3.geoGraticule10())
      .attr('class', 'graticule')
      .attr('d', path as any);
  }, [intensityById, topology, width, colorScale]);

  return (
    <div className='card map-card' ref={containerRef}>
      <div className='card__header'>
        <div>
          <p className='eyebrow'>Affected Regions</p>
          <h3>Admin1 Frequency Choropleth</h3>
        </div>
        {loading && <span className='usa-tag usa-tag--warm'>Loading</span>}
      </div>
      <svg ref={svgRef} role='img' aria-label='Admin1 region choropleth' />
    </div>
  );
}
