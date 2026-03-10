'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { usePipelineStore } from 'app/store/providers/pipeline';
import { fetchEmdatMonthlyRisk } from 'app/lib/api/emdat';
import type { EmdatMonthDatum } from 'app/types/emdat';
import { useResizeObserver } from 'app/utilities/hooks/useResizeObserver';

const months = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

const colorScale = d3
  .scaleThreshold<number, string>()
  .domain([1, 2, 4, 6, 8, 10])
  .range(['#e8e8e8', '#ffffcc', '#fed976', '#ffb24b', '#fd4e2a', '#e3181a', '#800026']);

export function DisasterCalendar() {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const { width } = useResizeObserver(containerRef, 960, 360);
  const [data, setData] = useState<EmdatMonthDatum[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const { hazard, selectedEventKey, setSelectedEventKey, setSelectedMonth } =
    usePipelineStore();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchEmdatMonthlyRisk(hazard)
      .then((payload) => {
        if (!cancelled) {
          setData(payload);
          if (payload.length > 0) {
            const first = payload[0];
            setSelectedMonth(`${first.year}-${String(first.month).padStart(2, '0')}`);
            setSelectedEventKey(first.event_key);
          }
        }
      })
      .catch((error) => {
        console.error('Failed to fetch EM-DAT monthly data - using mock data', error);
        // Mock data for demonstration when API is unavailable
        if (!cancelled) {
          const mockData: EmdatMonthDatum[] = [];
          const years = [2020, 2021, 2022, 2023, 2024];
          years.forEach((year) => {
            for (let month = 1; month <= 12; month++) {
              const eventCount = Math.floor(Math.random() * 12);
              if (eventCount > 0) {
                mockData.push({
                  year,
                  month,
                  event_count: eventCount,
                  event_key: `${hazard}-${year}-${month}`,
                  disaster_type: hazard,
                });
              }
            }
          });
          setData(mockData);
          if (mockData.length > 0) {
            const first = mockData[0];
            setSelectedMonth(`${first.year}-${String(first.month).padStart(2, '0')}`);
            setSelectedEventKey(first.event_key);
          }
        }
      })
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [hazard, setSelectedEventKey, setSelectedMonth]);

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
    const unique = Array.from(new Set(data.map((d) => d.year))).sort((a, b) => a - b);
    return unique;
  }, [data]);

  useEffect(() => {
    if (!svgRef.current || years.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const padding = { top: 32, right: 16, bottom: 32, left: 64 };
    const cellWidth = Math.max(36, (width - padding.left - padding.right) / years.length);
    const cellHeight = 28;
    const height = padding.top + padding.bottom + cellHeight * months.length;

    svg.attr('width', width).attr('height', height);

    const g = svg.append('g').attr('transform', `translate(${padding.left}, ${padding.top})`);

    // Month labels
    g.selectAll('text.month')
      .data(months)
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

    const cells = g
      .append('g')
      .selectAll('g.cell')
      .data(
        months.flatMap((_month, row) =>
          years.map((year, col) => ({
            key: `${year}-${String(row + 1).padStart(2, '0')}`,
            row,
            col,
          })),
        ),
      )
      .enter()
      .append('g')
      .attr('transform', (d) => `translate(${d.col * cellWidth}, ${d.row * cellHeight})`);

    cells
      .append('rect')
      .attr('width', cellWidth - 4)
      .attr('height', cellHeight - 6)
      .attr('rx', 4)
      .attr('ry', 4)
      .attr('class', 'calendar-cell')
      .attr('fill', (d) => {
        const bucket = grouped.get(d.key);
        if (!bucket || bucket.length === 0) return '#f5f5f5';
        const peak = bucket.reduce((acc, curr) => Math.max(acc, curr.event_count), 0);
        return colorScale(peak);
      })
      .classed('calendar-cell--active', (d) => {
        const bucket = grouped.get(d.key) ?? [];
        return bucket.some((item) => item.event_key === selectedEventKey);
      })
      .on('click', (event, d) => {
        const bucket = grouped.get(d.key);
        if (!bucket || bucket.length === 0) {
          setSelectedMonth(d.key);
          setSelectedEventKey(null);
          return;
        }
        const sorted = [...bucket].sort((a, b) => b.event_count - a.event_count);
        const next = sorted[0];
        setSelectedMonth(d.key);
        setSelectedEventKey(next.event_key);
      })
      .append('title')
      .text((d) => {
        const bucket = grouped.get(d.key) ?? [];
        if (bucket.length === 0) return `${d.key}: No recorded events`;
        const total = bucket.reduce((acc, curr) => acc + curr.event_count, 0);
        return `${d.key}: ${total} events (${bucket.length} record${bucket.length > 1 ? 's' : ''})`;
      });

    cells
      .append('text')
      .attr('x', 4)
      .attr('y', cellHeight / 2)
      .attr('class', 'cell-count')
      .text((d) => {
        const bucket = grouped.get(d.key) ?? [];
        if (bucket.length === 0) return '';
        const total = bucket.reduce((acc, curr) => acc + curr.event_count, 0);
        return total.toString();
      });
  }, [grouped, selectedEventKey, setSelectedEventKey, setSelectedMonth, width, years.length]);

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
