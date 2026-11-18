'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { usePipelineStore } from 'app/store/providers/pipeline';
import { isMrInit, MR_RANGE } from 'app/lib/crma-mr-range';
import type { CrmaMrWindow } from 'app/types/crma-mr';
import {
  fetchEmdatMonthlyRisk,
  fetchIbfFloodCalendar,
  fetchCrmaMrCalendar,
  fetchIbfDroughtCalendar,
} from 'app/lib/api/emdat';
import type { EmdatMonthDatum, IbfCalendarDatum } from 'app/types/emdat';
import { useResizeObserver } from 'app/utilities/hooks/useResizeObserver';
import { getColorScale, actionablePctColor, ACTIONABLE_PCT_LEGEND,
         pSevereColor, P_SEVERE_LEGEND } from 'app/lib/colors';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const WEEKDAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

// Share (%) of the 227 admin-1 boundaries in Actionable_Risk for a calendar
// cell. Drives the RM calendar colour so daily flood boxes (too small for a
// legible count) still convey severity.
function pctActionable(s: IbfCalendarDatum): number {
  const total = (s.n_monitor ?? 0) + (s.n_evaluate ?? 0) + (s.n_assess ?? 0) + (s.n_actionable_risk ?? 0);
  return total > 0 ? (100 * (s.n_actionable_risk ?? 0)) / total : 0;
}

/**
 * The share as text. Truncated (never rounded up) to one decimal so the
 * number always sits inside the legend band its colour comes from
 * (4.96% reads "4.9%", in the "<5%" band — not "5.0%").
 */
function formatPct(p: number): string {
  if (p <= 0) return '0%';
  if (p < 0.1) return '<0.1%';
  const t = Math.floor(p * 10) / 10;
  return `${Number.isInteger(t) ? t.toFixed(0) : t.toFixed(1)}%`;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** "2026-08-03" → "Mon 03 Aug 2026"; "2026-08" → "Aug 2026". UTC, no TZ drift. */
function formatKey(key: string): string {
  const y = parseInt(key.slice(0, 4), 10);
  const m = parseInt(key.slice(5, 7), 10);
  if (key.length >= 10) {
    const d = parseInt(key.slice(8, 10), 10);
    const wd = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
    return `${wd} ${pad2(d)} ${MONTHS[m - 1]} ${y}`;
  }
  return `${MONTHS[m - 1]} ${y}`;
}

/** Compact range label for headers: "2019-04-01" → "1 Apr 2019"; "2019-04" → "Apr 2019". */
function formatShort(key: string): string {
  const y = key.slice(0, 4);
  const m = parseInt(key.slice(5, 7), 10);
  if (key.length >= 10) return `${parseInt(key.slice(8, 10), 10)} ${MONTHS[m - 1]} ${y}`;
  return `${MONTHS[m - 1]} ${y}`;
}

const daysIn = (y: number, m: number) => new Date(y, m, 0).getDate();

/** Move a YYYY-MM-DD key by whole days (UTC arithmetic). */
function addDays(key: string, n: number): string {
  const t = new Date(Date.UTC(+key.slice(0, 4), +key.slice(5, 7) - 1, +key.slice(8, 10) + n));
  return `${t.getUTCFullYear()}-${pad2(t.getUTCMonth() + 1)}-${pad2(t.getUTCDate())}`;
}

/** Move a YYYY-MM or YYYY-MM-DD key by whole months; the day is clamped to the month. */
function addMonths(key: string, n: number): string {
  const total = +key.slice(0, 4) * 12 + (+key.slice(5, 7) - 1) + n;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  if (key.length < 10) return `${y}-${pad2(m)}`;
  return `${y}-${pad2(m)}-${pad2(Math.min(+key.slice(8, 10), daysIn(y, m)))}`;
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

// Stage names for the calendar header
const STAGE_NAMES: Record<string, { eyebrow: string; subject: string }> = {
  'risk-knowledge': { eyebrow: 'Risk Knowledge · EM-DAT', subject: 'disaster events' },
  'risk-monitoring': { eyebrow: 'Risk Monitoring', subject: 'risk calendar' },
};

// Fixed label widths
const LABEL_WIDTH_MONTHLY = 42;
const LABEL_WIDTH_DAILY = 30;
// Day-of-month rows labelled in the daily view.
const DAY_TICKS = [1, 5, 10, 15, 20, 25, 31];

/** True when a fill colour is dark enough that text on it should be white. */
function isDarkFill(fill?: string | null): boolean {
  if (!fill) return false;
  const c = d3.color(fill)?.rgb();
  if (!c) return false;
  const lum = (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) / 255;
  return lum < 0.55;
}

// ── Geometry shared by the render effects and the overlay layer ─────────────
// Each render effect records how a cell key maps to pixels, so the selection
// ring, hover/focus markers and keyboard cursor are drawn on top WITHOUT
// re-running the d3 grid (hover never re-renders the 2,976 daily cells).
type Box = { x: number; y: number; w: number; h: number };
interface Layout {
  kind: 'monthly' | 'daily' | 'strip-daily' | 'strip-monthly';
  min: string;                 // first key in the grid
  max: string;                 // last key in the grid
  svgWidth: number;
  labelWidth: number;
  cellBox: (key: string) => Box | null;
  colMarker: (key: string) => { x: number; y: number; text: string } | null;
  rowMarker: (key: string) => { y: number; text: string; row: number } | null;
  rowMarkerMode: 'pill' | 'class';
  yearBox?: (year: number) => Box | null;
}

interface CellText { date: string; lines: string[]; clickable: boolean }

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
  const gridRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const liveRef = useRef<HTMLDivElement>(null);
  const layoutRef = useRef<Layout | null>(null);
  const hoverKeyRef = useRef<string | null>(null);
  const activeKeyRef = useRef<string | null>(null);   // keyboard cursor
  const focusedRef = useRef(false);
  const keyboardRef = useRef(false);                   // cursor driven by keys / navigator
  const pointerFocusRef = useRef(false);               // focus arrived from a click
  const { width } = useResizeObserver(containerRef, 960, 360);
  const [data, setData] = useState<EmdatMonthDatum[]>([]);
  const [ibfSummary, setIbfSummary] = useState<Map<string, IbfCalendarDatum>>(new Map());
  // Country-filtered counts (focusCountry), keyed like ibfSummary.
  const [countrySummary, setCountrySummary] = useState<Map<string, IbfCalendarDatum>>(new Map());
  const [countryLoading, setCountryLoading] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [cursorYear, setCursorYear] = useState<number | null>(null);
  const { hazard, stage, selectedMonth, selectedWindow, setSelectedEventKey, setSelectedMonth } =
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

    // Flood risk-monitoring draws TWO networks on one heatmap: the legacy daily
    // BN over its 2019+ event episodes, and the medium-range CRMA over its 176
    // 2026 initialisations. Fetched together and merged, because the calendar is
    // where a user discovers which dates either network can answer for.
    const sources: Promise<IbfCalendarDatum[]>[] =
      hazard === 'drought'
        ? [fetchIbfDroughtCalendar()]
        : [
            fetchIbfFloodCalendar(),
            fetchCrmaMrCalendar({ window: (selectedWindow ?? 'D1') as CrmaMrWindow })
              .then((r) => r.data as unknown as IbfCalendarDatum[])
              // A medium-range outage must not blank the legacy half of the
              // calendar, so this degrades to the dates the daily BN covers.
              .catch((err) => {
                console.error('CRMA medium-range calendar fetch failed', err);
                return [] as IbfCalendarDatum[];
              }),
          ];

    Promise.all(sources)
      .then((results) => {
        if (cancelled) return;
        const map = new Map<string, IbfCalendarDatum>();
        results.flat().forEach((row) => {
          const key = hazard === 'drought'
            ? row.init_month ?? `${row.year}-${String(row.month).padStart(2, '0')}`
            : `${row.year}-${String(row.month).padStart(2, '0')}-${String(row.day ?? 0).padStart(2, '0')}`;
          // Medium-range rows are keyed on their INITIALISATION date, which is
          // what the cell represents and what a click selects. The two feeds do
          // not overlap (the daily BN stops at 2026-03-15 and only 2026-03-01..15
          // coincide), so on the fifteen shared days the medium-range row wins —
          // it is the network this stage is moving to.
          map.set(key, row);
        });
        setIbfSummary(map);
      })
      .catch((err) => console.error('IBF calendar fetch failed', err));
    return () => { cancelled = true; };
  }, [isRM, hazard, selectedWindow]);

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

  // Fetch data: RK uses parquet API, RM generates synthetic entries for all months
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
      // RM: generate one synthetic entry per month in range (every cell is clickable)
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
        // setSelectedMonth also clears the event, so the list re-shows and
        // the user picks one. (A separate setSelectedEventKey(null) here
        // pushed the stale month back into the URL.)
        setSelectedMonth(urlKey);
        return;
      }
      setSelectedMonth(urlKey);
    },
    [setSelectedMonth, isRK],
  );

  const years = useMemo(() => {
    const arr: number[] = [];
    for (let y = startYear; y <= endYear; y++) arr.push(y);
    return arr;
  }, [startYear, endYear]);

  // ── Plain-language cell description (tooltip + keyboard announcement) ─────
  // Rebuilt every render and read through a ref, so hover handlers always see
  // current data without the d3 effects depending on it. The numbers are the
  // same ones the fills are computed from (and that the old <title> showed).
  const describe = (key: string): CellText => {
    const date = formatKey(key);
    if (!inWindow(key)) return { date, lines: ['Outside the event window'], clickable: false };
    const monthKey = key.slice(0, 7);
    if (isRM) {
      const s = activeSummary.get(key);
      const scope = focusCountry ? ` in ${focusCountry}` : '';
      if (!s) return { date, lines: ['No model output for this date'], clickable: true };
      if (key.length >= 10 && isMrInit(key)) {
        // Also the accessibility relief for the light end of the ramp, whose
        // two lightest steps sit under 3:1 against the surface.
        const m = s as IbfCalendarDatum & {
          max_p_high_extreme?: number | null; n_basins?: number;
          n_high?: number; n_extreme?: number;
        };
        const p = typeof m.max_p_high_extreme === 'number' ? m.max_p_high_extreme.toFixed(2) : '—';
        return {
          date,
          lines: [
            `Medium-range · highest P(High∪Extreme) ${p} across ${m.n_basins ?? 0} basins`,
            `High: ${m.n_high ?? 0} · Extreme: ${m.n_extreme ?? 0}`,
            'CRMA sets no threshold — compare to a tolerance of your own',
          ],
          clickable: true,
        };
      }
      const total = s.n_monitor + s.n_evaluate + s.n_assess + s.n_actionable_risk;
      const net = hazard === 'flood' ? 'Daily BN' : 'Drought BN';
      return {
        date,
        lines: [
          `${net} · ${formatPct(pctActionable(s))} of regions at Actionable Risk (${s.n_actionable_risk} of ${total}${scope})`,
          `Assess: ${s.n_assess} · Evaluate: ${s.n_evaluate} · Monitor: ${s.n_monitor}`,
        ],
        clickable: true,
      };
    }
    if (isRK) {
      const bucket = grouped.get(monthKey) ?? [];
      // EM-DAT's event_count is the number of admin-1 regions a disaster
      // touched (it equals regions_affected on every row), so the cell number
      // is regions, not disasters. Say both, so "18" never reads as 18 events.
      const n = bucket.reduce((a, c) => a + c.event_count, 0);
      const k = bucket.length;
      if (!k) return { date, lines: ['EM-DAT · No recorded disasters'], clickable: false };
      return {
        date,
        lines: [`EM-DAT · ${k} disaster${k === 1 ? '' : 's'} · ${n} region${n === 1 ? '' : 's'} affected`],
        clickable: true,
      };
    }
    return { date, lines: [], clickable: true };
  };
  const describeRef = useRef(describe);
  describeRef.current = describe;

  // ── Overlay layer: selection ring + axis markers, hover, keyboard cursor ───
  const drawOverlays = useCallback(() => {
    const L = layoutRef.current;
    if (!svgRef.current || !labelSvgRef.current || !L) return;
    const svg = d3.select(svgRef.current);
    const lsvg = d3.select(labelSvgRef.current);
    svg.selectAll('g.cal-ov').remove();
    lsvg.selectAll('g.cal-ov').remove();
    lsvg.selectAll('.month-label').classed('is-sel', false).classed('is-hover', false);
    const ov = svg.append('g').attr('class', 'cal-ov').attr('pointer-events', 'none');
    const lov = lsvg.append('g').attr('class', 'cal-ov').attr('pointer-events', 'none');

    const pill = (
      g: d3.Selection<SVGGElement, unknown, null, undefined>,
      cx: number, cy: number, text: string, variant: 'sel' | 'hover',
      anchor: 'middle' | 'end', maxX: number,
    ) => {
      const w = text.length * 7 + 10;
      const h = 16;
      let x = anchor === 'middle' ? cx - w / 2 : cx - w;
      x = Math.max(0, Math.min(maxX - w, x));
      const pg = g.append('g').attr('class', `cal-pill cal-pill--${variant}`);
      pg.append('rect').attr('x', x).attr('y', cy - h / 2).attr('width', w).attr('height', h).attr('rx', h / 2);
      pg.append('text').attr('x', x + w / 2).attr('y', cy).attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'central').text(text);
    };

    const ring = (b: Box, off: number, cls: string) =>
      ov.append('rect').attr('class', cls)
        .attr('x', b.x - off).attr('y', b.y - off)
        .attr('width', b.w + 2 * off).attr('height', b.h + 2 * off)
        .attr('rx', Math.min(3, (b.w + 2 * off) / 4));

    const markAxes = (key: string, variant: 'sel' | 'hover') => {
      const c = L.colMarker(key);
      if (c) pill(ov, c.x, c.y, c.text, variant, 'middle', L.svgWidth);
      const r = L.rowMarker(key);
      if (!r) return;
      if (L.rowMarkerMode === 'pill') pill(lov, L.labelWidth - 1, r.y, r.text, variant, 'end', L.labelWidth);
      else lsvg.selectAll(`.month-label[data-row="${r.row}"]`).classed(`is-${variant}`, true);
    };

    const raw = selectedMonthRef.current;
    const sel = raw ? (mode === 'daily' ? raw : raw.slice(0, 7)) : null;
    const hover = hoverKeyRef.current;
    const active = focusedRef.current && keyboardRef.current ? activeKeyRef.current : null;

    // Year outline for the keyboard cursor / year navigator — an outline only,
    // so it never tints the data colours.
    if (active && L.yearBox) {
      const yb = L.yearBox(parseInt(active.slice(0, 4), 10));
      if (yb) {
        ov.append('rect').attr('class', 'cal-yearband')
          .attr('x', yb.x - 2).attr('y', yb.y - 2).attr('width', yb.w + 4).attr('height', yb.h + 4).attr('rx', 4);
      }
    }

    const pointer = active ?? hover;
    if (pointer && pointer !== sel) {
      const b = L.cellBox(pointer);
      if (b) ring(b, 1, 'cal-ring cal-ring--hover');
      markAxes(pointer, 'hover');
    }
    if (sel) {
      const b = L.cellBox(sel);
      if (b) {
        ring(b, 1.5, 'cal-ring cal-ring--sel-outer');
        ring(b, 0, 'cal-ring cal-ring--sel-inner');
        markAxes(sel, 'sel');
      }
    }
    if (active) {
      const b = L.cellBox(active);
      if (b) ring(b, 3.5, 'cal-ring cal-ring--focus');
    }
  }, [mode]);

  // ── Tooltip (HTML over the card; DOM-only, no React state on hover) ───────
  const hideTip = useCallback(() => {
    if (tipRef.current) tipRef.current.hidden = true;
  }, []);

  const showTipFor = useCallback((key: string) => {
    const tip = tipRef.current;
    const card = containerRef.current;
    const svgEl = svgRef.current;
    if (!tip || !card || !svgEl) return;
    const el = svgEl.querySelector(`.calendar-cell[data-date="${key}"]`);
    if (!el) { tip.hidden = true; return; }
    const info = describeRef.current(key);
    tip.replaceChildren();
    const add = (cls: string, text: string) => {
      const div = document.createElement('div');
      div.className = cls;
      div.textContent = text;
      tip.appendChild(div);
    };
    add('cal-tip__date', info.date);
    info.lines.forEach((l, i) => add(i === 0 ? 'cal-tip__value' : 'cal-tip__line', l));
    if (info.clickable) {
      add('cal-tip__cta', keyboardRef.current && focusedRef.current
        ? 'Press Enter to view on map' : 'Click to view on map');
    }
    tip.hidden = false;
    const cr = card.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const tw = tip.offsetWidth;
    const th = tip.offsetHeight;
    let left = r.left + r.width / 2 - cr.left - card.clientLeft - tw / 2;
    left = Math.max(4, Math.min(card.clientWidth - tw - 4, left));
    let top = r.top - cr.top - card.clientTop - th - 10;
    if (top < 4) top = r.bottom - cr.top - card.clientTop + 10;
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
  }, []);

  // ── MONTHLY CALENDAR ──
  useEffect(() => {
    // Scenario window → the compact strip effect below draws instead.
    if (hasWindow) return;
    if (!svgRef.current || !labelSvgRef.current || mode !== 'monthly' || years.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    const labelSvg = d3.select(labelSvgRef.current);
    labelSvg.selectAll('*').remove();

    const colorScale = getColorScale(hazard);
    const padding = { top: 34, right: 8, bottom: 8 };
    // A window of years fills the card (≈10 on a laptop, fewer on phones,
    // more on wide screens); the rest scroll sideways under a scrollbar.
    // Cells stay big enough for readable counts. Layout only.
    const availW = Math.max(160, width - LABEL_WIDTH_MONTHLY - padding.right - 4);
    const visibleYears = availW < 300 ? 6 : availW < 480 ? 8 : availW < 900 ? 10 : 14;
    const cellWidth = availW / Math.min(visibleYears, years.length);
    const gapX = Math.min(3, Math.max(1, cellWidth * 0.15));
    // Counts only where a number fits; the tooltip always carries it.
    const showCounts = cellWidth >= 18;
    // Count text scales with the cell so 2–3 digits still fit.
    const countFont = `${Math.min(12, Math.max(8, cellWidth * 0.48)).toFixed(1)}px`;
    // Year labels: a round step (1/2/5/10 years) wide enough that 12px
    // four-digit years never collide; labels sit on round years.
    const need = 36 / cellWidth;
    const yearStep = [1, 2, 5, 10, 20].find((s) => s >= need) ?? 20;
    const labelled = (y: number) => yearStep === 1 || y % yearStep === 0;
    // Rows stay at least 18px so 12px month names never touch.
    const cellHeight = Math.max(18, Math.min(28, cellWidth + 6));
    const gapY = 3;
    const cellW = cellWidth - gapX;
    const cellH = cellHeight - gapY;
    const svgWidth = padding.right + years.length * cellWidth;
    const svgHeight = padding.top + padding.bottom + 12 * cellHeight;

    svg.attr('width', svgWidth).attr('height', svgHeight);
    const g = svg.append('g').attr('transform', `translate(0, ${padding.top})`);

    // Fixed labels
    labelSvg.attr('width', LABEL_WIDTH_MONTHLY).attr('height', svgHeight);
    const lg = labelSvg.append('g').attr('transform', `translate(${LABEL_WIDTH_MONTHLY}, ${padding.top})`);
    lg.selectAll('text.month').data(MONTHS).enter().append('text')
      .attr('class', 'month-label')
      .attr('data-row', (_d, i) => i)
      .attr('x', -6).attr('y', (_d, i) => i * cellHeight + cellH / 2)
      .attr('dominant-baseline', 'central')
      .attr('text-anchor', 'end').text((d) => d);

    // Year labels start at their column; one that would run off the right edge
    // flips to end-anchored so it is never clipped, and is dropped if the flip
    // would make it collide with the previous label. A tick ties each to its column.
    const LABEL_PX = 32;
    let lastEnd = -Infinity;
    years.forEach((y, i) => {
      if (!labelled(y)) return;
      const flip = i * cellWidth + LABEL_PX > svgWidth;
      const x = flip ? i * cellWidth + cellW : i * cellWidth + 1;
      const x0 = flip ? x - LABEL_PX : x;
      if (x0 < lastEnd + 4) return;
      lastEnd = x0 + LABEL_PX;
      g.append('text').attr('class', 'year-label cal-yearlabel')
        .attr('x', x).attr('y', -12).attr('text-anchor', flip ? 'end' : 'start').text(y);
      const tx = (flip ? i * cellWidth + cellW : i * cellWidth) + 0.5;
      g.append('line').attr('class', 'cal-tick').attr('x1', tx).attr('x2', tx).attr('y1', -7).attr('y2', -2);
    });

    const cellData = MONTHS.flatMap((_m, row) =>
      years.map((year, col) => ({
        key: `${year}-${String(row + 1).padStart(2, '0')}`,
        row, col,
      })),
    );

    const clickable = (key: string) => {
      // Scenario window: out-of-window cells are inert context.
      if (hasWindow && !inWindow(key)) return false;
      // RK: cells with no events are inert.
      if (isRK) return (grouped.get(key)?.length ?? 0) > 0;
      return true;
    };

    const cells = g.append('g').selectAll('g.cell').data(cellData).enter().append('g')
      .attr('class', 'cell-group')
      .attr('transform', (d) => `translate(${d.col * cellWidth}, ${d.row * cellHeight})`)
      .style('cursor', (d) => (clickable(d.key) ? 'pointer' : 'default'))
      .on('click', (_e, d) => {
        if (hasWindow && !inWindow(d.key)) return;
        handleCellClick(d.key, d.key);
      });

    cells.append('rect')
      .attr('width', cellW).attr('height', cellH)
      .attr('rx', Math.min(3, cellW / 4)).attr('ry', Math.min(3, cellW / 4))
      .attr('class', 'calendar-cell')
      .attr('data-key', (d) => d.key)
      .attr('data-date', (d) => d.key)
      .style('cursor', (d) => (clickable(d.key) ? 'pointer' : 'default'))
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
        if (!isRK) return '#d0d7de'; // fallback: uniform light colour (no aggregate)
        const peak = bucket.reduce((a, c) => Math.max(a, c.event_count), 0);
        return colorScale(peak);
      });

    if ((isRK || isRM) && showCounts) {
      cells.append('text')
        .attr('x', 3).attr('y', cellH / 2)
        .attr('dominant-baseline', 'central')
        .attr('class', 'cell-count').attr('pointer-events', 'none')
        .style('font-size', countFont)
        .style('fill', function () {
          // Contrast follows the cell it sits on (presentation only).
          const rect = (this as SVGTextElement).parentNode?.querySelector('rect');
          return isDarkFill(rect?.getAttribute('fill')) ? '#ffffff' : '#1b1b1b';
        })
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

    const colOf = (key: string) => years.indexOf(parseInt(key.slice(0, 4), 10));
    layoutRef.current = {
      kind: 'monthly',
      min: `${startYear}-01`,
      max: `${endYear}-12`,
      svgWidth,
      labelWidth: LABEL_WIDTH_MONTHLY,
      rowMarkerMode: 'class',
      cellBox: (key) => {
        const c = colOf(key);
        if (c < 0) return null;
        const r = parseInt(key.slice(5, 7), 10) - 1;
        return { x: c * cellWidth, y: padding.top + r * cellHeight, w: cellW, h: cellH };
      },
      colMarker: (key) => {
        const c = colOf(key);
        return c < 0 ? null : { x: c * cellWidth + cellW / 2, y: padding.top - 16, text: key.slice(0, 4) };
      },
      rowMarker: (key) => {
        const r = parseInt(key.slice(5, 7), 10) - 1;
        return { y: 0, text: MONTHS[r], row: r };
      },
      yearBox: (y) => {
        const c = years.indexOf(y);
        return c < 0 ? null : { x: c * cellWidth, y: padding.top, w: cellW, h: 12 * cellHeight - gapY };
      },
    };

    // Scroll: open on the first years; a selected month is brought into view.
    if (!selectedMonth && !activeKeyRef.current) setCursorYear(years[0]);
    if (scrollRef.current) {
      let scrollTarget = 0;
      if (selectedMonth && svgWidth > width) {
        const year = parseInt(selectedMonth.split('-')[0], 10);
        const colIdx = years.indexOf(year);
        if (colIdx >= 0) scrollTarget = Math.max(0, colIdx * cellWidth - availW / 2);
      }
      scrollRef.current.scrollLeft = scrollTarget;
    }
    drawOverlays();
  }, [data, width, hazard, mode, handleCellClick, years, grouped, isRK, isRM, activeSummary, hasWindow, inWindow]);

  // ── DAILY CALENDAR ──
  useEffect(() => {
    if (hasWindow) return;
    if (!svgRef.current || !labelSvgRef.current || mode !== 'daily' || years.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    const labelSvg = d3.select(labelSvgRef.current);
    labelSvg.selectAll('*').remove();

    const padding = { top: 42, right: 8, bottom: 8 };
    const cellSize = 16;
    const gap = 1;

    const columns: { year: number; month: number; key: string }[] = [];
    for (let y = startYear; y <= endYear; y++) {
      for (let m = 1; m <= 12; m++) {
        columns.push({ year: y, month: m, key: `${y}-${String(m).padStart(2, '0')}` });
      }
    }

    // Fluid columns: all years fit the card (min 4px per month column).
    // Fill the card exactly: fractional column width (no rounding, so no uneven
    // gaps or dead space on the right), capped at the original 17px.
    const availDaily = Math.max(160, width - LABEL_WIDTH_DAILY - padding.right - 4);
    const colWidth = Math.min(cellSize + gap, availDaily / columns.length);
    // Gap scales with the cell; below ~5px columns touch and read as a heat strip.
    const gapX = colWidth >= 5 ? Math.min(gap, colWidth * 0.18) : 0;
    const cellW = colWidth - gapX;
    // Near-square cells: row height follows the column width (7–17px), so narrow
    // screens get a compact heatmap instead of tall thin bars.
    const rowHeight = Math.max(7, Math.min(cellSize + gap, colWidth * 1.15));
    const cellH = Math.max(5, rowHeight - Math.max(gapX, 1));
    const svgWidth = padding.right + columns.length * colWidth;
    // Month initials only when a 12px letter fits; otherwise a tick per month.
    const showMonthInitials = colWidth >= 11;
    const showMonthTicks = !showMonthInitials && colWidth >= 2.5;
    // Year labels: 12px "2019" needs ~34px; fall back to "’19" (~24px), and
    // only then thin, so labels never collide.
    const yearPx = colWidth * 12;
    const yearShort = yearPx < 36;
    const yearEvery = yearPx >= 25 ? 1 : Math.ceil(25 / yearPx);
    const svgHeight = padding.top + padding.bottom + 31 * rowHeight;

    svg.attr('width', svgWidth).attr('height', svgHeight);
    const g = svg.append('g').attr('transform', `translate(0, ${padding.top})`);

    // Fixed day-of-month labels (1, 5, 10 … 31), centred on their rows.
    labelSvg.attr('width', LABEL_WIDTH_DAILY).attr('height', svgHeight);
    const lg = labelSvg.append('g').attr('transform', `translate(${LABEL_WIDTH_DAILY}, ${padding.top})`);
    DAY_TICKS.forEach((d) => {
      lg.append('text').attr('class', 'month-label cal-daylabel')
        .attr('data-row', d - 1)
        .attr('x', -6).attr('y', (d - 1) * rowHeight + cellH / 2)
        .attr('dominant-baseline', 'central')
        .attr('text-anchor', 'end').text(d);
    });
    labelSvg.append('text').attr('class', 'cal-axis-caption')
      .attr('x', LABEL_WIDTH_DAILY - 4).attr('y', padding.top - 22)
      .attr('text-anchor', 'end').text('Day');

    // Column labels: the year starts at its January column (centred, a 4-digit
    // year spilled past the left edge and was clipped to "019").
    columns.forEach((col, ci) => {
      const x0 = ci * colWidth;
      if (col.month === 1 && (col.year - startYear) % yearEvery === 0) {
        g.append('text').attr('class', 'year-label cal-yearlabel')
          .attr('x', x0 + 2).attr('y', -22).attr('text-anchor', 'start')
          .text(yearShort ? `’${String(col.year).slice(2)}` : String(col.year));
      }
      if (showMonthInitials) {
        g.append('text').attr('class', 'year-label cal-monthlabel')
          .attr('x', x0 + cellW / 2).attr('y', -6).attr('text-anchor', 'middle')
          .text(MONTHS[col.month - 1].charAt(0));
      } else if (showMonthTicks && col.month !== 1) {
        // Quarter months (Apr / Jul / Oct) slightly longer, for orientation.
        const q = (col.month - 1) % 3 === 0;
        g.append('line').attr('class', 'cal-tick')
          .attr('x1', x0).attr('x2', x0).attr('y1', q ? -8 : -5).attr('y2', -2);
      }
    });

    const dayCells: { col: number; day: number; key: string; dateKey: string; valid: boolean }[] = [];
    columns.forEach((col, ci) => {
      const daysInMonth = new Date(col.year, col.month, 0).getDate();
      for (let d = 1; d <= 31; d++) {
        dayCells.push({ col: ci, day: d, key: col.key, dateKey: `${col.key}-${pad2(d)}`, valid: d <= daysInMonth });
      }
    });

    g.append('g').selectAll('rect.day').data(dayCells).enter().append('rect')
      .attr('class', 'calendar-cell')
      .attr('data-key', (d) => d.key)
      .attr('data-date', (d) => (d.valid ? d.dateKey : null))
      .attr('width', cellW).attr('height', cellH)
      .attr('rx', Math.min(2, cellW / 4)).attr('ry', Math.min(2, cellW / 4))
      .attr('x', (d) => d.col * colWidth)
      .attr('y', (d) => (d.day - 1) * rowHeight)
      .attr('fill', (d) => {
        if (!d.valid) return '#fafafa';
        const dateKey = d.dateKey;
        if (hasWindow && !inWindow(dateKey)) return OUT_OF_WINDOW_FILL;
        if (isRM) {
          const s = activeSummary.get(dateKey) as IbfCalendarDatum & { level?: number };
          if (!s) return '#e8e8e8';
          // Two networks, two meanings. The medium-range half carries a BELIEF
          // — the severe-end mass of the posterior — on a sequential ramp. The
          // legacy half still has a decision ladder behind it and keeps its
          // traffic light. Colouring both the same way would assert they are
          // the same kind of statement.
          return isMrInit(dateKey)
            ? pSevereColor(s.level)
            : actionablePctColor(pctActionable(s));
        }
        return '#d0d7de';
      })
      // A medium-range cell is outlined, because the fill means something
      // different on either side of the boundary: % of 55 BASINS here against
      // % of 227 admin-1 UNITS on the legacy days. Same scale, different
      // denominator — the legend says so, and the outline says which is which.
      .attr('stroke', (d) => {
        if (!d.valid || !isRM) return 'none';
        return isMrInit(d.dateKey) ? '#7c3aed' : 'none';
      })
      .attr('stroke-width', (d) => {
        if (!d.valid || !isRM) return 0;
        // Thinner outline on small cells so it doesn't swallow the fill.
        return isMrInit(d.dateKey) ? (cellW >= 8 ? 1 : 0.5) : 0;
      })
      .attr('opacity', (d) => {
        if (!d.valid) return 0.3;
        return hasWindow && !inWindow(d.dateKey) ? 0.4 : 1;
      })
      .style('cursor', (d) => {
        if (!d.valid) return 'default';
        return hasWindow && !inWindow(d.dateKey) ? 'default' : 'pointer';
      })
      .on('click', (_e, d) => {
        if (!d.valid) return;
        const dateKey = d.dateKey;
        if (hasWindow && !inWindow(dateKey)) return;
        handleCellClick(dateKey, d.key);
      });

    // Year separators, run up through the header so each year reads as a block.
    columns.forEach((col, ci) => {
      if (col.month === 1 && ci > 0) {
        const x = ci * colWidth - gapX / 2;
        g.append('line').attr('class', 'cal-yearsep').attr('x1', x).attr('x2', x)
          .attr('y1', -34).attr('y2', 31 * rowHeight);
      }
    });

    const colOf = (key: string) =>
      (parseInt(key.slice(0, 4), 10) - startYear) * 12 + parseInt(key.slice(5, 7), 10) - 1;
    layoutRef.current = {
      kind: 'daily',
      min: `${startYear}-01-01`,
      max: `${endYear}-12-31`,
      svgWidth,
      labelWidth: LABEL_WIDTH_DAILY,
      rowMarkerMode: 'pill',
      cellBox: (key) => {
        if (key.length < 10) return null;
        const c = colOf(key);
        if (c < 0 || c >= columns.length) return null;
        const d = parseInt(key.slice(8, 10), 10);
        return { x: c * colWidth, y: padding.top + (d - 1) * rowHeight, w: cellW, h: cellH };
      },
      colMarker: (key) => {
        const c = colOf(key);
        if (c < 0 || c >= columns.length) return null;
        return { x: c * colWidth + cellW / 2, y: padding.top - 9, text: formatKey(key.slice(0, 7)) };
      },
      rowMarker: (key) => {
        if (key.length < 10) return null;
        const d = parseInt(key.slice(8, 10), 10);
        return { y: padding.top + (d - 1) * rowHeight + cellH / 2, text: String(d), row: d - 1 };
      },
      yearBox: (y) => {
        const c = (y - startYear) * 12;
        if (c < 0 || c >= columns.length) return null;
        return { x: c * colWidth, y: padding.top, w: 12 * colWidth - gapX, h: 30 * rowHeight + cellH };
      },
    };

    if (scrollRef.current && svgWidth > width) {
      let scrollTarget = svgWidth - width;
      if (selectedMonth) {
        const monthKey = selectedMonth.slice(0, 7);
        const colIdx = columns.findIndex((c) => c.key === monthKey);
        if (colIdx >= 0) scrollTarget = Math.max(0, colIdx * colWidth - width / 2);
      }
      scrollRef.current.scrollLeft = scrollTarget;
    }
    drawOverlays();
  }, [data, width, hazard, mode, handleCellClick, years, grouped, startYear, endYear, isRM, activeSummary, hasWindow, inWindow]);

  // ── EVENT-WINDOW STRIP (scenario mode only) ──
  // When windowStart/windowEnd are given, draw only the periods covering the
  // event instead of the full year grid, so a scenario round fits on one
  // screen. Daily: one row per month × 31 day columns. Monthly: one row per
  // year × 12 month columns (drought windows cross year boundaries). Fills,
  // data-key, click gating and tooltips follow the dashboard rules above.
  useEffect(() => {
    if (!hasWindow) return;
    if (!svgRef.current || !labelSvgRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    const labelSvg = d3.select(labelSvgRef.current);
    labelSvg.selectAll('*').remove();

    const padding = { top: 26, right: 4, bottom: 4 };
    const narrow = width < 480;
    // Daily rows read "Apr 2019" ("Apr ’19" on phones); monthly rows a year.
    const labelWidth = mode === 'daily' ? (narrow ? 64 : 84) : 48;
    const nCols = mode === 'daily' ? 31 : 12;
    // Cells stretch to the card width (fractional) and shrink on phones
    // instead of being clipped by the strip's hidden overflow.
    const avail = Math.max(120, width - labelWidth - padding.right - 4);
    const colWidth = Math.max(
      mode === 'daily' ? 6 : 16,
      Math.min(mode === 'daily' ? 28 : 64, avail / nCols),
    );
    const gap = mode === 'daily' ? (colWidth >= 12 ? 2 : 1) : (colWidth >= 24 ? 4 : 2);
    const cellW = colWidth - gap;
    const cellH = mode === 'daily' ? Math.min(28, Math.max(12, cellW)) : 30;
    const rowHeight = cellH + gap;

    // Rows: months (daily) or years (monthly) spanned by the window.
    const rows: { year: number; month: number; label: string }[] = [];
    if (mode === 'daily') {
      let y = parseInt(windowStart!.slice(0, 4), 10);
      let m = parseInt(windowStart!.slice(5, 7), 10);
      const endY = parseInt(windowEnd!.slice(0, 4), 10);
      const endM = parseInt(windowEnd!.slice(5, 7), 10);
      while (y < endY || (y === endY && m <= endM)) {
        rows.push({ year: y, month: m, label: narrow ? `${MONTHS[m - 1]} ’${String(y).slice(2)}` : `${MONTHS[m - 1]} ${y}` });
        m += 1;
        if (m > 12) { m = 1; y += 1; }
      }
    } else {
      const y0 = parseInt(windowStart!.slice(0, 4), 10);
      const y1 = parseInt(windowEnd!.slice(0, 4), 10);
      for (let y = y0; y <= y1; y++) rows.push({ year: y, month: 0, label: String(y) });
    }

    const svgWidth = padding.right + nCols * colWidth;
    const svgHeight = padding.top + padding.bottom + rows.length * rowHeight;
    svg.attr('width', svgWidth).attr('height', svgHeight);
    const g = svg.append('g').attr('transform', `translate(0, ${padding.top})`);

    labelSvg.attr('width', labelWidth).attr('height', svgHeight);
    const lg = labelSvg.append('g').attr('transform', `translate(${labelWidth}, ${padding.top})`);
    lg.selectAll('text.row').data(rows).enter().append('text')
      .attr('class', 'month-label scn-cal-rowlabel')
      .attr('data-row', (_d, i) => i)
      .attr('x', -8).attr('y', (_d, i) => i * rowHeight + cellH / 2)
      .attr('dominant-baseline', 'central')
      .attr('text-anchor', 'end').text((d) => d.label);

    // Column header: day numbers (daily) or month names / initials (monthly).
    for (let c = 0; c < nCols; c++) {
      // Day ticks 1, 5, 10 … 25, 31 (as on the dashboard); "30" beside "31" collided.
      const show = mode === 'monthly' || DAY_TICKS.includes(c + 1);
      if (!show) continue;
      g.append('text').attr('class', 'year-label scn-cal-collabel')
        .attr('x', c * colWidth + cellW / 2).attr('y', -9)
        .attr('text-anchor', 'middle')
        .text(mode === 'daily' ? String(c + 1) : (colWidth >= 30 ? MONTHS[c] : MONTHS[c].charAt(0)));
    }

    type Cell = { row: number; col: number; key: string; dateKey: string; valid: boolean };
    const cells: Cell[] = [];
    rows.forEach((r, ri) => {
      if (mode === 'daily') {
        const dim = new Date(r.year, r.month, 0).getDate();
        const monthKey = `${r.year}-${pad2(r.month)}`;
        for (let d = 1; d <= 31; d++) {
          cells.push({ row: ri, col: d - 1, key: monthKey, dateKey: `${monthKey}-${pad2(d)}`, valid: d <= dim });
        }
      } else {
        for (let m = 1; m <= 12; m++) {
          const k = `${r.year}-${pad2(m)}`;
          cells.push({ row: ri, col: m - 1, key: k, dateKey: k, valid: true });
        }
      }
    });

    const fillFor = (d: Cell): string => {
      if (!d.valid) return '#fafafa';
      if (!inWindow(d.dateKey)) return OUT_OF_WINDOW_FILL;
      if (isRM) {
        const s = activeSummary.get(d.dateKey) as (IbfCalendarDatum & { level?: number }) | undefined;
        if (!s) return '#e8e8e8';
        if (mode === 'daily' && isMrInit(d.dateKey)) return pSevereColor(s.level);
        return actionablePctColor(pctActionable(s));
      }
      if (isRK && mode === 'monthly') {
        const bucket = grouped.get(d.key);
        if (!bucket?.length) return '#f5f5f5';
        return getColorScale(hazard)(bucket.reduce((a, c) => Math.max(a, c.event_count), 0));
      }
      return '#d0d7de';
    };

    const sel = g.append('g').selectAll('g.cell').data(cells).enter().append('g')
      .attr('class', 'cell-group')
      .attr('transform', (d) => `translate(${d.col * colWidth}, ${d.row * rowHeight})`)
      .style('cursor', (d) => (d.valid && inWindow(d.dateKey) ? 'pointer' : 'default'))
      .on('click', (_e, d) => {
        if (!d.valid || !inWindow(d.dateKey)) return;
        handleCellClick(d.dateKey, d.key);
      });

    sel.append('rect')
      .attr('class', 'calendar-cell')
      .attr('data-key', (d) => d.key)
      .attr('data-date', (d) => (d.valid ? d.dateKey : null))
      .attr('data-mr', (d) => (isRM && mode === 'daily' && d.valid && isMrInit(d.dateKey) ? '1' : null))
      .attr('width', cellW).attr('height', cellH)
      .attr('rx', Math.min(3, cellW / 4)).attr('ry', Math.min(3, cellW / 4))
      .attr('fill', fillFor)
      .style('cursor', (d) => (d.valid && inWindow(d.dateKey) ? 'pointer' : 'default'))
      .attr('opacity', (d) => (!d.valid ? 0.3 : inWindow(d.dateKey) ? 1 : 0.4));

    if (isRM && mode === 'monthly') {
      sel.append('text')
        .attr('x', 4).attr('y', cellH / 2)
        .attr('dominant-baseline', 'central')
        .attr('class', 'cell-count').attr('pointer-events', 'none')
        // Light text on the two darkest steps of the ramp, for contrast.
        .style('fill', (d) => {
          const s = activeSummary.get(d.dateKey);
          return s && inWindow(d.dateKey) && pctActionable(s) >= 20 ? '#fff' : null;
        })
        .text((d) => {
          if (!inWindow(d.dateKey)) return '';
          const s = activeSummary.get(d.dateKey);
          return s ? s.n_actionable_risk.toString() : '';
        });
    }

    const isDaily = mode === 'daily';
    const rowOf = (key: string) => rows.findIndex((r) =>
      isDaily ? r.year === +key.slice(0, 4) && r.month === +key.slice(5, 7) : r.year === +key.slice(0, 4));
    const colOfKey = (key: string) => (isDaily ? +key.slice(8, 10) - 1 : +key.slice(5, 7) - 1);
    const first = rows[0];
    const last = rows[rows.length - 1];
    layoutRef.current = {
      kind: isDaily ? 'strip-daily' : 'strip-monthly',
      min: isDaily ? `${first.year}-${pad2(first.month)}-01` : `${first.year}-01`,
      max: isDaily ? `${last.year}-${pad2(last.month)}-${pad2(daysIn(last.year, last.month))}` : `${last.year}-12`,
      svgWidth,
      labelWidth,
      rowMarkerMode: 'class',
      cellBox: (key) => {
        if (isDaily !== (key.length >= 10)) return null;
        const r = rowOf(key);
        if (r < 0) return null;
        return { x: colOfKey(key) * colWidth, y: padding.top + r * rowHeight, w: cellW, h: cellH };
      },
      colMarker: (key) => {
        if (isDaily !== (key.length >= 10)) return null;
        const c = colOfKey(key);
        return { x: c * colWidth + cellW / 2, y: padding.top - 13, text: isDaily ? String(c + 1) : MONTHS[c] };
      },
      rowMarker: (key) => {
        const r = rowOf(key);
        return r < 0 ? null : { y: 0, text: '', row: r };
      },
    };

    if (scrollRef.current) scrollRef.current.scrollLeft = 0;
    applyStripHighlight();
    drawOverlays();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasWindow, windowStart, windowEnd, data, width, hazard, mode, handleCellClick, grouped, isRK, isRM, activeSummary, inWindow]);

  // Strip highlight: outline the exact cursor cell (the day, in daily mode) and
  // keep the medium-range outline elsewhere, so the active round's day stands
  // out inside a 1–2 month strip rather than the whole month being outlined.
  function applyStripHighlight() {
    if (!svgRef.current) return;
    const cursor = selectedMonthRef.current;
    d3.select(svgRef.current).selectAll<SVGRectElement, unknown>('.calendar-cell').each(function () {
      const el = d3.select(this);
      // Inline style, not attr: the stylesheet's `.calendar-cell { stroke }`
      // outranks an SVG presentation attribute.
      if (cursor && el.attr('data-date') === cursor) el.style('stroke', '#111827').style('stroke-width', '3px');
      else if (el.attr('data-mr') === '1') el.style('stroke', '#7c3aed').style('stroke-width', '1px');
      else el.style('stroke', 'rgba(0,0,0,0.08)').style('stroke-width', '0.5px');
    });
  }

  useEffect(() => {
    if (hasWindow) { applyStripHighlight(); drawOverlays(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasWindow, selectedMonth]);

  // Highlight active cell (dashboard; the window strip uses applyStripHighlight)
  useEffect(() => {
    if (!svgRef.current || hasWindow) return;
    const svg = d3.select(svgRef.current);
    // Inline style, not attr: the stylesheet's `.calendar-cell { stroke }`
    // outranks an SVG presentation attribute, which is why the outline never showed.
    svg.selectAll<SVGRectElement, unknown>('.calendar-cell')
      .style('stroke', null).style('stroke-width', null);

    if (selectedMonth) {
      // Daily cells carry their full date (YYYY-MM-DD) in data-date, monthly
      // cells YYYY-MM. Matching the daily view on data-key (the month) never
      // matched a day, so the selected day was not marked at all.
      const key = mode === 'daily' ? selectedMonth : selectedMonth.slice(0, 7);
      const b = layoutRef.current?.cellBox(key);
      // Outline scales with the cell so it never swallows a 4px daily cell.
      const sw = b ? Math.max(1, Math.min(3, b.w * 0.3)) : 3;
      svg.selectAll<SVGRectElement, unknown>('.calendar-cell')
        .filter(function () { return d3.select(this).attr('data-date') === key; })
        .style('stroke', '#111827').style('stroke-width', `${sw}px`)
        .each(function () {
          // Raise the cell (or its cell group) above its neighbours.
          const parent = this.parentNode as Element | null;
          if (parent?.classList.contains('cell-group')) parent.parentNode?.appendChild(parent);
          else parent?.appendChild(this);
        });
    }
    drawOverlays();
  // activeSummary: the daily/monthly grids redraw when calendar data lands,
  // which wipes the inline outline — re-apply it after them.
  }, [selectedMonth, grouped, hasWindow, data, width, mode, hazard, years, activeSummary, drawOverlays]);

  // ── Hover (delegated; no d3 re-render, no React state) ────────────────────
  const keyFromTarget = (t: EventTarget | null): string | null => {
    const el = (t as Element | null)?.closest?.('.calendar-cell[data-date]');
    return el ? el.getAttribute('data-date') : null;
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const key = keyFromTarget(e.target);
    if (key === hoverKeyRef.current && !keyboardRef.current) return;
    hoverKeyRef.current = key;
    keyboardRef.current = false;
    drawOverlays();
    if (key) showTipFor(key); else hideTip();
  };
  const onPointerLeave = () => {
    hoverKeyRef.current = null;
    drawOverlays();
    hideTip();
  };
  const onPointerDown = (e: React.PointerEvent) => {
    pointerFocusRef.current = true;
    keyboardRef.current = false;
    const key = keyFromTarget(e.target);
    if (key) activeKeyRef.current = key;
  };

  // ── Keyboard: one tab stop; arrows move a cursor; Enter/Space select ──────
  // An aria-activedescendant-style pattern: the grid wrapper keeps focus, a
  // drawn cursor moves over the cells, and a polite live region reads each
  // cell. That keeps the 2,976-cell daily view to a single tab stop instead of
  // 2,976 focusable SVG nodes.
  const clampKey = (key: string): string => {
    const L = layoutRef.current;
    if (!L) return key;
    if (key < L.min) return L.min;
    if (key > L.max) return L.max;
    return key;
  };

  const latestKey = (): string | null => {
    const L = layoutRef.current;
    if (!L) return null;
    const daily = L.kind === 'daily' || L.kind === 'strip-daily';
    let best: string | null = null;
    const consider = (k: string) => {
      if ((k.length >= 10) !== daily) return;
      if (k < L.min || k > L.max) return;
      if (best === null || k > best) best = k;
    };
    if (isRM) activeSummary.forEach((_v, k) => consider(k));
    else if (isRK) grouped.forEach((v, k) => { if (v.length) consider(k); });
    return best ?? L.max;
  };

  const startKey = (): string | null => {
    const L = layoutRef.current;
    if (!L) return null;
    const raw = selectedMonthRef.current;
    const sel = raw ? (mode === 'daily' ? raw : raw.slice(0, 7)) : null;
    if (sel && L.cellBox(sel)) return sel;
    return latestKey();
  };

  const announce = (key: string) => {
    if (!liveRef.current) return;
    const info = describeRef.current(key);
    liveRef.current.textContent = [info.date, ...info.lines, info.clickable ? 'Press Enter to view on map' : '']
      .filter(Boolean).join('. ');
  };

  const scrollCellIntoView = (key: string) => {
    const sc = scrollRef.current;
    const b = layoutRef.current?.cellBox(key);
    if (!sc || !b || sc.scrollWidth <= sc.clientWidth) return;
    if (b.x < sc.scrollLeft) sc.scrollLeft = Math.max(0, b.x - 16);
    else if (b.x + b.w > sc.scrollLeft + sc.clientWidth) sc.scrollLeft = b.x + b.w - sc.clientWidth + 16;
  };

  const moveCursor = (key: string) => {
    const k = clampKey(key);
    activeKeyRef.current = k;
    keyboardRef.current = true;
    setCursorYear(parseInt(k.slice(0, 4), 10));
    scrollCellIntoView(k);
    drawOverlays();
    showTipFor(k);
    announce(k);
  };

  // ── Global shortcut: D + arrow keys change the selected date anywhere on
  // the dashboard (not only while the calendar has focus). Hold D and press
  // arrows, or tap D then use the arrows for ~1.5 s. ←/→ step one day
  // (daily) or month (monthly); ↑/↓ step a week or a year. Risk Knowledge
  // skips to the previous / next month that has recorded disasters. Same
  // selection path as a click or Enter, so the map, events and panels follow.
  const dateShortcutRef = useRef<(step: number, big: boolean) => void>(() => undefined);
  dateShortcutRef.current = (step: number, big: boolean) => {
    const L = layoutRef.current;
    if (!L || (L.kind !== 'daily' && L.kind !== 'monthly')) return;
    const daily = L.kind === 'daily';
    const raw = selectedMonthRef.current;
    let cur = raw ? (daily ? raw : raw.slice(0, 7)) : null;
    if (!cur || (daily && cur.length < 10) || !L.cellBox(cur)) cur = latestKey();
    if (!cur) return;
    const stepOnce = (k: string) =>
      daily ? addDays(k, big ? 7 * step : step) : addMonths(k, big ? 12 * step : step);
    let next: string | null = null;
    if (isRK) {
      // Walk to the nearest month in that direction that has events.
      let k = stepOnce(cur);
      while (k >= L.min && k <= L.max) {
        if ((grouped.get(k)?.length ?? 0) > 0) { next = k; break; }
        k = addMonths(k, step);
      }
    } else {
      next = clampKey(stepOnce(cur));
      const last = latestKey();
      if (step > 0 && last && next > last) next = last; // no stepping past the data
    }
    if (!next || next === cur) return;
    handleCellClick(next, next.slice(0, 7));
    setCursorYear(parseInt(next.slice(0, 4), 10));
    scrollCellIntoView(next);
    announce(next);
  };

  useEffect(() => {
    if (hasWindow) return; // scenario strips follow the round, not the keyboard
    let dDown = false;
    let dAt = 0;
    const typing = (t: EventTarget | null) => {
      const el = t as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
    };
    const dialogOpen = () => Boolean(document.querySelector('dialog[open], [role="dialog"][aria-modal="true"]'));
    const onDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || typing(e.target) || dialogOpen()) return;
      if (e.key === 'd' || e.key === 'D') { dDown = true; dAt = Date.now(); return; }
      const arrows: Record<string, [number, boolean]> = {
        ArrowLeft: [-1, false], ArrowRight: [1, false], ArrowUp: [-1, true], ArrowDown: [1, true],
      };
      const a = arrows[e.key];
      if (!a || !(dDown || Date.now() - dAt < 1500)) return;
      e.preventDefault();
      e.stopPropagation(); // capture phase: the focused grid's own arrows don't also fire
      dAt = Date.now();    // keep the tap-D window open while arrowing
      dateShortcutRef.current(a[0], a[1]);
    };
    const onUp = (e: KeyboardEvent) => { if (e.key === 'd' || e.key === 'D') dDown = false; };
    const reset = () => { dDown = false; dAt = 0; };
    window.addEventListener('keydown', onDown, true);
    window.addEventListener('keyup', onUp, true);
    window.addEventListener('blur', reset);
    return () => {
      window.removeEventListener('keydown', onDown, true);
      window.removeEventListener('keyup', onUp, true);
      window.removeEventListener('blur', reset);
    };
  }, [hasWindow]);

  const onGridFocus = () => {
    focusedRef.current = true;
    if (pointerFocusRef.current) { pointerFocusRef.current = false; return; } // a click handles itself
    const k = activeKeyRef.current ?? startKey();
    if (k) moveCursor(k);
  };
  const onGridBlur = () => {
    focusedRef.current = false;
    pointerFocusRef.current = false;
    drawOverlays();
    if (!hoverKeyRef.current) hideTip();
  };

  const onGridKeyDown = (e: React.KeyboardEvent) => {
    const L = layoutRef.current;
    if (!L) return;
    const cur = activeKeyRef.current ?? startKey();
    if (!cur) return;
    const daily = L.kind === 'daily' || L.kind === 'strip-daily';
    // Arrow keys follow the drawn axes: dashboard grids run time down rows
    // within a column; the scenario strip runs time along a row.
    const timeAlongRow = L.kind === 'strip-daily' || L.kind === 'strip-monthly';
    const fine = (n: number) => (daily ? addDays(cur, n) : addMonths(cur, n));
    const coarse = (n: number) => (daily ? addMonths(cur, n) : addMonths(cur, 12 * n));
    let next: string | null = null;
    switch (e.key) {
      case 'ArrowRight': next = timeAlongRow ? fine(1) : coarse(1); break;
      case 'ArrowLeft': next = timeAlongRow ? fine(-1) : coarse(-1); break;
      case 'ArrowDown': next = timeAlongRow ? coarse(1) : fine(1); break;
      case 'ArrowUp': next = timeAlongRow ? coarse(-1) : fine(-1); break;
      case 'PageDown': next = addMonths(cur, 12); break;
      case 'PageUp': next = addMonths(cur, -12); break;
      case 'Home': next = L.min; break;
      case 'End': next = L.max; break;
      case 'Enter':
      case ' ': {
        e.preventDefault();
        // Same gate and same handler as a mouse click on that cell.
        if (describeRef.current(cur).clickable) handleCellClick(cur, cur.slice(0, 7));
        return;
      }
      case 'Escape':
        keyboardRef.current = false;
        drawOverlays();
        hideTip();
        return;
      default:
        return;
    }
    e.preventDefault();
    if (next) moveCursor(next);
  };

  // ── Year navigator (dashboard views): moves the cursor, never the selection ─
  const jumpTo = (key: string) => {
    userScrollRef.current = false;
    keyboardRef.current = true;
    activeKeyRef.current = clampKey(key);
    gridRef.current?.focus({ preventScroll: true });
    moveCursor(key);
  };
  const goYear = (y: number) => {
    const y0 = Math.max(startYear, Math.min(endYear, y));
    const base = activeKeyRef.current ?? startKey() ?? `${y0}-01`;
    jumpTo(addMonths(base, (y0 - parseInt(base.slice(0, 4), 10)) * 12));
  };
  const goLatest = () => {
    const k = latestKey();
    if (k) jumpTo(k);
  };

  // Monthly view: when the user scrolls the year window (wheel, drag,
  // scrollbar), the year box follows the first year in view.
  const userScrollRef = useRef(false);
  const markUserScroll = () => { userScrollRef.current = true; };
  const onCalScroll = () => {
    if (!userScrollRef.current || mode !== 'monthly' || hasWindow) return;
    const sc = scrollRef.current;
    const L = layoutRef.current;
    if (!sc || !L || L.kind !== 'monthly') return;
    const first = years.find((y) => {
      const b = L.yearBox?.(y);
      return b ? b.x + b.w / 2 >= sc.scrollLeft : false;
    });
    if (first != null) setCursorYear(first);
  };

  // Keep the navigator's year in step with the selection.
  useEffect(() => {
    if (selectedMonth) setCursorYear(parseInt(selectedMonth.slice(0, 4), 10));
  }, [selectedMonth]);

  // Legend scoping: the dashboard (no window) shows both. A scenario window
  // shows the medium-range legend only if it reaches MR_RANGE.start, and the
  // legacy legend only if it starts before it (isMrInit has no upper bound).
  const showMrLegend = !hasWindow || windowEnd! >= MR_RANGE.start;
  const showLegacyLegend = !hasWindow || hazard !== 'flood' || windowStart! < MR_RANGE.start;

  // EM-DAT frequency legend, read straight off the scale the cells use.
  const emdatLegend = useMemo(() => {
    const scale = getColorScale(hazard);
    const dom = scale.domain();
    const rng = scale.range();
    return rng.map((color, i) => {
      if (i === 0) return { label: 'None', color };
      const lo = dom[i - 1];
      if (i === rng.length - 1) return { label: `≥${lo}`, color };
      const hi = dom[i] - 1;
      return { label: lo === hi ? `${lo}` : `${lo}–${hi}`, color };
    });
  }, [hazard]);

  const stageNames = STAGE_NAMES[stage] ?? STAGE_NAMES['risk-knowledge'];
  const modeLabel = mode === 'daily' ? 'Daily' : 'Monthly';
  const hazardLabel = hazard === 'drought' ? 'Drought' : 'Flood';
  const range = hasWindow
    ? `${formatShort(windowStart!)} – ${formatShort(windowEnd!)}`
    : startYear === endYear ? `${startYear}` : `${startYear}–${endYear}`;
  const title = `${modeLabel} ${hazard} ${stageNames.subject} · ${range}${focusCountry ? ` · ${focusCountry} only` : ''}`;
  const showNavigator = !hasWindow && years.length > 1;
  const gridLabel = `${modeLabel} ${hazard} calendar heatmap, ${range}. `
    + 'Arrow keys move between cells, Page Up and Page Down change year, Enter shows that date on the map. '
    + 'Anywhere on the page, hold D and press the arrow keys to change the selected date.';

  return (
    <div className={`card calendar-card cal-card${hasWindow ? ' scn-cal--window' : ''}`} ref={containerRef}>
      <div className='card__header ds-card__header cal-header'>
        <div className='cal-header__text'>
          <p className='ds-eyebrow'>{hazardLabel} · {stageNames.eyebrow}</p>
          <h3 className='ds-card__title'>{title}</h3>
        </div>
        {(loading || countryLoading) && (
          <span className='ds-badge ds-badge--info cal-loading' role='status'>
            <span className='ds-spinner cal-loading__spinner' aria-hidden='true' />
            Loading
          </span>
        )}
      </div>

      {showNavigator && (
        <div className='cal-nav' role='group' aria-label='Move the calendar cursor by year'>
          <button type='button' className='ds-btn ds-btn--secondary ds-btn--sm ds-btn--icon cal-nav__step'
            aria-label='Previous year' disabled={(cursorYear ?? endYear) <= startYear}
            onClick={() => goYear((cursorYear ?? endYear) - 1)}>‹</button>
          <label className='cal-nav__label'>
            <span className='ds-visually-hidden'>Jump to year</span>
            <select className='cal-nav__select' value={cursorYear ?? ''}
              onChange={(e) => goYear(parseInt(e.target.value, 10))}>
              {cursorYear == null && <option value=''>Year</option>}
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
          <button type='button' className='ds-btn ds-btn--secondary ds-btn--sm ds-btn--icon cal-nav__step'
            aria-label='Next year' disabled={(cursorYear ?? startYear) >= endYear}
            onClick={() => goYear((cursorYear ?? startYear) + 1)}>›</button>
          <button type='button' className='ds-btn ds-btn--ghost ds-btn--sm' onClick={goLatest}>Latest</button>
          <span className='cal-nav__hint' aria-hidden='true'>
            <kbd>D</kbd> + <kbd>←</kbd><kbd>→</kbd> change {mode === 'daily' ? 'day' : 'month'}
            {' · '}<kbd>↑</kbd><kbd>↓</kbd> {mode === 'daily' ? 'week' : 'year'}
          </span>
        </div>
      )}

      <div className='calendar-container'>
        <svg ref={labelSvgRef} className='calendar-labels' aria-hidden='true' />
        <div ref={scrollRef} className='calendar-scroll' onScroll={onCalScroll}
          onWheel={markUserScroll} onPointerDown={markUserScroll} onTouchStart={markUserScroll}>
          <div
            ref={gridRef}
            className='cal-grid'
            tabIndex={0}
            role='application'
            aria-roledescription='calendar heatmap'
            aria-label={gridLabel}
            onPointerMove={onPointerMove}
            onPointerLeave={onPointerLeave}
            onPointerDown={onPointerDown}
            onFocus={onGridFocus}
            onBlur={onGridBlur}
            onKeyDown={onGridKeyDown}
          >
            <svg ref={svgRef} aria-hidden='true' />
          </div>
        </div>
      </div>
      <div ref={tipRef} className='cal-tip' hidden aria-hidden='true' />
      <div ref={liveRef} className='ds-visually-hidden' aria-live='polite' />

      {(isRM || isRK) && (
        // One legend per network, in separate labelled blocks. The colour
        // scales are unchanged; only the presentation is tidied. In scenario
        // mode a block is shown only if the event window touches that network.
        <div className='calendar-legend cal-legends'>
          {isRK && (
            <div className='ds-legend cal-legend'>
              <p className='ds-legend__title'>Regions affected that month (EM-DAT)</p>
              <p className='cal-legend__note'>
                The number in a cell counts regions, not disasters: one disaster can cover many regions.
              </p>
              <div className='ds-legend__items'>
                {emdatLegend.map((b) => (
                  <span key={b.label} className='ds-legend__item'>
                    <span className='ds-swatch' style={{ background: b.color }} />
                    {b.label}
                  </span>
                ))}
              </div>
            </div>
          )}

          {isRM && showLegacyLegend && (
            <div className='ds-legend cal-legend'>
              <p className='ds-legend__title'>
                {hazard === 'flood'
                  ? 'Daily flood model (plain cells): share of regions at Actionable Risk'
                  : 'Share of regions at Actionable Risk'}
              </p>
              <div className='ds-legend__items'>
                {ACTIONABLE_PCT_LEGEND.map((b) => (
                  <span key={b.label} className='ds-legend__item'>
                    <span className='ds-swatch' style={{ background: b.color }} />
                    {b.label}
                  </span>
                ))}
                <span className='ds-legend__item cal-legend__nodata'>
                  <span className='ds-swatch' style={{ background: '#e8e8e8' }} />
                  No model output
                </span>
              </div>
            </div>
          )}

          {/* The two halves no longer share a scale, because they no longer
              make the same kind of statement. Spelling that out is cheaper
              than a reader assuming one ramp means one thing. */}
          {isRM && hazard === 'flood' && showMrLegend && (
            <div className='ds-legend cal-legend'>
              <p className='ds-legend__title'>
                <span className='cal-legend__outline' aria-hidden='true' />
                Medium-range model (outlined cells): highest chance of High or Extreme flooding,
                P(High∪Extreme)
              </p>
              <div className='ds-legend__items'>
                {P_SEVERE_LEGEND.map((b) => (
                  <span key={b.label} className='ds-legend__item'>
                    <span className='ds-swatch' style={{ background: b.color }} />
                    {b.label}
                  </span>
                ))}
              </div>
            </div>
          )}

          {isRM && hazard === 'flood' && showMrLegend && (
            <details className='cal-about'>
              <summary>About this calendar</summary>
              <p className='ds-note'>
                Outlined cells ({MR_RANGE.start} to {MR_RANGE.end}) are the
                medium-range network: the fill is the largest{' '}
                <strong>P(High∪Extreme)</strong> among 55 basins — a belief, on a
                sequential ramp. <strong>CRMA sets no threshold</strong>; compare
                it to a tolerance of your own. The posterior is coarse, so two
                thirds of those cells share one step — that is the posterior, not
                the rendering. Plain cells are the legacy daily BN, whose ladder
                is a cost–loss decision and keeps its traffic light.
              </p>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
