'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { usePipelineStore } from 'app/store/providers/pipeline';
import { fetchEmdatMonthlyRisk } from 'app/lib/api/emdat';
import type { EmdatMonthDatum } from 'app/types/emdat';
import { useResizeObserver } from 'app/utilities/hooks/useResizeObserver';
import { getColorScale } from 'app/lib/colors';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export function DisasterCalendar() {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const { width } = useResizeObserver(containerRef, 960, 360);
  const [data, setData] = useState<EmdatMonthDatum[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const { hazard, selectedEventKey, setSelectedEventKey, setSelectedMonth } =
    usePipelineStore();

  // Fetch data when hazard changes
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchEmdatMonthlyRisk(hazard)
      .then((payload) => {
        if (!cancelled) {
          setData(payload);
          // Auto-select first event
          if (payload.length > 0) {
            const first = payload[0];
            setSelectedMonth(`${first.year}-${String(first.month).padStart(2, '0')}`);
            setSelectedEventKey(first.event_key);
          }
        }
      })
      .catch((error) => {
        console.error('Failed to fetch EM-DAT monthly data', error);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [hazard]);

  // Group data by year-month
  const grouped = useMemo(() => {
    const map = new Map<string, EmdatMonthDatum[]>();
    data.forEach((item) => {
      const key = `${item.year}-${String(item.month).padStart(2, '0')}`;
      const list = map.get(key) ?? [];
      list.push(item);
      map.set(key, list);
    });
    return map;
  }, [data]);

  const years = useMemo(() => {
    return Array.from(new Set(data.map((d) => d.year))).sort((a, b) => a - b);
  }, [data]);

  // Store grouped in a ref so D3 click handler always sees latest
  const groupedRef = useRef(grouped);
  groupedRef.current = grouped;

  // Click handler as stable callback
  const handleCellClick = useCallback(
    (cellKey: string) => {
      const bucket = groupedRef.current.get(cellKey);
      if (!bucket || bucket.length === 0) {
        setSelectedMonth(cellKey);
        setSelectedEventKey(null);
        return;
      }
      const sorted = [...bucket].sort((a, b) => b.event_count - a.event_count);
      setSelectedMonth(cellKey);
      setSelectedEventKey(sorted[0].event_key);
    },
    [setSelectedMonth, setSelectedEventKey],
  );

  // Draw the calendar — only redraws when data or size changes, NOT on selection change
  useEffect(() => {
    if (!svgRef.current || years.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const colorScale = getColorScale(hazard);
    const padding = { top: 32, right: 16, bottom: 32, left: 64 };
    const cellWidth = Math.max(36, (width - padding.left - padding.right) / years.length);
    const cellHeight = 28;
    const height = padding.top + padding.bottom + cellHeight * MONTHS.length;

    svg.attr('width', width).attr('height', height);
    const g = svg.append('g').attr('transform', `translate(${padding.left}, ${padding.top})`);

    // Month labels
    g.selectAll('text.month')
      .data(MONTHS)
      .enter()
      .append('text')
      .attr('class', 'month-label')
      .attr('x', -12)
      .attr('y', (_d, i) => i * cellHeight + cellHeight / 1.5)
      .attr('text-anchor', 'end')
      .text((d) => d);

    // Year labels
    g.selectAll('text.year')
      .data(years)
      .enter()
      .append('text')
      .attr('class', 'year-label')
      .attr('x', (_d, i) => i * cellWidth + cellWidth / 2)
      .attr('y', -8)
      .attr('text-anchor', 'middle')
      .text((d) => d);

    // Cell data
    const cellData = MONTHS.flatMap((_month, row) =>
      years.map((year, col) => ({
        key: `${year}-${String(row + 1).padStart(2, '0')}`,
        row,
        col,
      })),
    );

    const cells = g
      .append('g')
      .selectAll('g.cell')
      .data(cellData)
      .enter()
      .append('g')
      .attr('class', 'cell-group')
      .attr('transform', (d) => `translate(${d.col * cellWidth}, ${d.row * cellHeight})`)
      .style('cursor', (d) => {
        const bucket = grouped.get(d.key);
        return bucket && bucket.length > 0 ? 'pointer' : 'default';
      })
      .on('click', (_event, d) => {
        handleCellClick(d.key);
      });

    // Rectangles
    cells
      .append('rect')
      .attr('width', cellWidth - 4)
      .attr('height', cellHeight - 6)
      .attr('rx', 4)
      .attr('ry', 4)
      .attr('class', 'calendar-cell')
      .attr('data-key', (d) => d.key)
      .attr('fill', (d) => {
        const bucket = grouped.get(d.key);
        if (!bucket || bucket.length === 0) return '#f5f5f5';
        const peak = bucket.reduce((acc, curr) => Math.max(acc, curr.event_count), 0);
        return colorScale(peak);
      });

    // Tooltips
    cells
      .append('title')
      .text((d) => {
        const bucket = grouped.get(d.key) ?? [];
        if (bucket.length === 0) return `${d.key}: No recorded events`;
        const total = bucket.reduce((acc, curr) => acc + curr.event_count, 0);
        return `${d.key}: ${total} events (${bucket.length} record${bucket.length > 1 ? 's' : ''})`;
      });

    // Count text
    cells
      .append('text')
      .attr('x', 4)
      .attr('y', cellHeight / 2)
      .attr('class', 'cell-count')
      .attr('pointer-events', 'none')
      .text((d) => {
        const bucket = grouped.get(d.key) ?? [];
        if (bucket.length === 0) return '';
        return bucket.reduce((acc, curr) => acc + curr.event_count, 0).toString();
      });
  }, [data, width, hazard, handleCellClick]);

  // Separate effect: update active cell highlight WITHOUT redrawing
  useEffect(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);

    // Reset all cells
    svg.selectAll('.calendar-cell')
      .attr('stroke', 'rgba(0,0,0,0.05)')
      .attr('stroke-width', 1);

    // Highlight active cell
    if (selectedEventKey) {
      // Find which cell key matches the selected event
      for (const [cellKey, bucket] of grouped.entries()) {
        if (bucket.some((item) => item.event_key === selectedEventKey)) {
          svg.selectAll('.calendar-cell')
            .filter(function () {
              return d3.select(this).attr('data-key') === cellKey;
            })
            .attr('stroke', '#1a56db')
            .attr('stroke-width', 2.5);
          break;
        }
      }
    }
  }, [selectedEventKey, grouped]);

  return (
    <div className='card calendar-card' ref={containerRef}>
      <div className='card__header'>
        <div>
          <p className='eyebrow'>EM-DAT {hazard === 'drought' ? 'Drought' : 'Flood'} Activity</p>
          <h3>Monthly Event Frequency</h3>
        </div>
        {loading && <span className='usa-tag usa-tag--warm'>Loading</span>}
      </div>
      <svg ref={svgRef} role='img' aria-label='Disaster calendar heatmap' />
    </div>
  );
}
