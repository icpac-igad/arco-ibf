/**
 * CrmaMrDag — the medium-range CRMA network, drawn from the file's own schema.
 *
 * `<BNDag>` and `<BNDagDrought>` next door hardcode their topology: five
 * evidence nodes into one risk posterior into a CRMA state, seven in total.
 * That is right for the Julia daily networks and cannot show this one, which
 * is fifteen nodes — and four of them (exposure, susceptibility, confidence,
 * significance) have no counterpart there at all, while carrying three of the
 * four terms of the CRMA equation.
 *
 * So this component reads `schema.nodes` and `schema.edges` out of the payload
 * and lays out what the data declares. Adding a node upstream then shows up
 * here without a frontend release, which is the failure mode the hardcoded
 * panels are in now.
 *
 * Three things it is careful about, each from a finding that cost real effort
 * upstream (see cno-e4drr/devops/crma-api-cr/CRMA_MEDIUM_RANGE_DEPLOY.md §4):
 *
 *   - Evidence nodes are sized by their SHARE of the decibel total, not by
 *     band. The decibels add, so one node at share 0.93 moved the belief and
 *     four at "Normal" did not; colouring five boxes by band implies five
 *     contributors.
 *   - `crma_state` is shown beside `crma_state_baseline`, because exposure
 *     moves 16.0% of decisions by shifting the cost–loss threshold, and the
 *     state alone hides whether an escalation came from the forecast.
 *   - Confidence is coloured by RANK within the initialisation, never by an
 *     absolute 0–1 scale — its definition changed and levels dropped ~0.17.
 *
 * It renders one (basin, window). The window selector belongs to the caller:
 * a date carries five answers and the panel must not pick one silently.
 */
import React from 'react';
import type {
  CrmaMrBasinDag,
  CrmaMrEdgeSpec,
  CrmaMrNodeSpec,
  CrmaMrSchema,
} from 'app/types/crma-mr';

const _CRMA_CLR: Record<string, string> = {
  Monitor: '#22c55e', Evaluate: '#eab308', Assess: '#f97316', Actionable_Risk: '#dc2626',
};
const _RISK_ABBR = ['Min', 'Low', 'Mod', 'High', 'Ext'];
const _RISK_CLR = ['#9ca3af', '#60a5fa', '#34d399', '#f59e0b', '#ef4444'];
const _RAIN_ABBR = ['none', 'mod', 'heavy'];
const _ACT_ABBR = ['Mon', 'Alert', 'Prep', 'Act'];

/** The ordinal ladder, shared by exposure, susceptibility and significance. */
const _ORD_CLR: Record<string, string> = {
  limited: '#60a5fa', elevated: '#34d399', serious: '#f59e0b', critical: '#ef4444',
};

/** Evidence band → colour. Percentile ranks of these 55 basins, not absolutes. */
const _BAND_CLR = ['#334155', '#475569', '#64748b', '#38bdf8', '#2563eb'];

/**
 * Edge treatment by `kind`. The kinds carry meaning, not style:
 * `elicited` is dashed because that CPT is elicited and unscored, and
 * `threshold` is the one route by which exposure reaches a decision without
 * being multiplied into an impact number — it moves C/L, not the probability.
 */
const _EDGE: Record<string, { stroke: string; dash?: string; width: number }> = {
  noisy_or:    { stroke: '#2563eb', width: 1.5 },
  measurement: { stroke: '#7c3aed', width: 1.5, dash: '2 2' },
  elicited:    { stroke: '#1e3a5f', width: 1.5, dash: '5 3' },
  derived:     { stroke: '#334155', width: 1 },
  cost_loss:   { stroke: '#94a3b8', width: 1.8 },
  threshold:   { stroke: '#f97316', width: 1.5, dash: '4 3' },
  ordinal:     { stroke: '#334155', width: 1 },
};

/** Column order. Anything the schema declares outside this falls in at the end. */
const _LAYERS = [
  'evidence', 'measurement', 'observation', 'hazard',
  'context', 'risk', 'uncertainty', 'decision',
] as const;

const _num = (v: unknown, dp = 2): string =>
  typeof v === 'number' && Number.isFinite(v) ? v.toFixed(dp) : '—';

function _pick(
  key: string,
  basin: CrmaMrBasinDag,
  window: string,
  schema: CrmaMrSchema,
): Record<string, any> | null {
  const src = schema.static.includes(key)
    ? (basin.static as unknown as Record<string, any>)
    : (basin.windows?.[window] as unknown as Record<string, any>);
  return (src?.[key] as Record<string, any>) ?? null;
}

export function CrmaMrDag({
  schema, basin, window: win, basinId, init, season,
}: {
  schema: CrmaMrSchema;
  basin: CrmaMrBasinDag;
  window: string;
  basinId: string;
  init: string;
  season?: string;
}) {
  if (!schema?.nodes?.length || !basin) {
    return (
      <p style={{ color: '#ef4444', fontSize: '0.8rem', fontFamily: 'monospace' }}>
        CrmaMrDag: no schema or no basin data
      </p>
    );
  }

  // ── Layout ───────────────────────────────────────────────────────────────
  // Columns are the schema's layers; rows are the nodes within a layer. Both
  // are computed, not fixed, so a new node lands somewhere sane on its own.
  const byLayer = new Map<string, CrmaMrNodeSpec[]>();
  for (const n of schema.nodes) {
    if (!byLayer.has(n.layer)) byLayer.set(n.layer, []);
    byLayer.get(n.layer)!.push(n);
  }
  const layers: string[] = [
    ..._LAYERS.filter((l) => byLayer.has(l)),
    // Anything the schema declares outside the known layer order still gets a
    // column, rather than vanishing — the whole point of reading the schema.
    ...Array.from(byLayer.keys()).filter(
      (l) => !(_LAYERS as readonly string[]).includes(l),
    ),
  ];

  const NW = 150, NH = 96, GAPX = 22, GAPY = 14, PADX = 16, PADY = 34;
  const rows = Math.max(...layers.map((l) => byLayer.get(l)!.length));
  const W = PADX * 2 + layers.length * NW + (layers.length - 1) * GAPX;
  const H = PADY + rows * NH + (rows - 1) * GAPY + 40;

  const pos = new Map<string, { x: number; y: number }>();
  layers.forEach((layer, ci) => {
    const nodes = byLayer.get(layer)!;
    // Centre each column vertically, so a one-node column sits opposite the
    // middle of a five-node one instead of at the top.
    const colH = nodes.length * NH + (nodes.length - 1) * GAPY;
    const y0 = PADY + ((rows * NH + (rows - 1) * GAPY) - colH) / 2;
    nodes.forEach((n, ri) => {
      pos.set(n.key, { x: PADX + ci * (NW + GAPX), y: y0 + ri * (NH + GAPY) });
    });
  });

  const wnodes = basin.windows?.[win];
  const heavy = wnodes?.heavy_rain as any;
  const risk = wnodes?.risk as any;
  const crma = wnodes?.crma as any;
  const conf = wnodes?.confidence as any;
  const sig = wnodes?.significance as any;
  const cl = basin.static?.cost_loss;

  const crmaColor = _CRMA_CLR[crma?.state ?? ''] ?? '#6b7280';
  const riskProbs: number[] = (risk?.probs ?? []).map((p: number | null) => p ?? 0);
  const riskMaxIdx = riskProbs.length
    ? riskProbs.indexOf(Math.max(...riskProbs)) : 0;

  // ── Per-node body renderers ──────────────────────────────────────────────
  const bars = (
    probs: number[], abbr: string[], clr: string[] | string,
    x: number, y: number, w: number, maxH = 30,
  ) => {
    const n = probs.length;
    if (!n) return null;
    const m = 8, gap = 3;
    const bw = Math.floor((w - 2 * m - (n - 1) * gap) / n);
    const maxP = Math.max(...probs, 0.001);
    return (
      <g>
        {probs.map((p, i) => {
          const bx = x + m + i * (bw + gap);
          const bh = Math.max(2, Math.round((p / maxP) * maxH));
          const fill = Array.isArray(clr) ? clr[i] ?? '#2563eb' : clr;
          return (
            <g key={i}>
              <rect x={bx} y={y + maxH - bh} width={bw} height={bh} fill={fill} rx={1} />
              <text x={bx + bw / 2} y={y + maxH + 9} textAnchor='middle'
                fontSize='6.5' fill='#64748b'>{abbr[i]}</text>
            </g>
          );
        })}
      </g>
    );
  };

  const nodeBody = (spec: CrmaMrNodeSpec, x: number, y: number) => {
    const d = _pick(spec.key, basin, win, schema);
    const cx = x + NW / 2;
    const ty = y + 40;

    // Evidence: a share bar, because the decibels add and the share is the
    // attribution. The band label sits under it, greyed when the share is
    // negligible — "Exceptional" contributing 0.01 dB is not a driver.
    if (spec.layer === 'evidence') {
      const share = Number(d?.share ?? 0);
      const idx = d?.state_index;
      const barW = Math.max(2, Math.round((NW - 24) * Math.min(1, Math.max(0, share))));
      const muted = share < 0.02;
      return (
        <g>
          <text x={cx} y={ty} textAnchor='middle' fontSize='13' fontWeight='700'
            fill={muted ? '#475569' : '#e2e8f0'}>{_num(d?.db, 1)} dB</text>
          <rect x={x + 12} y={ty + 8} width={NW - 24} height={7} rx={2} fill='#0f172a' />
          <rect x={x + 12} y={ty + 8} width={barW} height={7} rx={2}
            fill={typeof idx === 'number' ? _BAND_CLR[idx] ?? '#2563eb' : '#2563eb'} />
          <text x={cx} y={ty + 28} textAnchor='middle' fontSize='7.5'
            fill={muted ? '#475569' : '#94a3b8'}>
            {(d?.state ?? '—')}  ·  {(share * 100).toFixed(0)}%
          </text>
        </g>
      );
    }

    if (spec.key === 'precipitation') {
      return (
        <g>
          <text x={cx} y={ty} textAnchor='middle' fontSize='13' fontWeight='700'
            fill='#e2e8f0'>{_num(d?.mm_per_day, 1)}</text>
          <text x={cx} y={ty + 14} textAnchor='middle' fontSize='7.5' fill='#64748b'>mm/day</text>
          <text x={cx} y={ty + 30} textAnchor='middle' fontSize='8' fill='#94a3b8'>
            reads {d?.state ?? '—'}
          </text>
        </g>
      );
    }

    if (spec.key === 'tail') {
      return (
        <g>
          <text x={cx} y={ty} textAnchor='middle' fontSize='13' fontWeight='700'
            fill='#e2e8f0'>{_num(d?.rp_ratio_p90)}×</text>
          <text x={cx} y={ty + 14} textAnchor='middle' fontSize='7.5' fill='#64748b'>RP (p90)</text>
          <text x={cx} y={ty + 30} textAnchor='middle' fontSize='7.5' fill='#94a3b8'>
            {((Number(d?.frac_members_rp1 ?? 0)) * 100).toFixed(0)}% members ≥ RP1
          </text>
        </g>
      );
    }

    if (spec.key === 'antecedent') {
      return (
        <g>
          <text x={cx} y={ty} textAnchor='middle' fontSize='13' fontWeight='700'
            fill='#e2e8f0'>{d?.state ?? '—'}</text>
          <text x={cx} y={ty + 16} textAnchor='middle' fontSize='8' fill='#94a3b8'>
            {_num(d?.mm_7d, 0)} mm / 7d
          </text>
          <text x={cx} y={ty + 30} textAnchor='middle' fontSize='7' fill='#64748b'>
            {d?.observed ? 'IMERG observed' : 'climatological prior'}
          </text>
        </g>
      );
    }

    if (spec.key === 'heavy_rain') {
      const post: number[] = (d?.post ?? []).map((p: number | null) => p ?? 0);
      return (
        <g>
          <text x={cx} y={ty - 6} textAnchor='middle' fontSize='13' fontWeight='700'
            fill='#93c5fd'>P(heavy) {_num(d?.p_heavy)}</text>
          {bars(post, _RAIN_ABBR, '#2563eb', x, ty + 2, NW, 24)}
        </g>
      );
    }

    if (spec.layer === 'context') {
      const clr = _ORD_CLR[d?.state ?? ''] ?? '#6b7280';
      const detail = spec.key === 'exposure'
        ? (d?.top_elements ?? '')
        : (d?.basis ?? '');
      return (
        <g>
          <rect x={x + 22} y={ty - 14} width={NW - 44} height={20} rx={4} fill={clr} />
          <text x={cx} y={ty} textAnchor='middle' fontSize='10' fontWeight='700'
            fill='#0b1220'>{d?.state ?? '—'}</text>
          <text x={cx} y={ty + 20} textAnchor='middle' fontSize='6.5' fill='#94a3b8'>
            {String(detail).slice(0, 30)}
          </text>
          {d?.thin_evidence && (
            <text x={cx} y={ty + 32} textAnchor='middle' fontSize='6.5' fill='#f59e0b'>
              thin evidence
            </text>
          )}
        </g>
      );
    }

    if (spec.key === 'risk') {
      return (
        <g>
          <text x={cx} y={ty - 6} textAnchor='middle' fontSize='12' fontWeight='700'
            fill={_RISK_CLR[riskMaxIdx]}>{d?.state ?? '—'}</text>
          {bars(riskProbs, _RISK_ABBR, _RISK_CLR, x, ty + 2, NW, 24)}
        </g>
      );
    }

    // Confidence: the RANK is the bar. The raw value is printed but not
    // scaled — see the header note.
    if (spec.key === 'confidence') {
      const rank = Number(d?.rank ?? 0);
      return (
        <g>
          <text x={cx} y={ty} textAnchor='middle' fontSize='13' fontWeight='700'
            fill='#e2e8f0'>{_num(d?.value)}</text>
          <rect x={x + 12} y={ty + 10} width={NW - 24} height={7} rx={2} fill='#0f172a' />
          <rect x={x + 12} y={ty + 10} width={Math.max(2, (NW - 24) * rank)} height={7}
            rx={2} fill='#a78bfa' />
          <text x={cx} y={ty + 30} textAnchor='middle' fontSize='7' fill='#94a3b8'>
            rank {(rank * 100).toFixed(0)} of this init
          </text>
        </g>
      );
    }

    if (spec.key === 'crma') {
      const moved = Boolean(d?.moved_by_exposure);
      const acts: number[] = (d?.action_probs ?? []).map((p: number | null) => p ?? 0);
      return (
        <g>
          <rect x={x + 8} y={ty - 16} width={NW - 16} height={20} rx={4} fill={crmaColor} />
          <text x={cx} y={ty - 2} textAnchor='middle' fontSize='9.5' fontWeight='700'
            fill={crma?.state === 'Evaluate' ? '#1a1a1a' : '#ffffff'}>
            {String(d?.state ?? '—').replace('_', ' ')}
          </text>
          {bars(acts, _ACT_ABBR, '#475569', x, ty + 8, NW, 18)}
          {/* The baseline is the point: without it an escalation looks like
              forecast signal when it was the exposure-modulated threshold. */}
          <text x={cx} y={ty + 44} textAnchor='middle' fontSize='6.5'
            fill={moved ? '#f97316' : '#64748b'}>
            {moved
              ? `exposure moved it — baseline ${String(d?.baseline ?? '').replace('_', ' ')}`
              : `baseline agrees · C/L ${_num(cl?.ratio)}`}
          </text>
        </g>
      );
    }

    if (spec.key === 'significance') {
      const clr = _ORD_CLR[d?.state ?? ''] ?? '#6b7280';
      const bump = Number(d?.bump ?? 0);
      return (
        <g>
          <rect x={x + 22} y={ty - 14} width={NW - 44} height={20} rx={4} fill={clr} />
          <text x={cx} y={ty} textAnchor='middle' fontSize='10' fontWeight='700'
            fill='#0b1220'>{d?.state ?? '—'}</text>
          <text x={cx} y={ty + 20} textAnchor='middle' fontSize='7' fill='#94a3b8'>
            {bump === 0 ? 'on the hazard rung' : `${bump > 0 ? '+' : ''}${bump} step`}
          </text>
        </g>
      );
    }

    return (
      <text x={cx} y={ty} textAnchor='middle' fontSize='9' fill='#64748b'>
        {spec.unit}
      </text>
    );
  };

  // ── Edges ────────────────────────────────────────────────────────────────
  const edge = (e: CrmaMrEdgeSpec, i: number) => {
    const a = pos.get(e.from), b = pos.get(e.to);
    if (!a || !b) return null;
    const style = _EDGE[e.kind] ?? _EDGE.ordinal;
    // Weight a noisy-OR edge by the node's share, so the picture shows which
    // evidence actually moved the belief.
    let width = style.width;
    if (e.kind === 'noisy_or') {
      const share = Number(_pick(e.from, basin, win, schema)?.share ?? 0);
      width = 0.6 + 4.4 * Math.min(1, Math.max(0, share));
    }
    return (
      <path key={i}
        d={`M ${a.x + NW} ${a.y + NH / 2} C ${a.x + NW + 30} ${a.y + NH / 2}, ${b.x - 30} ${b.y + NH / 2}, ${b.x} ${b.y + NH / 2}`}
        fill='none' stroke={style.stroke} strokeWidth={width}
        strokeDasharray={style.dash} opacity={0.85} />
    );
  };

  return (
    <div style={{
      background: '#060d1a', borderRadius: '10px', padding: '6px 6px 2px',
      margin: '1.25rem 0', overflow: 'hidden', border: '1px solid #0f172a',
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        padding: '2px 10px 5px', fontSize: '11px',
      }}>
        <span style={{ color: '#94a3b8', fontWeight: 700, letterSpacing: '0.05em' }}>
          CRMA medium-range — {basinId} · {win}
        </span>
        <span style={{ color: '#f1f5f9', fontWeight: 700 }}>
          {init}{season ? ` · ${season.toUpperCase()}` : ''}
        </span>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', minWidth: 900, height: 'auto', display: 'block' }}
          xmlns='http://www.w3.org/2000/svg'>
          <g>{schema.edges.map(edge)}</g>

          {schema.nodes.map((spec) => {
            const p = pos.get(spec.key);
            if (!p) return null;
            const isStatic = schema.static.includes(spec.key);
            return (
              <g key={spec.key}>
                <rect x={p.x} y={p.y} width={NW} height={NH} rx={6}
                  fill='#0b1220'
                  stroke={isStatic ? '#1f2937' : '#16324f'}
                  strokeWidth='1'
                  strokeDasharray={isStatic ? '3 3' : undefined} />
                <text x={p.x + NW / 2} y={p.y + 16} textAnchor='middle'
                  fontSize='9' fontWeight='700' fill='#cbd5e1'
                  letterSpacing='0.04em'>{spec.label.toUpperCase()}</text>
                <text x={p.x + NW / 2} y={p.y + 26} textAnchor='middle'
                  fontSize='6.5' fill='#475569'>
                  {isStatic ? 'does not vary with lead' : spec.layer}
                </text>
                {nodeBody(spec, p.x, p.y)}
              </g>
            );
          })}

          {/* Column headings */}
          {layers.map((layer, ci) => (
            <text key={layer} x={PADX + ci * (NW + GAPX) + NW / 2} y={20}
              textAnchor='middle' fontSize='7.5' fill='#334155'
              letterSpacing='0.12em'>{layer.toUpperCase()}</text>
          ))}
        </svg>
      </div>

      <div style={{
        padding: '4px 10px 6px', fontSize: '9px', color: '#475569', lineHeight: 1.5,
      }}>
        Evidence bars are each node&rsquo;s share of {_num(heavy?.db_total, 1)} dB total — the
        decibels add, so share is the attribution. Bands (Quiet…Exceptional) and the
        exposure / susceptibility ladders are percentile ranks <em>of these 55 basins</em>,
        not absolute claims. Dashed boxes do not vary with lead.
        {sig ? ' ' : ''}
        CRMA state is a cost–loss ladder — how much scrutiny this warrants, not how bad it
        will be. No impact estimate is available or implied.
      </div>
    </div>
  );
}
