'use client';

import React, { type ReactNode } from 'react';

// ── Severity colors ──
export type SeverityLevel = 'extreme' | 'severe' | 'high' | 'moderate';

const SEVERITY_COLORS: Record<SeverityLevel, { bg: string; text: string; border: string }> = {
  extreme: { bg: '#dc262620', text: '#f87171', border: '#dc262660' },
  severe: { bg: '#ea580c20', text: '#fb923c', border: '#ea580c60' },
  high: { bg: '#d9770620', text: '#fbbf24', border: '#d9770660' },
  moderate: { bg: '#ca8a0420', text: '#facc15', border: '#ca8a0460' },
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
  const s = SEVERITY_COLORS[severity];
  return (
    <div style={{ marginBottom: '0.75rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
        <span
          style={{
            fontSize: '0.7rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            padding: '0.15rem 0.5rem',
            borderRadius: '0.25rem',
            background: s.bg,
            color: s.text,
            border: `1px solid ${s.border}`,
          }}
        >
          {severity}
        </span>
        <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>{code}</span>
        {emdat && <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>EM-DAT: {emdat}</span>}
      </div>
      <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0.25rem 0' }}>{country}</h2>
      {period && <p style={{ fontSize: '0.75rem', color: '#9ca3af', margin: 0 }}>{period}</p>}
    </div>
  );
}

// ── ImpactStats ──
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
    affected && { label: 'Affected', value: affected, color: '#22d3ee' },
    deaths && { label: 'Deaths', value: deaths, color: '#f87171' },
    displaced && { label: 'Displaced', value: displaced, color: '#fbbf24' },
  ].filter(Boolean) as { label: string; value: string; color: string }[];

  if (items.length === 0) return null;

  return (
    <div style={{ display: 'flex', gap: '1.5rem', margin: '0.75rem 0' }}>
      {items.map((item) => (
        <div key={item.label} style={{ textAlign: 'center' }}>
          <p style={{ fontSize: '1.25rem', fontWeight: 700, color: item.color, margin: 0 }}>
            {item.value}
          </p>
          <p
            style={{
              fontSize: '0.65rem',
              color: '#9ca3af',
              textTransform: 'uppercase',
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
      <span style={{ fontSize: '0.625rem', color: '#9ca3af', textTransform: 'uppercase' }}>
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

// ── BNDag ──────────────────────────────────────────────────────────────────
// SVG Bayesian Network DAG for flood IBF.
// Renders the 5-parent → risk_level → CRMA structure from a JSON string prop.
// Usage in MDX:
//   <BNDag dataJson='{"boundary":"Nairobi","date":"2026-03-04","ant":{...},...}' />

interface _BNNode { state: string; probs: number[]; raw: string }
interface _BNDagData {
  boundary: string; date: string;
  ant: _BNNode; exc: _BNNode; spa: _BNNode; trn: _BNNode; tail: _BNNode;
  risk: { probs: number[]; state: string };
  crma: { state: string; p_he: number };
}

const _PARENT_CFG = [
  { key: 'ant',  short: 'ANT',  title: 'Antecedent',  abbr: ['Dry','Nrm','Wet','VWt','Sat'] as string[] },
  { key: 'exc',  short: 'EXC',  title: 'Exceedance',  abbr: ['VLo','Lo','Med','Hi','VHi'] as string[] },
  { key: 'spa',  short: 'SPA',  title: 'Spatial',     abbr: ['Loc','Mod','Wide'] as string[] },
  { key: 'trn',  short: 'TRN',  title: 'Trend',       abbr: ['Dec','Stb','Inc'] as string[] },
  { key: 'tail', short: 'TAIL', title: 'Tail Risk',   abbr: ['Nil','Low','Mod','Hi'] as string[] },
];

const _RISK_ABBR  = ['Min','Low','Mod','High','Ext'];
const _RISK_CLR   = ['#9ca3af','#60a5fa','#34d399','#f59e0b','#ef4444'];
const _CRMA_CLR: Record<string, string> = {
  Monitor: '#22c55e', Evaluate: '#eab308', Assess: '#f97316', Actionable_Risk: '#dc2626',
};

export function BNDag({ dataJson }: { dataJson: string }) {
  let d: _BNDagData;
  try { d = JSON.parse(dataJson) as _BNDagData; }
  catch {
    return (
      <p style={{ color: '#ef4444', fontSize: '0.8rem', fontFamily: 'monospace' }}>
        BNDag: invalid JSON
      </p>
    );
  }

  // ── Layout constants ────────────────────────────────────────────────────
  const W = 900, H = 476;
  const NW = 148, NH = 108;           // parent node box size
  const NX = [20, 198, 376, 554, 732]; // parent node x-starts (5 × 148 + 6 × 20 = 900)
  const NY = 10;
  const RW = 230, RH = 130;           // risk node
  const RX = (W - RW) / 2;            // = 335
  const RY = 192;
  const CW = 196, CH = 58;            // crma badge
  const CX = (W - CW) / 2;            // = 352
  const CY = 390;

  // ── Helpers ──────────────────────────────────────────────────────────────

  // Mini probability bar chart inside a parent node box.
  const probBars = (
    probs: number[], abbr: string[],
    nx: number, ny: number, nw: number,
  ) => {
    const n = probs.length;
    const margin = 6;
    const avail = nw - 2 * margin;
    const gap = 3;
    const bw = Math.floor((avail - (n - 1) * gap) / n);
    const maxH = 38;
    const maxP = Math.max(...probs, 0.001);
    return (
      <g>
        {probs.map((p, i) => {
          const bx = nx + margin + i * (bw + gap);
          const bh = Math.max(2, Math.round((p / maxP) * maxH));
          const isMax = p === Math.max(...probs);
          return (
            <g key={i}>
              <rect x={bx} y={ny + maxH - bh} width={bw} height={bh}
                fill={isMax ? '#2563eb' : '#1e3a5f'} rx={1} />
              <text x={bx + bw / 2} y={ny + maxH + 10} textAnchor="middle"
                fontSize="6.5" fill={isMax ? '#93c5fd' : '#475569'}>
                {abbr[i]}
              </text>
            </g>
          );
        })}
      </g>
    );
  };

  const crmaColor = _CRMA_CLR[d.crma.state] ?? '#6b7280';
  const riskMaxIdx = d.risk.probs.indexOf(Math.max(...d.risk.probs));

  // Risk bar layout
  const rbw = 32, rbgap = 7;
  const rbarsW = 5 * rbw + 4 * rbgap;
  const rbx0 = RX + (RW - rbarsW) / 2;
  const rbMaxH = 58;
  const rbTopY = RY + 55;

  return (
    <div style={{
      background: '#060d1a',
      borderRadius: '10px',
      padding: '6px 6px 2px',
      margin: '1.25rem 0',
      overflow: 'hidden',
      border: '1px solid #0f172a',
    }}>
      {/* Header row */}
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        padding: '2px 10px 5px',
        fontSize: '11px',
      }}>
        <span style={{ color: '#94a3b8', fontWeight: 700, letterSpacing: '0.05em' }}>
          BN DAG — {d.boundary}
        </span>
        <span style={{ color: '#334155' }}>{d.date}</span>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`}
           style={{ width: '100%', height: 'auto', display: 'block' }}
           xmlns="http://www.w3.org/2000/svg">

        {/* ── Edges ── */}
        <g fill="none" stroke="#1e3a5f" strokeWidth="1.5" strokeDasharray="5 3">
          {NX.map((nx, i) => (
            <line key={i}
              x1={nx + NW / 2} y1={NY + NH}
              x2={RX + RW / 2} y2={RY} />
          ))}
          <line x1={RX + RW / 2} y1={RY + RH}
                x2={CX + CW / 2} y2={CY} />
        </g>

        {/* ── Parent nodes ── */}
        {_PARENT_CFG.map((cfg, i) => {
          const nd = (d as Record<string, _BNNode>)[cfg.key];
          const nx = NX[i];
          return (
            <g key={cfg.key}>
              <rect x={nx} y={NY} width={NW} height={NH}
                fill="#0c1728" stroke="#1e3a5f" strokeWidth="1.5" rx="5" />
              {/* Short label top-left + raw value top-right */}
              <text x={nx + 7} y={NY + 12} fontSize="8" fontWeight="700"
                fill="#334155">{cfg.short}</text>
              <text x={nx + NW - 6} y={NY + 12} fontSize="7.5"
                textAnchor="end" fill="#1e3a5f">{nd.raw}</text>
              {/* Full title centered */}
              <text x={nx + NW / 2} y={NY + 23} textAnchor="middle"
                fontSize="8.5" fill="#475569">{cfg.title}</text>
              {/* Active state pill */}
              <rect x={nx + 7} y={NY + 27} width={NW - 14} height={17}
                fill="#0f1f38" rx="3" />
              <text x={nx + NW / 2} y={NY + 39} textAnchor="middle"
                fontSize="9.5" fontWeight="700" fill="#e2e8f0">
                {nd.state.replace(/_/g, ' ')}
              </text>
              {/* Probability bars */}
              {probBars(nd.probs, cfg.abbr, nx, NY + 52, NW)}
            </g>
          );
        })}

        {/* ── Risk node ── */}
        <rect x={RX} y={RY} width={RW} height={RH}
          fill="#080f1e" stroke="#1e3a8a" strokeWidth="2" rx="7" />
        <text x={RX + RW / 2} y={RY + 14} textAnchor="middle"
          fontSize="9" fontWeight="700" fill="#334155"
          style={{ letterSpacing: '0.07em' }}>RISK LEVEL</text>
        {/* State pill */}
        <rect x={RX + RW / 2 - 62} y={RY + 18} width={124} height={20}
          fill="#0c1728" rx="4" />
        <text x={RX + RW / 2} y={RY + 32} textAnchor="middle"
          fontSize="12" fontWeight="700" fill={_RISK_CLR[riskMaxIdx]}>
          {d.risk.state}
        </text>
        {/* Risk probability bars */}
        {d.risk.probs.map((p, i) => {
          const bh = Math.max(2, Math.round(p * rbMaxH));
          return (
            <g key={i}>
              <rect x={rbx0 + i * (rbw + rbgap)} y={rbTopY + rbMaxH - bh}
                width={rbw} height={bh} fill={_RISK_CLR[i]} rx="2"
                opacity={i === riskMaxIdx ? 1 : 0.45} />
              <text x={rbx0 + i * (rbw + rbgap) + rbw / 2}
                y={rbTopY + rbMaxH + 10} textAnchor="middle"
                fontSize="8" fill={_RISK_CLR[i]}>{_RISK_ABBR[i]}</text>
              <text x={rbx0 + i * (rbw + rbgap) + rbw / 2}
                y={rbTopY + rbMaxH + 21} textAnchor="middle"
                fontSize="7.5" fill="#334155">
                {(p * 100).toFixed(0)}%
              </text>
            </g>
          );
        })}

        {/* ── CRMA badge ── */}
        <rect x={CX} y={CY} width={CW} height={CH}
          fill={crmaColor + '1a'} stroke={crmaColor} strokeWidth="2" rx="8" />
        <text x={CX + CW / 2} y={CY + 20} textAnchor="middle"
          fontSize="12.5" fontWeight="700" fill={crmaColor}>
          {d.crma.state.replace(/_/g, ' ')}
        </text>
        <text x={CX + CW / 2} y={CY + 36} textAnchor="middle"
          fontSize="9" fill="#64748b">
          {'P(High∪Extreme) = '}{(d.crma.p_he * 100).toFixed(1)}%
        </text>
        <text x={CX + CW / 2} y={CY + 50} textAnchor="middle"
          fontSize="8" fill="#1e3a5f">CRMA OUTPUT (γ = 0.20)</text>

        {/* Footer */}
        <text x={W / 2} y={H - 4} textAnchor="middle"
          fontSize="8" fill="#0f172a">
          Flood BN — 5 evidence parents → risk_level → CRMA
        </text>
      </svg>
    </div>
  );
}
