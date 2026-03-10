'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { feature } from 'topojson-client';
import { usePipelineStore } from 'app/store/providers/pipeline';
import { fetchEmdatMonthRegions } from 'app/lib/api/emdat';
import type { EmdatRegionDatum } from 'app/types/emdat';
import { useResizeObserver } from 'app/utilities/hooks/useResizeObserver';

const colorScale = d3
  .scaleThreshold<number, string>()
  .domain([1, 2, 4, 6, 8, 10])
  .range(['#e8e8e8', '#ffffcc', '#fed976', '#ffb24b', '#fd4e2a', '#e3181a', '#800026']);

export function DisasterMap() {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { width } = useResizeObserver(containerRef, 960, 420);
  const { selectedEventKey } = usePipelineStore();
  const [regions, setRegions] = useState<EmdatRegionDatum[]>([]);
  const [topology, setTopology] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (topology) return;
    fetch('/ea_adm2.topojson')
      .then((res) => res.json())
      .then((data) => setTopology(data))
      .catch((error) => console.error('Failed to load Admin2 topojson', error));
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
        if (!cancelled) {
          setRegions(payload);
        }
      })
      .catch((error) => {
        console.error('Failed to load region data - using mock data', error);
        // Mock region data for demonstration
        if (!cancelled) {
          const mockRegions: EmdatRegionDatum[] = [
            { shapeID: 'ETH-001', shapeName: 'Region 1', shapeGroup: 'Ethiopia', frequency: 5 },
            { shapeID: 'ETH-002', shapeName: 'Region 2', shapeGroup: 'Ethiopia', frequency: 8 },
            { shapeID: 'ETH-003', shapeName: 'Region 3', shapeGroup: 'Ethiopia', frequency: 3 },
            { shapeID: 'KEN-001', shapeName: 'Region 1', shapeGroup: 'Kenya', frequency: 6 },
            { shapeID: 'KEN-002', shapeName: 'Region 2', shapeGroup: 'Kenya', frequency: 4 },
            { shapeID: 'SOM-001', shapeName: 'Region 1', shapeGroup: 'Somalia', frequency: 7 },
            { shapeID: 'UGA-001', shapeName: 'Region 1', shapeGroup: 'Uganda', frequency: 2 },
          ];
          setRegions(mockRegions);
        }
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

    const geojson: any = feature(topology, topology.objects.data);
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
        const value = intensityById.get(d.properties.shapeID) ?? 0;
        return colorScale(value);
      })
      .append('title')
      .text((d: any) => {
        const value = intensityById.get(d.properties.shapeID) ?? 0;
        return `${d.properties.shapeName} (${d.properties.shapeGroup}) — ${value} events`;
      });

    svg
      .append('path')
      .datum(d3.geoGraticule10())
      .attr('class', 'graticule')
      .attr('d', path as any);
  }, [intensityById, topology, width]);

  return (
    <div className='card map-card' ref={containerRef}>
      <div className='card__header'>
        <div>
          <p className='eyebrow'>Affected Regions</p>
          <h3>Admin2 Frequency Choropleth</h3>
        </div>
        {loading && <span className='usa-tag usa-tag--warm'>Loading</span>}
      </div>
      <svg ref={svgRef} role='img' aria-label='Admin2 region choropleth' />
    </div>
  );
}
