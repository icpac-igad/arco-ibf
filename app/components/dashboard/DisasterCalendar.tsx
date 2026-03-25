'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { usePipelineStore } from 'app/store/providers/pipeline';
import { fetchEmdatMonthlyRisk } from 'app/lib/api/emdat';
import type { EmdatMonthDatum } from 'app/types/emdat';
import { useResizeObserver } from 'app/utilities/hooks/useResizeObserver';
import { getColorScale } from 'app/lib/colors';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

interface Props {
  mode: 'monthly' | 'daily';
  startYear: number;
  endYear: number;
}

// Stage labels for the calendar header
const STAGE_LABELS: Record<string, { eyebrow: string; title: string }> = {
  'risk-knowledge': { eyebrow: 'EM-DAT Disaster Events', title: 'Monthly Event Frequency' },
  'risk-monitoring': { eyebrow: 'Risk Monitoring', title: 'Monitoring Calendar' },
  'risk-decisions': { eyebrow: 'Decision Support', title: 'Decision Calendar' },
};

export function DisasterCalendar({ mode, startYear, endYear }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const { width } = useResizeObserver(containerRef, 960, 360);
  const [data, setData] = useState<EmdatMonthDatum[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const { hazard, stage, selectedMonth, setSelectedEventKey, setSelectedMonth } =
    usePipelineStore();

  const isRK = stage === 'risk-knowledge';

  // Fetch data: RK uses parquet API, RM/RD generate synthetic entries for all months
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    if (isRK) {
      // RK: fetch EM-DAT data from API
      fetchEmdatMonthlyRisk(hazard)
        .then((payload) => {
          if (!cancelled) {
            const filtered = payload.filter((d) => d.year >= startYear && d.year <= endYear);
            setData(filtered);
            if (!selectedMonth && filtered.length > 0) {
              const first = filtered[0];
              setSelectedMonth(`${first.year}-${String(first.month).padStart(2, '0')}`);
            }
          }
        })
        .catch((error) => console.error('Failed to fetch EM-DAT data', error))
        .finally(() => !cancelled && setLoading(false));
    } else {
      // RM/RD: generate one synthetic entry per month in range (every cell is clickable)
      const synthetic: EmdatMonthDatum[] = [];
      for (let y = startYear; y <= endYear; y++) {
        for (let m = 1; m <= 12; m++) {
          synthetic.push({
            event_key: `${hazard}-${y}-${String(m).padStart(2, '0')}`,
            year: y,
            month: m,
            event_count: 1,
            total_deaths: 0,
            total_affected: 0,
            regions_affected: 0,
            countries_affected: 0,
            level: 1,
          });
        }
      }
      setData(synthetic);
      if (!selectedMonth) {
        // Auto-select most recent month
        const last = synthetic[synthetic.length - 1];
        setSelectedMonth(`${last.year}-${String(last.month).padStart(2, '0')}`);
      }
      setLoading(false);
    }

    return () => { cancelled = true; };
  }, [hazard, stage, startYear, endYear]);

  // Group data by YYYY-MM
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
    (urlKey: string, lookupKey: string) => {
      setSelectedMonth(urlKey);
      // For RK, derive event key from data; for RM/RD, no event key needed
      if (isRK) {
        const bucket = groupedRef.current.get(lookupKey);
        if (bucket && bucket.length > 0) {
          const sorted = [...bucket].sort((a, b) => b.event_count - a.event_count);
          setSelectedEventKey(sorted[0].event_key);
        } else {
          setSelectedEventKey(null);
        }
      } else {
        setSelectedEventKey(null);
      }
    },
    [setSelectedMonth, setSelectedEventKey, isRK],
  );

  const years = useMemo(() => {
    const arr: number[] = [];
    for (let y = startYear; y <= endYear; y++) arr.push(y);
    return arr;
  }, [startYear, endYear]);

  // ── MONTHLY CALENDAR ──
  useEffect(() => {
    if (!svgRef.current || mode !== 'monthly' || years.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const colorScale = getColorScale(hazard);
    const padding = { top: 32, right: 16, bottom: 8, left: 48 };
    const cellWidth = 36;
    const cellHeight = 28;
    const svgWidth = padding.left + padding.right + years.length * cellWidth;
    const svgHeight = padding.top + padding.bottom + 12 * cellHeight;

    svg.attr('width', svgWidth).attr('height', svgHeight);
    const g = svg.append('g').attr('transform', `translate(${padding.left}, ${padding.top})`);

    g.selectAll('text.month').data(MONTHS).enter().append('text')
      .attr('class', 'month-label')
      .attr('x', -8).attr('y', (_d, i) => i * cellHeight + cellHeight / 1.5)
      .attr('text-anchor', 'end').text((d) => d);

    g.selectAll('text.year').data(years).enter().append('text')
      .attr('class', 'year-label')
      .attr('x', (_d, i) => i * cellWidth + cellWidth / 2)
      .attr('y', -8).attr('text-anchor', 'middle').text((d) => d);

    const cellData = MONTHS.flatMap((_m, row) =>
      years.map((year, col) => ({
        key: `${year}-${String(row + 1).padStart(2, '0')}`,
        row, col,
      })),
    );

    const cells = g.append('g').selectAll('g.cell').data(cellData).enter().append('g')
      .attr('class', 'cell-group')
      .attr('transform', (d) => `translate(${d.col * cellWidth}, ${d.row * cellHeight})`)
      .style('cursor', 'pointer')
      .on('click', (_e, d) => handleCellClick(d.key, d.key));

    cells.append('rect')
      .attr('width', cellWidth - 3).attr('height', cellHeight - 4)
      .attr('rx', 3).attr('ry', 3)
      .attr('class', 'calendar-cell')
      .attr('data-key', (d) => d.key)
      .attr('fill', (d) => {
        const bucket = grouped.get(d.key);
        if (!bucket?.length) return isRK ? '#f5f5f5' : '#e8e8e8';
        if (!isRK) return '#d0d7de'; // RM/RD: uniform light color (all cells valid)
        const peak = bucket.reduce((a, c) => Math.max(a, c.event_count), 0);
        return colorScale(peak);
      });

    cells.append('title').text((d) => {
      const bucket = grouped.get(d.key) ?? [];
      if (isRK) {
        if (!bucket.length) return `${d.key}: No events`;
        return `${d.key}: ${bucket.reduce((a, c) => a + c.event_count, 0)} events`;
      }
      return d.key;
    });

    if (isRK) {
      cells.append('text')
        .attr('x', 3).attr('y', cellHeight / 2)
        .attr('class', 'cell-count').attr('pointer-events', 'none')
        .text((d) => {
          const bucket = grouped.get(d.key) ?? [];
          if (!bucket.length) return '';
          return bucket.reduce((a, c) => a + c.event_count, 0).toString();
        });
    }

    // Scroll
    if (scrollRef.current && svgWidth > width) {
      let scrollTarget = svgWidth - width;
      if (selectedMonth) {
        const year = parseInt(selectedMonth.split('-')[0], 10);
        const colIdx = years.indexOf(year);
        if (colIdx >= 0) scrollTarget = Math.max(0, padding.left + colIdx * cellWidth - width / 2);
      }
      scrollRef.current.scrollLeft = scrollTarget;
    }
  }, [data, width, hazard, mode, handleCellClick, years, grouped, isRK]);

  // ── DAILY CALENDAR ──
  useEffect(() => {
    if (!svgRef.current || mode !== 'daily' || years.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const padding = { top: 40, right: 16, bottom: 8, left: 32 };
    const cellSize = 16;
    const gap = 1;

    const columns: { year: number; month: number; key: string }[] = [];
    for (let y = startYear; y <= endYear; y++) {
      for (let m = 1; m <= 12; m++) {
        columns.push({ year: y, month: m, key: `${y}-${String(m).padStart(2, '0')}` });
      }
    }

    const colWidth = cellSize + gap;
    const rowHeight = cellSize + gap;
    const svgWidth = padding.left + padding.right + columns.length * colWidth;
    const svgHeight = padding.top + padding.bottom + 31 * rowHeight;

    svg.attr('width', svgWidth).attr('height', svgHeight);
    const g = svg.append('g').attr('transform', `translate(${padding.left}, ${padding.top})`);

    for (let d = 1; d <= 31; d++) {
      if (d % 5 === 1 || d === 31) {
        g.append('text').attr('class', 'month-label')
          .attr('x', -4).attr('y', (d - 1) * rowHeight + cellSize / 1.5)
          .attr('text-anchor', 'end').attr('font-size', '0.55rem').text(d);
      }
    }

    columns.forEach((col, ci) => {
      const isJan = col.month === 1;
      g.append('text').attr('class', 'year-label')
        .attr('x', ci * colWidth + cellSize / 2)
        .attr('y', isJan ? -18 : -6)
        .attr('text-anchor', 'middle')
        .attr('font-size', isJan ? '0.65rem' : '0.5rem')
        .attr('font-weight', isJan ? '700' : '400')
        .text(isJan ? col.year.toString() : MONTHS[col.month - 1].charAt(0));
    });

    const dayCells: { col: number; day: number; key: string; valid: boolean }[] = [];
    columns.forEach((col, ci) => {
      const daysInMonth = new Date(col.year, col.month, 0).getDate();
      for (let d = 1; d <= 31; d++) {
        dayCells.push({ col: ci, day: d, key: col.key, valid: d <= daysInMonth });
      }
    });

    g.append('g').selectAll('rect.day').data(dayCells).enter().append('rect')
      .attr('class', 'calendar-cell')
      .attr('data-key', (d) => d.key)
      .attr('width', cellSize).attr('height', cellSize)
      .attr('rx', 2).attr('ry', 2)
      .attr('x', (d) => d.col * colWidth)
      .attr('y', (d) => (d.day - 1) * rowHeight)
      .attr('fill', (d) => d.valid ? '#d0d7de' : '#fafafa')
      .attr('opacity', (d) => d.valid ? 1 : 0.3)
      .style('cursor', (d) => d.valid ? 'pointer' : 'default')
      .on('click', (_e, d) => {
        if (d.valid) {
          const dateKey = `${d.key}-${String(d.day).padStart(2, '0')}`;
          handleCellClick(dateKey, d.key);
        }
      })
      .append('title').text((d) => {
        if (!d.valid) return '';
        return `${d.key}-${String(d.day).padStart(2, '0')}`;
      });

    columns.forEach((col, ci) => {
      if (col.month === 1 && ci > 0) {
        const x = ci * colWidth - 0.5;
        g.append('line').attr('x1', x).attr('x2', x)
          .attr('y1', -2).attr('y2', 31 * rowHeight)
          .attr('stroke', 'rgba(0,0,0,0.15)').attr('stroke-width', 1);
      }
    });

    if (scrollRef.current && svgWidth > width) {
      let scrollTarget = svgWidth - width;
      if (selectedMonth) {
        const monthKey = selectedMonth.slice(0, 7);
        const colIdx = columns.findIndex((c) => c.key === monthKey);
        if (colIdx >= 0) scrollTarget = Math.max(0, padding.left + colIdx * colWidth - width / 2);
      }
      scrollRef.current.scrollLeft = scrollTarget;
    }
  }, [data, width, hazard, mode, handleCellClick, years, grouped, startYear, endYear]);

  // Highlight active cell
  useEffect(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    svg.selectAll('.calendar-cell')
      .attr('stroke', 'rgba(0,0,0,0.05)').attr('stroke-width', 0.5);

    if (selectedMonth) {
      const monthKey = selectedMonth.slice(0, 7);
      svg.selectAll('.calendar-cell')
        .filter(function () { return d3.select(this).attr('data-key') === monthKey; })
        .attr('stroke', '#1a56db').attr('stroke-width', 2);
    }
  }, [selectedMonth, grouped]);

  const labels = STAGE_LABELS[stage] ?? STAGE_LABELS['risk-knowledge'];
  const modeLabel = mode === 'daily' ? 'Daily' : 'Monthly';

  return (
    <div className='card calendar-card' ref={containerRef}>
      <div className='card__header'>
        <div>
          <p className='eyebrow'>
            {hazard === 'drought' ? 'Drought' : 'Flood'} — {labels.eyebrow}
          </p>
          <h3>{labels.title} ({modeLabel}, {startYear}–{endYear})</h3>
        </div>
        {loading && <span className='usa-tag usa-tag--warm'>Loading</span>}
      </div>
      <div ref={scrollRef} className='calendar-scroll'>
        <svg ref={svgRef} role='img' aria-label={`${modeLabel} calendar heatmap`} />
      </div>
    </div>
  );
}
