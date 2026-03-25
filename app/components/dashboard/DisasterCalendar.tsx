'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { usePipelineStore } from 'app/store/providers/pipeline';
import { fetchEmdatMonthlyRisk } from 'app/lib/api/emdat';
import type { EmdatMonthDatum } from 'app/types/emdat';
import { useResizeObserver } from 'app/utilities/hooks/useResizeObserver';
import { getColorScale } from 'app/lib/colors';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAYS_OF_WEEK = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

interface Props {
  mode: 'monthly' | 'daily';
  startYear: number;
  endYear: number;
}

export function DisasterCalendar({ mode, startYear, endYear }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const { width } = useResizeObserver(containerRef, 960, 360);
  const [data, setData] = useState<EmdatMonthDatum[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const { hazard, selectedEventKey, setSelectedEventKey, setSelectedMonth } =
    usePipelineStore();

  // Fetch data
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchEmdatMonthlyRisk(hazard)
      .then((payload) => {
        if (!cancelled) {
          // Filter to year range
          const filtered = payload.filter((d) => d.year >= startYear && d.year <= endYear);
          setData(filtered);
          if (filtered.length > 0) {
            const first = filtered[0];
            setSelectedMonth(`${first.year}-${String(first.month).padStart(2, '0')}`);
            setSelectedEventKey(first.event_key);
          }
        }
      })
      .catch((error) => console.error('Failed to fetch EM-DAT data', error))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [hazard, startYear, endYear]);

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

  const groupedRef = useRef(grouped);
  groupedRef.current = grouped;

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

  const years = useMemo(() => {
    const arr: number[] = [];
    for (let y = startYear; y <= endYear; y++) arr.push(y);
    return arr;
  }, [startYear, endYear]);

  // Draw monthly calendar
  useEffect(() => {
    if (!svgRef.current || mode !== 'monthly' || years.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const colorScale = getColorScale(hazard);
    const padding = { top: 32, right: 16, bottom: 32, left: 64 };
    const cellWidth = Math.max(20, (width - padding.left - padding.right) / years.length);
    const cellHeight = 28;
    const height = padding.top + padding.bottom + cellHeight * 12;

    svg.attr('width', width).attr('height', height);
    const g = svg.append('g').attr('transform', `translate(${padding.left}, ${padding.top})`);

    // Month labels
    g.selectAll('text.month').data(MONTHS).enter().append('text')
      .attr('class', 'month-label')
      .attr('x', -12).attr('y', (_d, i) => i * cellHeight + cellHeight / 1.5)
      .attr('text-anchor', 'end').text((d) => d);

    // Year labels (show every Nth to avoid crowding)
    const labelInterval = years.length > 20 ? Math.ceil(years.length / 15) : 1;
    g.selectAll('text.year').data(years.filter((_, i) => i % labelInterval === 0)).enter().append('text')
      .attr('class', 'year-label')
      .attr('x', (_d) => (years.indexOf(_d)) * cellWidth + cellWidth / 2)
      .attr('y', -8).attr('text-anchor', 'middle').text((d) => d);

    // Cell data
    const cellData = MONTHS.flatMap((_m, row) =>
      years.map((year, col) => ({
        key: `${year}-${String(row + 1).padStart(2, '0')}`,
        row, col,
      })),
    );

    const cells = g.append('g').selectAll('g.cell').data(cellData).enter().append('g')
      .attr('class', 'cell-group')
      .attr('transform', (d) => `translate(${d.col * cellWidth}, ${d.row * cellHeight})`)
      .style('cursor', (d) => grouped.get(d.key)?.length ? 'pointer' : 'default')
      .on('click', (_e, d) => handleCellClick(d.key));

    cells.append('rect')
      .attr('width', cellWidth - 2).attr('height', cellHeight - 4)
      .attr('rx', 3).attr('ry', 3)
      .attr('class', 'calendar-cell')
      .attr('data-key', (d) => d.key)
      .attr('fill', (d) => {
        const bucket = grouped.get(d.key);
        if (!bucket?.length) return '#f5f5f5';
        const peak = bucket.reduce((a, c) => Math.max(a, c.event_count), 0);
        return colorScale(peak);
      });

    cells.append('title').text((d) => {
      const bucket = grouped.get(d.key) ?? [];
      if (!bucket.length) return `${d.key}: No events`;
      const total = bucket.reduce((a, c) => a + c.event_count, 0);
      return `${d.key}: ${total} events`;
    });

    // Show count text only when cells are wide enough
    if (cellWidth >= 30) {
      cells.append('text')
        .attr('x', 3).attr('y', cellHeight / 2)
        .attr('class', 'cell-count').attr('pointer-events', 'none')
        .text((d) => {
          const bucket = grouped.get(d.key) ?? [];
          if (!bucket.length) return '';
          return bucket.reduce((a, c) => a + c.event_count, 0).toString();
        });
    }
  }, [data, width, hazard, mode, handleCellClick, years, grouped]);

  // Draw daily calendar (GitHub contribution-graph style: 7 rows x 52 cols per year)
  useEffect(() => {
    if (!svgRef.current || mode !== 'daily' || years.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const colorScale = getColorScale(hazard);
    const cellSize = 14;
    const yearGap = 24;
    const padding = { top: 40, right: 16, bottom: 16, left: 40 };

    // Build day cells for each year
    type DayCell = { date: Date; key: string; yearIdx: number; weekCol: number; dayRow: number };
    const allDays: DayCell[] = [];

    years.forEach((year, yearIdx) => {
      const start = new Date(year, 0, 1);
      const end = new Date(year, 11, 31);
      const dayOne = d3.timeDay.range(start, d3.timeDay.offset(end, 1));
      const firstWeek = d3.timeWeek.count(d3.timeYear(start), start);
      dayOne.forEach((date) => {
        const weekCol = d3.timeWeek.count(d3.timeYear(date), date) - firstWeek;
        const dayRow = date.getDay();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const key = `${year}-${month}`;
        allDays.push({ date, key, yearIdx, weekCol, dayRow });
      });
    });

    const maxWeeks = Math.max(...years.map((year) => {
      const end = new Date(year, 11, 31);
      return d3.timeWeek.count(d3.timeYear(end), end) + 1;
    }));

    const yearBlockWidth = maxWeeks * (cellSize + 1) + yearGap;
    const totalWidth = Math.max(width, padding.left + years.length * yearBlockWidth + padding.right);
    const height = padding.top + 7 * (cellSize + 1) + padding.bottom;

    svg.attr('width', totalWidth).attr('height', height);
    const g = svg.append('g').attr('transform', `translate(${padding.left}, ${padding.top})`);

    // Day-of-week labels
    DAYS_OF_WEEK.forEach((day, i) => {
      if (i % 2 === 1) {
        g.append('text').attr('class', 'month-label')
          .attr('x', -8).attr('y', i * (cellSize + 1) + cellSize / 1.5)
          .attr('text-anchor', 'end').attr('font-size', '0.6rem').text(day);
      }
    });

    // Year labels
    years.forEach((year, idx) => {
      g.append('text').attr('class', 'year-label')
        .attr('x', idx * yearBlockWidth + yearBlockWidth / 2)
        .attr('y', -10).attr('text-anchor', 'middle').text(year);
    });

    // Day cells
    const cells = g.append('g').selectAll('rect.day').data(allDays).enter().append('rect')
      .attr('class', 'calendar-cell')
      .attr('data-key', (d) => d.key)
      .attr('width', cellSize).attr('height', cellSize)
      .attr('rx', 2).attr('ry', 2)
      .attr('x', (d) => d.yearIdx * yearBlockWidth + d.weekCol * (cellSize + 1))
      .attr('y', (d) => d.dayRow * (cellSize + 1))
      .attr('fill', (d) => {
        const bucket = grouped.get(d.key);
        if (!bucket?.length) return '#f5f5f5';
        const peak = bucket.reduce((a, c) => Math.max(a, c.event_count), 0);
        return colorScale(peak);
      })
      .style('cursor', (d) => grouped.get(d.key)?.length ? 'pointer' : 'default')
      .on('click', (_e, d) => handleCellClick(d.key));

    cells.append('title').text((d) => {
      const dateStr = d.date.toISOString().slice(0, 10);
      const bucket = grouped.get(d.key) ?? [];
      if (!bucket.length) return `${dateStr}: No events`;
      const total = bucket.reduce((a, c) => a + c.event_count, 0);
      return `${dateStr}: ${total} events (month: ${d.key})`;
    });

    // Month separator lines
    years.forEach((year, yearIdx) => {
      for (let m = 1; m < 12; m++) {
        const firstOfMonth = new Date(year, m, 1);
        const weekCol = d3.timeWeek.count(d3.timeYear(firstOfMonth), firstOfMonth);
        const firstWeek = d3.timeWeek.count(d3.timeYear(new Date(year, 0, 1)), new Date(year, 0, 1));
        const x = yearIdx * yearBlockWidth + (weekCol - firstWeek) * (cellSize + 1) - 0.5;
        g.append('line')
          .attr('x1', x).attr('x2', x)
          .attr('y1', 0).attr('y2', 7 * (cellSize + 1))
          .attr('stroke', 'rgba(0,0,0,0.08)').attr('stroke-width', 1);
      }
    });
  }, [data, width, hazard, mode, handleCellClick, years, grouped]);

  // Highlight active cell (separate from draw)
  useEffect(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    svg.selectAll('.calendar-cell')
      .attr('stroke', 'rgba(0,0,0,0.05)').attr('stroke-width', 1);

    if (selectedEventKey) {
      for (const [cellKey, bucket] of grouped.entries()) {
        if (bucket.some((item) => item.event_key === selectedEventKey)) {
          svg.selectAll('.calendar-cell')
            .filter(function () { return d3.select(this).attr('data-key') === cellKey; })
            .attr('stroke', '#1a56db').attr('stroke-width', 2);
          break;
        }
      }
    }
  }, [selectedEventKey, grouped]);

  const modeLabel = mode === 'daily' ? 'Daily' : 'Monthly';

  return (
    <div className='card calendar-card' ref={containerRef}>
      <div className='card__header'>
        <div>
          <p className='eyebrow'>
            EM-DAT {hazard === 'drought' ? 'Drought' : 'Flood'} Activity
          </p>
          <h3>{modeLabel} Event Frequency ({startYear}–{endYear})</h3>
        </div>
        {loading && <span className='usa-tag usa-tag--warm'>Loading</span>}
      </div>
      <div style={{ overflowX: 'auto' }}>
        <svg ref={svgRef} role='img' aria-label={`${modeLabel} disaster calendar heatmap`} />
      </div>
    </div>
  );
}
