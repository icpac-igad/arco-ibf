'use client';

import React, { type ReactNode } from 'react';

// ── Severity badges ──
export type SeverityLevel = 'extreme' | 'severe' | 'high' | 'moderate' | 'unknown';

// Design-system badge per severity (AA text on a light card). The old palette
// was built for a dark background and fell to ~1.5:1 on white. `unknown` is
// the neutral badge for IBF stub events where no EM-DAT impact data exists
// and severity cannot be assigned. Without an entry, lookup returned undefined
// for any non-canonical value and CountryHeader crashed at render time with
// "Cannot read properties of undefined" — see the 3 IBF stubs
// (2019-IBF03-ERI flood, 2021-IBF01-BDI / 2021-IBF03-ERI drought).
const SEVERITY_BADGE: Record<SeverityLevel, string> = {
  extreme: 'ds-badge ds-badge--danger',
  severe: 'ds-badge ds-badge--danger',
  high: 'ds-badge ds-badge--warning',
  moderate: 'ds-badge ds-badge--warning',
  unknown: 'ds-badge',
};

// ── CountryHeader ──
export function CountryHeader({
  country,
  code,
  emdat,
  severity = 'high',
  period,
}: {
  country: string;
  code: string;
  emdat?: string;
  severity?: SeverityLevel;
  period?: string;
}) {
  // Belt-and-suspenders: fall back to the moderate badge if a curated
  // MDX passes a severity not in the SEVERITY_BADGE dict — never crash.
  const badge = SEVERITY_BADGE[severity] ?? SEVERITY_BADGE.moderate;

  // The enclosing card often already names the country in its title
  // ("Flood: United Republic of Tanzania"); repeating it as a heading right
  // under the title reads as a duplicate. Hide the name when the card title
  // already contains it — otherwise (e.g. "East Africa" under a monitoring
  // title) keep it.
  const ref = React.useRef<HTMLDivElement>(null);
  const [inTitle, setInTitle] = React.useState(false);
  React.useEffect(() => {
    const t = ref.current?.closest('.ds-card, .card')
      ?.querySelector('.ds-card__title, .card__header h3')?.textContent ?? '';
    setInTitle(!!country && t.toLowerCase().includes(country.toLowerCase()));
  }, [country]);

  return (
    <div ref={ref} className='mdx-country' style={{ marginBottom: 'var(--ds-3, 12px)' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem' }}>
        <span className={badge} style={{ textTransform: 'uppercase' }}>{severity}</span>
        <span style={{ fontSize: 'var(--ds-fs-xs, 0.75rem)', color: 'var(--ds-text-3, #5d727a)' }}>{code}</span>
        {emdat && (
          <span style={{ fontSize: 'var(--ds-fs-xs, 0.75rem)', color: 'var(--ds-text-3, #5d727a)' }}>
            EM-DAT: {emdat}
          </span>
        )}
        {period && (
          <span style={{ fontSize: 'var(--ds-fs-xs, 0.75rem)', color: 'var(--ds-text-3, #5d727a)' }}>
            {period}
          </span>
        )}
      </div>
      {!inTitle && (
        <p style={{
          fontSize: 'var(--ds-fs-lg, 1.125rem)', fontWeight: 700, margin: '0.5rem 0 0',
          color: 'var(--ds-text, #10242c)', lineHeight: 1.25,
        }}>
          {country}
        </p>
      )}
    </div>
  );
}

// ── ImpactStats ──
// Design-system semantic colours (≥ 4.5:1 on white) instead of the dark-theme
// cyan / pink / amber, which were ~1.5–2:1 on the light card.
export function ImpactStats({
  affected,
  deaths,
  displaced,
}: {
  affected?: string;
  deaths?: string;
  displaced?: string;
}) {
  const items = [
    affected && { label: 'Affected', value: affected, color: 'var(--ds-accent-strong, #127f96)' },
    deaths && { label: 'Deaths', value: deaths, color: 'var(--ds-danger, #b42318)' },
    displaced && { label: 'Displaced', value: displaced, color: 'var(--ds-warning, #b45309)' },
  ].filter(Boolean) as { label: string; value: string; color: string }[];

  if (items.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem 1.5rem', margin: '0.75rem 0' }}>
      {items.map((item) => (
        <div key={item.label} style={{ textAlign: 'center' }}>
          <p style={{ fontSize: '1.25rem', fontWeight: 700, color: item.color, margin: 0 }}>
            {item.value}
          </p>
          <p
            style={{
              fontSize: 'var(--ds-fs-xs, 0.75rem)',
              color: 'var(--ds-text-3, #5d727a)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              margin: 0,
            }}
          >
            {item.label}
          </p>
        </div>
      ))}
    </div>
  );
}

// ── Hero ──
export function Hero({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        background: '#0f172a',
        padding: '1.25rem 1.5rem',
        borderRadius: '0.75rem',
        marginBottom: '1rem',
        color: 'white',
      }}
    >
      {children}
    </div>
  );
}

// ── StatGrid + Stat ──
export function StatGrid({ children }: { children: ReactNode }) {
  return <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>{children}</div>;
}

export function Stat({
  value,
  label,
  color = 'white',
}: {
  value: string;
  label: string;
  icon?: string;
  color?: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.375rem',
        background: 'rgba(255,255,255,0.1)',
        padding: '0.375rem 0.625rem',
        borderRadius: '0.25rem',
      }}
    >
      <span style={{ fontSize: '0.875rem', fontWeight: 700, color }}>{value}</span>
      <span style={{ fontSize: '0.75rem', color: '#cbd5e1', textTransform: 'uppercase' }}>
        {label}
      </span>
    </div>
  );
}

// ── Block + Prose ──
export function Block({ children }: { children: ReactNode }) {
  return <div style={{ maxWidth: '56rem', margin: '0 auto', padding: '1rem 0' }}>{children}</div>;
}

export function Prose({ children }: { children: ReactNode }) {
  return <div className='markdown-body'>{children}</div>;
}

// ── BNDag / BNDagDrought ───────────────────────────────────────────────────
// SVG Bayesian Network DAGs for the legacy daily flood BN and the monthly
// drought BN. Both have the same shape — N evidence parents → risk_level →
// CRMA state — so one renderer draws both from a parent config; only the
// parent count, abbreviations and footer label differ.
//
// Drawn in the same visual language as <CrmaMrDag> (white nodes, rx 6, slate
// stroke, 13px uppercase titles, 11px minimum text, column headings read
// left → right) so the three networks read as one family. The SVG is held at
// 1 unit ≥ 1 px inline (the caller's container scrolls sideways on a narrow
// card) and scales to its container only when `fit` is set (the zoomable
// modal).
//
// Usage in MDX:
//   <BNDag dataJson='{"boundary":"Nairobi","date":"2026-03-04","ant":{...},...}' />
//   <BNDagDrought dataJson='{"boundary":"Isiolo","init":"2025-12","cur":{...},...}' />

export interface LegacyBnNode { state: string; probs: number[]; raw: string }
export interface LegacyBnRisk { probs: number[]; state: string }
export interface LegacyBnCrma { state: string; p_he: number }

export interface BNDagData {
  boundary: string; date: string;
  ant: LegacyBnNode; exc: LegacyBnNode; spa: LegacyBnNode; trn: LegacyBnNode; tail: LegacyBnNode;
  risk: LegacyBnRisk;
  crma: LegacyBnCrma;
}

export interface BNDagDroughtData {
  boundary: string;
  init: string;
  cur: LegacyBnNode;
  def: LegacyBnNode;
  spa: LegacyBnNode;
  trn: LegacyBnNode;
  risk: LegacyBnRisk;
  crma: LegacyBnCrma;
}

export interface LegacyBnParentCfg { key: string; short: string; title: string; abbr: string[] }

export const BN_FLOOD_PARENTS: LegacyBnParentCfg[] = [
  { key: 'ant',  short: 'ANT',  title: 'Antecedent',  abbr: ['Dry','Nrm','Wet','VWt','Sat'] },
  { key: 'exc',  short: 'EXC',  title: 'Exceedance',  abbr: ['VLo','Lo','Med','Hi','VHi'] },
  { key: 'spa',  short: 'SPA',  title: 'Spatial',     abbr: ['Loc','Mod','Wide'] },
  { key: 'trn',  short: 'TRN',  title: 'Trend',       abbr: ['Dec','Stb','Inc'] },
  { key: 'tail', short: 'TAIL', title: 'Tail Risk',   abbr: ['Nil','Low','Mod','Hi'] },
];

export const BN_DROUGHT_PARENTS: LegacyBnParentCfg[] = [
  { key: 'cur', short: 'CUR', title: 'Current SPI-3',
    abbr: ['SevD', 'ModD', 'MldD', 'Nrm', 'Abv'] },
  { key: 'def', short: 'DEF', title: 'Forecast Deficit',
    abbr: ['VLo', 'Lo', 'Med', 'Hi', 'VHi'] },
  { key: 'spa', short: 'SPA', title: 'Spatial',
    abbr: ['Loc', 'Mod', 'Wide'] },
  { key: 'trn', short: 'TRN', title: 'Trend',
    abbr: ['Det', 'Stb', 'Imp'] },
];

export const BN_RISK_ABBR = ['Min','Low','Mod','High','Ext'];
export const BN_RISK_BANDS = ['Minimal','Low','Moderate','High','Extreme'];
/** Risk-level bar colours (data — unchanged). Used on bars and swatches only;
 *  text is drawn in ink, because these light hues fail contrast as text on white. */
export const BN_RISK_CLR = ['#9ca3af','#60a5fa','#34d399','#f59e0b','#ef4444'];

/** CRMA traffic light, in ladder order. Same values as app/lib/colors CRMA_TRAFFIC
 *  (the map's choropleth), so the panel and the map read the same. */
export const BN_CRMA_LADDER = ['Monitor', 'Evaluate', 'Assess', 'Actionable_Risk'] as const;
const _CRMA_CLR: Record<string, string> = {
  Monitor: '#22c55e', Evaluate: '#eab308', Assess: '#f97316', Actionable_Risk: '#dc2626',
};

/** Traffic-light colour for a CRMA state name (grey when unknown). */
export function bnCrmaColour(state: string | null | undefined): string {
  return (state && _CRMA_CLR[state]) || '#6b7280';
}

/** Text colour for a label sitting on `hex`: whichever of white / ink has the
 *  higher WCAG contrast. White on the green and orange lights fails AA, so
 *  those take dark ink; red keeps white. The fill itself never changes. */
export function inkOn(hex: string): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return '#111827';
  const lin = (h: string) => {
    const c = parseInt(h, 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const L = 0.2126 * lin(m[1]) + 0.7152 * lin(m[2]) + 0.0722 * lin(m[3]);
  const Link = 0.0109; // #111827
  const cWhite = 1.05 / (L + 0.05);
  const cInk = (L + 0.05) / (Link + 0.05);
  return cWhite >= cInk ? '#ffffff' : '#111827';
}

const _fmtState = (s: string | null | undefined) => String(s ?? '—').replace(/_/g, ' ');

/** Key for the legacy daily-flood and monthly-drought networks: what the bar and
 *  box colours mean. Drawn under the graph, or in the full-screen dialog's guide. */
export function LegacyBnLegend() {
  return (
    <ul className='ev-legend' aria-label='How to read the network'>
      <li>
        <svg width='36' height='14' aria-hidden='true'>
          <rect x='2' y='4' width='9' height='8' fill='#cbd5e1' />
          <rect x='13' y='1' width='9' height='11' fill='#2563eb' />
          <rect x='24' y='6' width='9' height='6' fill='#cbd5e1' />
        </svg>
        solid blue bar: the input&rsquo;s most likely state
      </li>
      <li>
        <span className='ev-legend__swatches' aria-hidden='true'>
          {BN_RISK_CLR.map((c) => <span key={c} className='ds-swatch' style={{ background: c }} />)}
        </span>
        risk level, Minimal → Extreme (brightest bar = most likely)
      </li>
      <li>
        <span className='ev-legend__swatches' aria-hidden='true'>
          {BN_CRMA_LADDER.map((s) => (
            <span key={s} className='ds-swatch' style={{ background: _CRMA_CLR[s] }} />
          ))}
        </span>
        decision: Monitor → Evaluate → Assess → Actionable Risk
      </li>
    </ul>
  );
}

function LegacyBnSvg({
  parents, data, headerLeft, headerRight, footer, ariaLabel, fit, showHeader, showLegend = true,
}: {
  parents: LegacyBnParentCfg[];
  data: Record<string, unknown> & { risk: LegacyBnRisk; crma: LegacyBnCrma };
  headerLeft: string;
  headerRight: string;
  footer: string;
  ariaLabel: string;
  fit: boolean;
  showHeader: boolean;
  /** Off in the dialog, whose guide shows the same key outside the zoomed graph. */
  showLegend?: boolean;
}) {
  // ── Layout (same node metrics as CrmaMrDag) ─────────────────────────────
  const PADX = 16, PADY = 40, NW = 190, GAPX = 48, GAPY = 12;
  const NH = 104;               // evidence node
  const RH = 160;               // risk node
  const DH = 142;               // decision node
  const n = parents.length;
  const colH = n * NH + (n - 1) * GAPY;
  const innerH = Math.max(colH, RH, DH);
  const W = PADX * 2 + 3 * NW + 2 * GAPX;
  const H = PADY + innerH + 16;
  const colX = [PADX, PADX + NW + GAPX, PADX + 2 * (NW + GAPX)];
  const evY0 = PADY + (innerH - colH) / 2;
  const RY = PADY + (innerH - RH) / 2;
  const DY = PADY + (innerH - DH) / 2;

  const risk = data.risk;
  const crma = data.crma;
  const riskProbs = (risk?.probs ?? []).map((p) => p ?? 0);
  const riskMaxIdx = riskProbs.indexOf(Math.max(...riskProbs));
  const crmaColor = bnCrmaColour(crma?.state);
  const crmaText = inkOn(crmaColor);

  const title = (x: number, y: number, t: string) => (
    <text x={x + NW / 2} y={y + 20} textAnchor='middle' fontSize='13' fontWeight='700'
      fill='#111827' letterSpacing='0.04em'>{t.toUpperCase()}</text>
  );
  const sub = (x: number, y: number, t: string) => (
    <text x={x + NW / 2} y={y + 37} textAnchor='middle' fontSize='11' fill='#4b5563'
      fontStyle='italic'>{t}</text>
  );
  const box = (x: number, y: number, h: number) => (
    <rect x={x} y={y} width={NW} height={h} rx={6} fill='#ffffff' stroke='#cbd5e1' strokeWidth={1} />
  );

  // Mini probability bars inside an evidence node. The most likely state is
  // the solid blue bar with a bold label; the rest are pale.
  const parentBars = (probs: number[], abbr: string[], x: number, y: number) => {
    const m = 10, gap = 4, maxH = 20;
    const k = probs.length;
    const bw = Math.floor((NW - 2 * m - (k - 1) * gap) / k);
    const maxP = Math.max(...probs, 0.001);
    return (
      <g>
        {probs.map((p, i) => {
          const bx = x + m + i * (bw + gap);
          const bh = Math.max(2, Math.round((p / maxP) * maxH));
          const isMax = p === maxP;
          return (
            <g key={i}>
              <rect x={bx} y={y + maxH - bh} width={bw} height={bh} rx={1}
                fill={isMax ? '#2563eb' : '#cbd5e1'} />
              <text x={bx + bw / 2} y={y + maxH + 13} textAnchor='middle' fontSize='11'
                fontWeight={isMax ? 700 : 400} fill={isMax ? '#111827' : '#4b5563'}>
                {abbr[i]}
              </text>
            </g>
          );
        })}
      </g>
    );
  };

  const edge = (x1: number, y1: number, x2: number, y2: number, key: string) => (
    <path key={key}
      d={`M ${x1} ${y1} C ${x1 + 24} ${y1}, ${x2 - 24} ${y2}, ${x2} ${y2}`}
      fill='none' stroke='#94a3b8' strokeWidth={1.5} opacity={0.9} />
  );

  // Risk bars: absolute height (p × maxH), most likely state at full opacity.
  const rm = 10, rgap = 4, rMaxH = 50;
  const rbw = Math.floor((NW - 2 * rm - 4 * rgap) / 5);
  const rTop = RY + 68;

  return (
    <div className='ev-dag ev-dag--legacy'>
      {showHeader && (
        <div className='ev-dag__head'>
          <span>{headerLeft}</span>
          <span>{headerRight}</span>
        </div>
      )}

      <div className='ev-dag__scroll'>
        <svg viewBox={`0 0 ${W} ${H}`}
          style={fit
            // Modal: fit the dialog's width AND the viewport's height, so the whole
            // network is visible at 100% and the zoom controls do the enlarging.
            ? { width: '100%', height: 'auto', maxHeight: 'calc(100vh - 220px)', minHeight: 320,
                display: 'block' }
            // Never below 1 unit = 1 px (text ≥ 11 px; the scroller takes over on a
            // narrow card), and grows up to 1.3× on a wide one.
            : { width: '100%', minWidth: W, maxWidth: Math.round(W * 1.3), height: 'auto',
                display: 'block', margin: '0 auto' }}
          xmlns='http://www.w3.org/2000/svg' role='img' aria-label={ariaLabel}>

          {/* Column headings */}
          {['Evidence', 'Risk', 'Decision'].map((l, i) => (
            <text key={l} x={colX[i] + NW / 2} y={22} textAnchor='middle' fontSize='11'
              fontWeight='700' fill='#374151' letterSpacing='0.12em'>{l.toUpperCase()}</text>
          ))}

          {/* Edges */}
          <g>
            {parents.map((_, i) =>
              edge(colX[0] + NW, evY0 + i * (NH + GAPY) + NH / 2, colX[1], RY + RH / 2, `e${i}`))}
            {edge(colX[1] + NW, RY + RH / 2, colX[2], DY + DH / 2, 'rd')}
          </g>

          {/* Evidence parents */}
          {parents.map((cfg, i) => {
            const nd = data[cfg.key] as LegacyBnNode | undefined;
            const x = colX[0], y = evY0 + i * (NH + GAPY);
            return (
              <g key={cfg.key}>
                {box(x, y, NH)}
                {title(x, y, cfg.title)}
                {sub(x, y, `${cfg.short} · ${nd?.raw ?? '—'}`)}
                <text x={x + NW / 2} y={y + 57} textAnchor='middle' fontSize='15' fontWeight='700'
                  fill='#111827'>{_fmtState(nd?.state)}</text>
                {nd?.probs && parentBars(nd.probs, cfg.abbr, x, y + 64)}
              </g>
            );
          })}

          {/* Risk level */}
          <g>
            {box(colX[1], RY, RH)}
            {title(colX[1], RY, 'Risk level')}
            {sub(colX[1], RY, 'risk_level · most likely state')}
            <text x={colX[1] + NW / 2} y={RY + 58} textAnchor='middle' fontSize='16'
              fontWeight='700' fill='#111827'>{risk?.state ?? '—'}</text>
            {riskProbs.map((p, i) => {
              const bx = colX[1] + rm + i * (rbw + rgap);
              const bh = Math.max(2, Math.round(p * rMaxH));
              const isMax = i === riskMaxIdx;
              return (
                <g key={i}>
                  <rect x={bx} y={rTop + rMaxH - bh} width={rbw} height={bh} rx={2}
                    fill={BN_RISK_CLR[i]} opacity={isMax ? 1 : 0.45} />
                  <text x={bx + rbw / 2} y={rTop + rMaxH + 14} textAnchor='middle'
                    fontSize='11' fontWeight={isMax ? 700 : 400}
                    fill={isMax ? '#111827' : '#4b5563'}>{BN_RISK_ABBR[i]}</text>
                  <text x={bx + rbw / 2} y={rTop + rMaxH + 28} textAnchor='middle'
                    fontSize='11' fill='#4b5563'>{(p * 100).toFixed(0)}%</text>
                </g>
              );
            })}
          </g>

          {/* CRMA decision — solid traffic-light fill (data colour) */}
          <g>
            {box(colX[2], DY, DH)}
            {title(colX[2], DY, 'CRMA decision')}
            {sub(colX[2], DY, 'CRMA OUTPUT (γ = 0.20)')}
            <rect x={colX[2] + 12} y={DY + 48} width={NW - 24} height={38} rx={6}
              fill={crmaColor} />
            <text x={colX[2] + NW / 2} y={DY + 72} textAnchor='middle' fontSize='16'
              fontWeight='700' fill={crmaText}>{_fmtState(crma?.state)}</text>
            <text x={colX[2] + NW / 2} y={DY + 106} textAnchor='middle' fontSize='12'
              fill='#374151'>P(High∪Extreme)</text>
            <text x={colX[2] + NW / 2} y={DY + 128} textAnchor='middle' fontSize='16'
              fontWeight='700' fill='#111827'>
              {typeof crma?.p_he === 'number' ? `${(crma.p_he * 100).toFixed(1)}%` : '—'}
            </text>
          </g>
        </svg>
      </div>

      {showLegend && <LegacyBnLegend />}

      <details className='ev-technical'>
        <summary>Technical notes</summary>
        <div>
          <p>{footer}</p>
          <p>
            {headerLeft} · {headerRight}. Each evidence box shows the input&rsquo;s raw reading
            (top line, e.g. {parents.map((p) => p.short).join(', ')}) and its probability over
            states; the decision box is the CRMA OUTPUT (γ = 0.20) with
            P(High∪Extreme) = {typeof crma?.p_he === 'number' ? (crma.p_he * 100).toFixed(1) : '—'}%.
          </p>
          <p>
            State abbreviations:{' '}
            {parents.map((p, i) => (
              <React.Fragment key={p.key}>
                {i > 0 && '; '}
                <strong>{p.short}</strong> {p.abbr.join(' / ')}
              </React.Fragment>
            ))}
            ; <strong>RISK</strong> {BN_RISK_ABBR.join(' / ')}.
          </p>
        </div>
      </details>
    </div>
  );
}

export function BNDag({
  dataJson, fit = false, showHeader = true, showLegend = true,
}: { dataJson: string; fit?: boolean; showHeader?: boolean; showLegend?: boolean }) {
  let d: BNDagData;
  try { d = JSON.parse(dataJson) as BNDagData; }
  catch {
    return (
      <p style={{ color: '#b42318', fontSize: '0.8rem', fontFamily: 'monospace' }}>
        BNDag: invalid JSON
      </p>
    );
  }
  return (
    <LegacyBnSvg
      parents={BN_FLOOD_PARENTS}
      data={d as unknown as Record<string, unknown> & BNDagData}
      headerLeft={`BN DAG — ${d.boundary}`}
      headerRight={d.date}
      footer='Flood BN — 5 evidence parents → risk_level → CRMA'
      ariaLabel={`Flood Bayesian network for ${d.boundary}, ${d.date}`}
      fit={fit}
      showHeader={showHeader}
      showLegend={showLegend}
    />
  );
}

export function BNDagDrought({
  dataJson, fit = false, showHeader = true, showLegend = true,
}: { dataJson: string; fit?: boolean; showHeader?: boolean; showLegend?: boolean }) {
  let d: BNDagDroughtData;
  try { d = JSON.parse(dataJson) as BNDagDroughtData; }
  catch {
    return (
      <p style={{ color: '#b42318', fontSize: '0.8rem', fontFamily: 'monospace' }}>
        BNDagDrought: invalid JSON
      </p>
    );
  }
  return (
    <LegacyBnSvg
      parents={BN_DROUGHT_PARENTS}
      data={d as unknown as Record<string, unknown> & BNDagDroughtData}
      headerLeft={`BN DAG (drought, post-CDI) — ${d.boundary}`}
      headerRight={d.init}
      footer='Drought BN — 4 evidence parents (post-CDI) → risk_level → CRMA'
      ariaLabel={`Drought Bayesian network (post-CDI) for ${d.boundary}, ${d.init}`}
      fit={fit}
      showHeader={showHeader}
      showLegend={showLegend}
    />
  );
}
