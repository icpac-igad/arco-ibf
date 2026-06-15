'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { usePipelineStore } from 'app/store/providers/pipeline';
import {
  fetchEmdatMonthlyRisk,
  fetchIbfFloodCalendar,
  fetchIbfDroughtCalendar,
} from 'app/lib/api/emdat';
import type { EmdatMonthDatum, IbfCalendarDatum } from 'app/types/emdat';
import { useResizeObserver } from 'app/utilities/hooks/useResizeObserver';
import { getColorScale, actionablePctColor, ACTIONABLE_PCT_LEGEND } from 'app/lib/colors';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// Share (%) of the 227 admin-1 boundaries in Actionable_Risk for a calendar
// cell. Drives the RM calendar colour so daily flood boxes (too small for a
// legible count) still convey severity.
function pctActionable(s: IbfCalendarDatum): number {
  const total = (s.n_monitor ?? 0) + (s.n_evaluate ?? 0) + (s.n_assess ?? 0) + (s.n_actionable_risk ?? 0);
  return total > 0 ? (100 * (s.n_actionable_risk ?? 0)) / total : 0;
}

interface Props {
  mode: 'monthly' | 'daily';
  startYear: number;
  endYear: number;
  // When set (e.g. "BDI"), RM calendar counts are re-aggregated to this country's
  // admin-1s only, by pulling per-month regions across the (bounded) year range —
  // the calendar analogue of the choropleth's country focus. Omit for the EA-wide view.
  focusCountry?: string;
  // Optional event window (scenario mode). When both are set, only cells inside
  // [windowStart, windowEnd] are enabled/clickable and fully coloured; cells
  // outside are kept as muted, non-interactive context. ISO strings at the
  // calendar's granularity: YYYY-MM (monthly / drought) or YYYY-MM-DD (daily /
  // flood). Lexicographic string compare works for ISO dates. The dashboard
  // omits these → unchanged full-range behaviour.
  windowStart?: string;
  windowEnd?: string;
}

// Stage labels for the calendar header
const STAGE_LABELS: Record<string, { eyebrow: string; title: string }> = {
  'risk-knowledge': { eyebrow: 'EM-DAT Disaster Events', title: 'Monthly Event Frequency' },
  'risk-monitoring': { eyebrow: 'Risk Monitoring', title: 'Monitoring Calendar' },
  'risk-decisions': { eyebrow: 'Decision Support', title: 'Decision Calendar' },
};

// Fixed label widths
const LABEL_WIDTH_MONTHLY = 42;
const LABEL_WIDTH_DAILY = 28;

export function DisasterCalendar({
  mode,
  startYear,
  endYear,
  focusCountry,
  windowStart,
  windowEnd,
}: Props) {
  const hasWindow = Boolean(windowStart && windowEnd);
  // True when a cell key (YYYY-MM monthly cell, or YYYY-MM-DD daily cell) falls
  // within the event window. No window set → every cell is in-window (dashboard).
  const inWindow = useCallback(
    (key: string) => !hasWindow || (key >= windowStart! && key <= windowEnd!),
    [hasWindow, windowStart, windowEnd],
  );
  const OUT_OF_WINDOW_FILL = '#f3f4f6';
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const labelSvgRef = useRef<SVGSVGElement>(null);
  const { width } = useResizeObserver(containerRef, 960, 360);
  const [data, setData] = useState<EmdatMonthDatum[]>([]);
  const [ibfSummary, setIbfSummary] = useState<Map<string, IbfCalendarDatum>>(new Map());
  // Country-filtered counts (focusCountry), keyed like ibfSummary.
  const [countrySummary, setCountrySummary] = useState<Map<string, IbfCalendarDatum>>(new Map());
  const [countryLoading, setCountryLoading] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const { hazard, stage, selectedMonth, setSelectedEventKey, setSelectedMonth } =
    usePipelineStore();

  const isRK = stage === 'risk-knowledge';
  const isRM = stage === 'risk-monitoring';

  // Stale-closure guard: the data-fetch useEffect's `.then(...)` callback
  // checks `!selectedMonth` to decide whether to auto-select the first
  // event's month. The useEffect doesn't have selectedMonth in its dep
  // array (we don't want to refetch on every cell click), so the closure
  // captures whatever selectedMonth was on the render the effect ran.
  //
  // That captured value is `null` (default state) when:
  //   - hazard is 'drought' (= defaultState.hazard), so the effect does
  //     not re-run when syncFromUrl updates selectedMonth from the URL —
  //     leading to the bug where drought deep links like
  //     ?hazard=drought&month=2021-01&event=2021-IBF01-BDI got
  //     auto-redirected to ?month=1990-01.
  //
  // Reading from this ref inside the callback gives us the latest value.
  const selectedMonthRef = useRef(selectedMonth);
  selectedMonthRef.current = selectedMonth;

  // RM only: fetch the pre-aggregated IBF calendar (admin1 boundary counts per
  // CRMA state). Key the result by YYYY-MM (drought init) or YYYY-MM-DD (flood).
  useEffect(() => {
    if (!isRM) {
      setIbfSummary(new Map());
      return;
    }
    let cancelled = false;
    const fetcher = hazard === 'drought' ? fetchIbfDroughtCalendar : fetchIbfFloodCalendar;
    fetcher()
      .then((rows) => {
        if (cancelled) return;
        const map = new Map<string, IbfCalendarDatum>();
        rows.forEach((row) => {
          const key = hazard === 'drought'
            ? row.init_month ?? `${row.year}-${String(row.month).padStart(2, '0')}`
            : `${row.year}-${String(row.month).padStart(2, '0')}-${String(row.day ?? 0).padStart(2, '0')}`;
          map.set(key, row);
        });
        setIbfSummary(map);
      })
      .catch((err) => console.error('IBF calendar fetch failed', err));
    return () => { cancelled = true; };
  }, [isRM, hazard]);

  // RM + focusCountry: fetch the per-country calendar (one request; counts are
  // aggregated server-side to this country's admin-1s on the boundary parquet).
  useEffect(() => {
    if (!isRM || !focusCountry) {
      setCountrySummary(new Map());
      return;
    }
    let cancelled = false;
    setCountryLoading(true);
    const fetcher = hazard === 'drought' ? fetchIbfDroughtCalendar : fetchIbfFloodCalendar;
    fetcher(focusCountry)
      .then((rows) => {
        if (cancelled) return;
        const m = new Map<string, IbfCalendarDatum>();
        rows.forEach((row) => {
          const key = hazard === 'drought'
            ? row.init_month ?? `${row.year}-${String(row.month).padStart(2, '0')}`
            : `${row.year}-${String(row.month).padStart(2, '0')}-${String(row.day ?? 0).padStart(2, '0')}`;
          m.set(key, row);
        });
        setCountrySummary(m);
        setCountryLoading(false);
      })
      .catch((err) => {
        console.error('Country calendar fetch failed', err);
        if (!cancelled) { setCountrySummary(new Map()); setCountryLoading(false); }
      });
    return () => { cancelled = true; };
  }, [isRM, focusCountry, hazard]);

  // Active per-cell summary: country-filtered when focusCountry is set, else EA-wide.
  const activeSummary = focusCountry && countrySummary.size ? countrySummary : ibfSummary;

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
            if (!selectedMonthRef.current && filtered.length > 0) {
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
      if (!selectedMonthRef.current) {
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
      // Risk-knowledge: only respond to clicks on cells that actually have
      // events; the EventListPanel takes over event-selection from there.
      if (isRK) {
        const bucket = groupedRef.current.get(lookupKey);
        if (!bucket || bucket.length === 0) return;
        setSelectedMonth(urlKey);
        // Clear event_key so the list re-shows; user must pick one.
        setSelectedEventKey(null);
        return;
      }
      setSelectedMonth(urlKey);
      setSelectedEventKey(null);
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
    if (!svgRef.current || !labelSvgRef.current || mode !== 'monthly' || years.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    const labelSvg = d3.select(labelSvgRef.current);
    labelSvg.selectAll('*').remove();

    const colorScale = getColorScale(hazard);
    const padding = { top: 32, right: 8, bottom: 8 };
    const cellWidth = 36;
    const cellHeight = 28;
    const svgWidth = padding.right + years.length * cellWidth;
    const svgHeight = padding.top + padding.bottom + 12 * cellHeight;

    svg.attr('width', svgWidth).attr('height', svgHeight);
    const g = svg.append('g').attr('transform', `translate(0, ${padding.top})`);

    // Fixed labels
    labelSvg.attr('width', LABEL_WIDTH_MONTHLY).attr('height', svgHeight);
    const lg = labelSvg.append('g').attr('transform', `translate(${LABEL_WIDTH_MONTHLY}, ${padding.top})`);
    lg.selectAll('text.month').data(MONTHS).enter().append('text')
      .attr('class', 'month-label')
      .attr('x', -4).attr('y', (_d, i) => i * cellHeight + cellHeight / 1.5)
      .attr('text-anchor', 'end').text((d) => d);

    // Year labels in scrollable area
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
      .style('cursor', (d) => {
        // Scenario window: out-of-window cells are inert context.
        if (hasWindow && !inWindow(d.key)) return 'default';
        // RK: cells with no events are inert.
        if (isRK) return (grouped.get(d.key)?.length ?? 0) > 0 ? 'pointer' : 'default';
        return 'pointer';
      })
      .on('click', (_e, d) => {
        if (hasWindow && !inWindow(d.key)) return;
        handleCellClick(d.key, d.key);
      });

    cells.append('rect')
      .attr('width', cellWidth - 3).attr('height', cellHeight - 4)
      .attr('rx', 3).attr('ry', 3)
      .attr('class', 'calendar-cell')
      .attr('data-key', (d) => d.key)
      .attr('opacity', (d) => (hasWindow && !inWindow(d.key) ? 0.4 : 1))
      .attr('fill', (d) => {
        if (hasWindow && !inWindow(d.key)) return OUT_OF_WINDOW_FILL;
        if (isRM) {
          const s = activeSummary.get(d.key);
          if (!s) return '#e8e8e8';
          return actionablePctColor(pctActionable(s));
        }
        const bucket = grouped.get(d.key);
        if (!bucket?.length) return isRK ? '#f5f5f5' : '#e8e8e8';
        if (!isRK) return '#d0d7de'; // RD: uniform light color (no aggregate yet)
        const peak = bucket.reduce((a, c) => Math.max(a, c.event_count), 0);
        return colorScale(peak);
      });

    cells.append('title').text((d) => {
      if (isRM) {
        const s = activeSummary.get(d.key);
        if (!s) return `${d.key}: no BN data`;
        return `${d.key} — Actionable: ${s.n_actionable_risk}, Assess: ${s.n_assess}, Evaluate: ${s.n_evaluate}, Monitor: ${s.n_monitor} (of ${s.n_monitor + s.n_evaluate + s.n_assess + s.n_actionable_risk}${focusCountry ? ` ${focusCountry}` : ''} boundaries)`;
      }
      const bucket = grouped.get(d.key) ?? [];
      if (isRK) {
        if (!bucket.length) return `${d.key}: No events`;
        return `${d.key}: ${bucket.reduce((a, c) => a + c.event_count, 0)} events`;
      }
      return d.key;
    });

    if (isRK || isRM) {
      cells.append('text')
        .attr('x', 3).attr('y', cellHeight / 2)
        .attr('class', 'cell-count').attr('pointer-events', 'none')
        .text((d) => {
          if (hasWindow && !inWindow(d.key)) return '';
          if (isRM) {
            const s = activeSummary.get(d.key);
            return s ? s.n_actionable_risk.toString() : '';
          }
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
        if (colIdx >= 0) scrollTarget = Math.max(0, colIdx * cellWidth - width / 2);
      }
      scrollRef.current.scrollLeft = scrollTarget;
    }
  }, [data, width, hazard, mode, handleCellClick, years, grouped, isRK, isRM, activeSummary, hasWindow, inWindow]);

  // ── DAILY CALENDAR ──
  useEffect(() => {
    if (!svgRef.current || !labelSvgRef.current || mode !== 'daily' || years.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    const labelSvg = d3.select(labelSvgRef.current);
    labelSvg.selectAll('*').remove();

    const padding = { top: 40, right: 8, bottom: 8 };
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
    const svgWidth = padding.right + columns.length * colWidth;
    const svgHeight = padding.top + padding.bottom + 31 * rowHeight;

    svg.attr('width', svgWidth).attr('height', svgHeight);
    const g = svg.append('g').attr('transform', `translate(0, ${padding.top})`);

    // Fixed day labels
    labelSvg.attr('width', LABEL_WIDTH_DAILY).attr('height', svgHeight);
    const lg = labelSvg.append('g').attr('transform', `translate(${LABEL_WIDTH_DAILY}, ${padding.top})`);
    for (let d = 1; d <= 31; d++) {
      if (d % 5 === 1 || d === 31) {
        lg.append('text').attr('class', 'month-label')
          .attr('x', -4).attr('y', (d - 1) * rowHeight + cellSize / 1.5)
          .attr('text-anchor', 'end').attr('font-size', '0.55rem').text(d);
      }
    }

    // Column labels in scrollable area
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
      .attr('fill', (d) => {
        if (!d.valid) return '#fafafa';
        const dateKey = `${d.key}-${String(d.day).padStart(2, '0')}`;
        if (hasWindow && !inWindow(dateKey)) return OUT_OF_WINDOW_FILL;
        if (isRM) {
          const s = activeSummary.get(dateKey);
          if (!s) return '#e8e8e8';
          return actionablePctColor(pctActionable(s));
        }
        return '#d0d7de';
      })
      .attr('opacity', (d) => {
        if (!d.valid) return 0.3;
        const dateKey = `${d.key}-${String(d.day).padStart(2, '0')}`;
        return hasWindow && !inWindow(dateKey) ? 0.4 : 1;
      })
      .style('cursor', (d) => {
        if (!d.valid) return 'default';
        const dateKey = `${d.key}-${String(d.day).padStart(2, '0')}`;
        return hasWindow && !inWindow(dateKey) ? 'default' : 'pointer';
      })
      .on('click', (_e, d) => {
        if (!d.valid) return;
        const dateKey = `${d.key}-${String(d.day).padStart(2, '0')}`;
        if (hasWindow && !inWindow(dateKey)) return;
        handleCellClick(dateKey, d.key);
      })
      .append('title').text((d) => {
        if (!d.valid) return '';
        const dateKey = `${d.key}-${String(d.day).padStart(2, '0')}`;
        if (isRM) {
          const s = activeSummary.get(dateKey);
          if (!s) return `${dateKey}: no BN data`;
          return `${dateKey} — Actionable: ${s.n_actionable_risk}, Assess: ${s.n_assess}, Evaluate: ${s.n_evaluate}, Monitor: ${s.n_monitor} (of ${s.n_monitor + s.n_evaluate + s.n_assess + s.n_actionable_risk}${focusCountry ? ` ${focusCountry}` : ''})`;
        }
        return dateKey;
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
        if (colIdx >= 0) scrollTarget = Math.max(0, colIdx * colWidth - width / 2);
      }
      scrollRef.current.scrollLeft = scrollTarget;
    }
  }, [data, width, hazard, mode, handleCellClick, years, grouped, startYear, endYear, isRM, activeSummary, hasWindow, inWindow]);

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
          <h3>
            {labels.title} ({modeLabel},{' '}
            {hasWindow ? `${windowStart} → ${windowEnd}` : `${startYear}–${endYear}`}
            {focusCountry ? `, ${focusCountry} only` : ''})
          </h3>
        </div>
        {(loading || countryLoading) && <span className='usa-tag usa-tag--warm'>Loading</span>}
      </div>
      <div className='calendar-container'>
        <svg ref={labelSvgRef} className='calendar-labels' />
        <div ref={scrollRef} className='calendar-scroll'>
          <svg ref={svgRef} role='img' aria-label={`${modeLabel} calendar heatmap`} />
        </div>
      </div>
      {isRM && (
        <div
          className='calendar-legend'
          style={{
            display: 'flex', alignItems: 'center', flexWrap: 'wrap',
            gap: '0.6rem', padding: '0.6rem 0.25rem 0.1rem',
            fontSize: '0.7rem', color: '#374151',
          }}
        >
          <span style={{ fontWeight: 600 }}>% Admin-1 at Actionable&nbsp;Risk</span>
          {ACTIONABLE_PCT_LEGEND.map((b) => (
            <span key={b.label} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
              <span
                style={{
                  width: 12, height: 12, background: b.color, borderRadius: 2,
                  border: '1px solid rgba(0,0,0,0.15)', display: 'inline-block',
                }}
              />
              {b.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
