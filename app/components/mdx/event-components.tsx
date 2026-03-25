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
