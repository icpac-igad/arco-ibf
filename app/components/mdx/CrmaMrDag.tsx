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

const _RISK_ABBR = ['Min', 'Low', 'Mod', 'High', 'Ext'];
const _RISK_CLR = ['#9ca3af', '#3b82f6', '#059669', '#f59e0b', '#ef4444'];
const _RISK_BANDS = ['Minimal', 'Low', 'Moderate', 'High', 'Extreme'];
const _RAIN_ABBR = ['none', 'mod', 'heavy'];

/**
 * The risk node's colour for a state NAME, so the summary card above the graph
 * wears exactly the colour of the bar it summarises. Looked up by name, not by
 * `risk.state_index` — that index is 1-based (Moderate = 3) while the bars are
 * 0-based (Mod = 2), and indexing one with the other shifts every colour by one.
 */
export function crmaRiskColour(state: string | null | undefined): string {
  const i = _RISK_BANDS.findIndex((b) => b.toLowerCase() === String(state ?? '').toLowerCase());
  return i >= 0 ? _RISK_CLR[i] : '#6b7280';
}

/**
 * The ordinal ladder for exposure and susceptibility. Deliberately NOT the risk
 * palette: a red "critical" box beside the risk node read as a risk level. These
 * are percentile ranks of the 55 basins (context, never a multiplier), so they
 * get a neutral, single-hue slate ramp — darker means higher rank, nothing more.
 */
const _ORD_STEPS = ['limited', 'elevated', 'serious', 'critical'];
const _ORD_CLR = ['#e2e8f0', '#cbd5e1', '#94a3b8', '#475569'];

/** Evidence band → colour. Percentile ranks of these 55 basins, not absolutes. */
const _BAND_CLR = ['#e5e7eb', '#cbd5e1', '#94a3b8', '#60a5fa', '#1d4ed8'];

/**
 * Evidence below this share of the decibel total is folded into one
 * "N other signals" node. The decibels add, so a 0.1% node did not move the
 * belief; five equal-sized boxes implied five contributors.
 */
const _NEGLIGIBLE = 0.05;

/**
 * Edge treatment by `kind`. The kinds carry meaning, not style:
 * `elicited` is dashed because that CPT is elicited and unscored, and
 * `threshold` is the one route by which exposure reaches a decision without
 * being multiplied into an impact number — it moves C/L, not the probability.
 */
const _EDGE: Record<string, { stroke: string; dash?: string; width: number }> = {
  noisy_or:    { stroke: '#2563eb', width: 1.5 },
  measurement: { stroke: '#7c3aed', width: 1.5, dash: '2 2' },
  elicited:    { stroke: '#9ca3af', width: 1.5, dash: '5 3' },
  derived:     { stroke: '#d1d5db', width: 1 },
  cost_loss:   { stroke: '#4b5563', width: 1.8 },
  threshold:   { stroke: '#ea580c', width: 1.5, dash: '4 3' },
  ordinal:     { stroke: '#d1d5db', width: 1 },
  // The structure the design intends and the pipeline does not yet compute.
  // Dashed with wide gaps on purpose: omitting the edge would hide the intent,
  // drawing it solid would assert a combination that does not exist —
  // P(flood | rain, antecedent, fluvial) has never been elicited.
  proposed:    { stroke: '#7c3aed', width: 1.4, dash: '2 5' },
  // An observation set BESIDE a forecast node, not an inference edge: nothing
  // flows into the belief along it. Finely dotted and in its own hue so it
  // cannot be mistaken for the blue noisy-OR arrows that do carry evidence —
  // the default `ordinal` fallback drew it as a faint SOLID line, which reads
  // as a weak derived link rather than as an annotation.
  corroborates: { stroke: '#0d9488', width: 1.2, dash: '1 3' },
};

/** Column order. Anything the schema declares outside this falls in at the end. */
const _LAYERS = [
  'evidence', 'measurement', 'observation', 'hazard',
  'context', 'risk', 'uncertainty', 'decision',
] as const;

/**
 * Presentation-layer label overrides. The payload calls this node
 * `confidence`, and that name misinforms: the quantity is
 * `1 − H(P(Risk))/H_max`, the CONCENTRATION of the posterior, not the epistemic
 * support for it. Two assessments with identical distributions score identically
 * whether the CPT came from thirty years of observation or an unvalidated
 * elicitation — and this flood CPT is elicited and unscored, so a sharply peaked
 * posterior would otherwise read as "high confidence" with nothing having
 * verified it.
 *
 * `sharpness` is the established term (Gneiting, Balabdaoui & Raftery 2007).
 * Renamed here rather than in the data, so the parquet column and the API field
 * keep their names and only the reader sees the correction.
 */
const _LABEL: Record<string, string> = { confidence: 'Sharpness' };

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

/**
 * `combined` / `verified` arrive in two places and both must count.
 *
 * `fluvial` carries them on its per-basin payload; `satellite` carries them only
 * on the node spec in `schema.nodes`. Reading one place silently drops the
 * caveat for the other — and the caveat is the whole reason these nodes are
 * drawn differently, so dropping it presents a reported observation as part of
 * the posterior.
 */
function _flag(
  name: 'combined' | 'verified',
  spec: CrmaMrNodeSpec,
  basin: CrmaMrBasinDag,
  window: string,
  schema: CrmaMrSchema,
): boolean {
  if ((spec as Record<string, any>)[name] === false) return true;
  return _pick(spec.key, basin, window, schema)?.[name] === false;
}

const _uncombined = (
  spec: CrmaMrNodeSpec, b: CrmaMrBasinDag, w: string, s: CrmaMrSchema,
) => _flag('combined', spec, b, w, s);

const _unverified = (
  spec: CrmaMrNodeSpec, b: CrmaMrBasinDag, w: string, s: CrmaMrSchema,
) => _flag('verified', spec, b, w, s);

/**
 * Plain-language meaning of each edge kind, for the inline legend. The kinds
 * carry meaning (see `_EDGE`), so the legend says what they mean, not how they
 * are drawn.
 */
const _EDGE_PLAIN: Record<string, string> = {
  noisy_or: 'pushes the heavy-rain signal — thicker line = bigger share',
  measurement: 'a rainfall reading that informs heavy rain',
  elicited: 'expert-judged link, not yet scored against observations',
  derived: 'calculated from the risk result',
  cost_loss: 'cost–loss link',
  threshold: 'moves the decision threshold, not the probability',
  ordinal: 'ordinal link',
  proposed: 'planned link — not used in the calculation yet',
  corroborates: 'satellite check against a signal — observed, not combined',
};

/**
 * Greedy word-wrap for SVG text, which has none. Character budget rather than
 * measured width: good enough at 11–12 px for labels this short, and the
 * caller caps the line count so a long payload string cannot overflow a node.
 */
function _wrap(text: string, maxChars: number, maxLines = 2): string[] {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if (!cur) cur = w;
    else if ((cur + ' ' + w).length <= maxChars) cur += ' ' + w;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = kept[maxLines - 1].slice(0, maxChars - 1) + '…';
    return kept;
  }
  return lines;
}

/** A node as drawn: a schema node, or the aggregate of negligible evidence. */
type _DNode = {
  key: string;
  layer: string;
  label: string;
  spec?: CrmaMrNodeSpec;
  agg?: { specs: CrmaMrNodeSpec[]; share: number; db: number };
};

const _AGG_KEY = '__negligible_evidence';

/**
 * The network's key: what each line kind and box style present in this schema
 * MEANS. Drawn under the graph, or in the full-screen dialog's guide. Folding
 * negligible evidence keeps every edge's kind, so the kinds are read straight
 * off the schema.
 */
export function CrmaMrLegend({
  schema, basin, window: win,
}: {
  schema: CrmaMrSchema;
  basin: CrmaMrBasinDag;
  window: string;
}) {
  const edgeKinds = Array.from(new Set(schema.edges.map((e) => e.kind)));
  const hasStatic = schema.static.length > 0;
  const hasUncombined = schema.nodes.some((n) => _uncombined(n, basin, win, schema));
  return (
    <ul className='ev-legend' aria-label='How to read the network'>
      {edgeKinds.map((k) => {
        const st = _EDGE[k] ?? _EDGE.ordinal;
        return (
          <li key={k}>
            <svg width='36' height='12' aria-hidden='true'>
              <line x1='2' y1='6' x2='34' y2='6' stroke={st.stroke}
                strokeWidth={Math.max(2, st.width)} strokeDasharray={st.dash} />
            </svg>
            {_EDGE_PLAIN[k] ?? k}
          </li>
        );
      })}
      {hasStatic && (
        <li>
          <svg width='36' height='16' aria-hidden='true'>
            <rect x='2' y='2' width='32' height='12' rx='3' fill='#fff'
              stroke='#94a3b8' strokeWidth='1.25' strokeDasharray='6 4' />
          </svg>
          dashed box: does not change with lead time
        </li>
      )}
      {hasUncombined && (
        <li>
          <svg width='36' height='16' aria-hidden='true'>
            <rect x='2' y='2' width='32' height='12' rx='3' fill='#fff'
              stroke='#94a3b8' strokeWidth='1.25' strokeDasharray='2 4' />
          </svg>
          dotted box: shown for reference, not used in the risk result
        </li>
      )}
      <li>
        <svg width='36' height='16' aria-hidden='true'>
          {_ORD_CLR.map((c, i) => (
            <rect key={i} x={2 + i * 8.5} y='4' width='7' height='8' rx='1'
              fill={c} stroke='#94a3b8' strokeWidth='0.75' />
          ))}
        </svg>
        grey ladder: rank among these 55 basins (exposure, susceptibility) — not a risk level
      </li>
    </ul>
  );
}

export function CrmaMrDag({
  schema, basin, window: win, basinId, init, season, showHeader = true, fit = false,
  showLegend = true,
}: {
  schema: CrmaMrSchema;
  basin: CrmaMrBasinDag;
  window: string;
  basinId: string;
  init: string;
  season?: string;
  /**
   * The basin · window · init strip above the graph. Off when the caller
   * already states all three (the boundary panel's summary card), so the
   * reader does not see the same header twice.
   */
  showHeader?: boolean;
  /**
   * Scale the graph to its container instead of holding it at ≥1 px per unit.
   * For the zoomable modal, where the reader zooms in; inline, the graph keeps
   * its full width (and scrolls) so no label drops below 11 px.
   */
  fit?: boolean;
  /** Off in the dialog, whose guide shows the same key outside the zoomed graph. */
  showLegend?: boolean;
}) {
  if (!schema?.nodes?.length || !basin) {
    return (
      <p style={{ color: '#ef4444', fontSize: '0.8rem', fontFamily: 'monospace' }}>
        CrmaMrDag: no schema or no basin data
      </p>
    );
  }

  // ── Display nodes ────────────────────────────────────────────────────────
  // Evidence whose share of the decibel total is negligible is folded into a
  // single node, so the one that moved the belief stands out. Only when two or
  // more qualify — "1 other signal" saves nothing. The fold is presentation
  // only: its share and decibels are the sums of its members, and every
  // member is named inside it.
  const negligible = schema.nodes.filter((n) => {
    if (n.layer !== 'evidence') return false;
    const share = Number(_pick(n.key, basin, win, schema)?.share ?? 0);
    return share < _NEGLIGIBLE;
  });
  const folding = negligible.length >= 2;
  const folded = new Set(folding ? negligible.map((n) => n.key) : []);

  const dnodes: _DNode[] = [];
  let aggPlaced = false;
  for (const n of schema.nodes) {
    if (folded.has(n.key)) {
      if (!aggPlaced) {
        aggPlaced = true;
        let share = 0, db = 0;
        for (const m of negligible) {
          const d = _pick(m.key, basin, win, schema);
          share += Number(d?.share ?? 0);
          db += Number(d?.db ?? 0);
        }
        dnodes.push({
          key: _AGG_KEY, layer: 'evidence',
          label: `${negligible.length} other signals`,
          agg: { specs: negligible, share, db },
        });
      }
      continue;
    }
    dnodes.push({ key: n.key, layer: n.layer, label: _LABEL[n.key] ?? n.label, spec: n });
  }
  // Edges from folded nodes are redrawn once, from the aggregate. Their kind is
  // kept (all are noisy-OR into heavy rain today); duplicates collapse.
  const dedges: CrmaMrEdgeSpec[] = [];
  const seenEdge = new Set<string>();
  for (const e of schema.edges) {
    const from = folded.has(e.from) ? _AGG_KEY : e.from;
    const to = folded.has(e.to) ? _AGG_KEY : e.to;
    const k = `${from}>${to}>${e.kind}`;
    if (seenEdge.has(k)) continue;
    seenEdge.add(k);
    dedges.push({ ...e, from, to });
  }
  const aggShare = dnodes.find((d) => d.agg)?.agg?.share ?? 0;

  // ── Layout ───────────────────────────────────────────────────────────────
  // Columns are the schema's layers; rows are the nodes within a layer. Both
  // are computed, not fixed, so a new node lands somewhere sane on its own.
  const byLayer = new Map<string, _DNode[]>();
  for (const n of dnodes) {
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

  // Sized for text that is ≥11 px at the rendered width: the SVG never draws
  // narrower than its viewBox (minWidth = W below), so 1 unit ≥ 1 px. Every
  // node shares one vertical grid — title, up to two sub-label lines, then the
  // body from BODY down — so a body can never sit on top of its sub-label.
  const NW = 180, NH = 150, GAPX = 26, GAPY = 16, PADX = 16, PADY = 40;
  const TITLE = 20, SUB = 37, SUB_LH = 14, BODY = 70;
  const SUB_CHARS = 26;
  const rows = Math.max(...layers.map((l) => byLayer.get(l)!.length));
  const W = PADX * 2 + layers.length * NW + (layers.length - 1) * GAPX;
  const H = PADY + rows * NH + (rows - 1) * GAPY + 16;

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

  const riskProbs: number[] = (risk?.probs ?? []).map((p: number | null) => p ?? 0);

  // ── Per-node body renderers ──────────────────────────────────────────────
  const bars = (
    probs: number[], abbr: string[], clr: string[] | string,
    x: number, y: number, w: number, maxH = 30,
  ) => {
    const n = probs.length;
    if (!n) return null;
    const m = 10, gap = 4;
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
              <text x={bx + bw / 2} y={y + maxH + 13} textAnchor='middle'
                fontSize='11' fill='#374151'>{abbr[i]}</text>
            </g>
          );
        })}
      </g>
    );
  };

  const lines = (
    text: string, cx: number, y: number,
    props: React.SVGProps<SVGTextElement>, maxLines = 2,
  ) => (
    <text x={cx} y={y} textAnchor='middle' fontSize='11' fill='#374151' {...props}>
      {_wrap(text, SUB_CHARS, maxLines).map((l, i) => (
        <tspan key={i} x={cx} dy={i === 0 ? 0 : SUB_LH}>{l}</tspan>
      ))}
    </text>
  );

  const nodeBody = (n: _DNode, x: number, y: number) => {
    const cx = x + NW / 2;
    const b = y + BODY;

    // The fold of negligible evidence: what it holds, and how little.
    if (n.agg) {
      const names = n.agg.specs.map((s) => s.label).join(', ');
      return (
        <g>
          <text x={cx} y={b + 14} textAnchor='middle' fontSize='15' fontWeight='700'
            fill='#6b7280'>{(n.agg.share * 100).toFixed(0)}% combined</text>
          {lines(names, cx, b + 34, { fill: '#6b7280' })}
          <text x={cx} y={b + 66} textAnchor='middle' fontSize='11' fill='#6b7280'>
            {_num(n.agg.db, 1)} dB in total
          </text>
        </g>
      );
    }

    const spec = n.spec!;
    const d = _pick(spec.key, basin, win, schema);

    // Evidence: a share bar, because the decibels add and the share is the
    // attribution. The band label sits under it, greyed when the share is
    // negligible — "Exceptional" contributing 0.01 dB is not a driver.
    if (spec.layer === 'evidence') {
      const share = Number(d?.share ?? 0);
      const idx = d?.state_index;
      const barW = Math.max(2, Math.round((NW - 24) * Math.min(1, Math.max(0, share))));
      const muted = share < _NEGLIGIBLE;
      return (
        <g>
          <text x={cx} y={b + 14} textAnchor='middle' fontSize='16' fontWeight='700'
            fill={muted ? '#6b7280' : '#111827'}>{(share * 100).toFixed(0)}% of signal</text>
          <rect x={x + 12} y={b + 24} width={NW - 24} height={9} rx={2} fill='#e5e7eb' />
          <rect x={x + 12} y={b + 24} width={barW} height={9} rx={2}
            fill={typeof idx === 'number' ? _BAND_CLR[idx] ?? '#2563eb' : '#2563eb'} />
          <text x={cx} y={b + 52} textAnchor='middle' fontSize='12'
            fill={muted ? '#6b7280' : '#374151'}>
            {(d?.state ?? '—').replace(/_/g, ' ')}  ·  {_num(d?.db, 1)} dB
          </text>
        </g>
      );
    }

    if (spec.key === 'precipitation') {
      return (
        <g>
          <text x={cx} y={b + 14} textAnchor='middle' fontSize='16' fontWeight='700'
            fill='#111827'>{_num(d?.mm_per_day, 1)} mm/day</text>
          <text x={cx} y={b + 36} textAnchor='middle' fontSize='12' fill='#374151'>
            reads {d?.state ?? '—'}
          </text>
        </g>
      );
    }

    if (spec.key === 'tail') {
      return (
        <g>
          <text x={cx} y={b + 14} textAnchor='middle' fontSize='16' fontWeight='700'
            fill='#111827'>{_num(d?.rp_ratio_p90)}× RP (p90)</text>
          <text x={cx} y={b + 36} textAnchor='middle' fontSize='12' fill='#374151'>
            {((Number(d?.frac_members_rp1 ?? 0)) * 100).toFixed(0)}% members ≥ RP1
          </text>
        </g>
      );
    }

    // GEOGLOWS routed discharge: REPORTED, not combined. Keyed off `observed`
    // and not node presence, because 939 of 951 initialisations carry this node
    // with null values — capture starts 2026-10-01 — so "the node is here" says
    // nothing about whether there is a reading. And p_high of 0 is a real
    // answer, not a missing one: only 25 of 55 basins had any member crossing
    // in October, so 0 must render as 0 rather than as a blank.
    if (spec.key === 'fluvial') {
      const obs = Boolean(d?.observed);
      const ph = d?.p_high;
      return (
        <g>
          <text x={cx} y={b + 14} textAnchor='middle' fontSize='16' fontWeight='700'
            fill={obs ? '#111827' : '#6b7280'}>
            {obs && typeof ph === 'number' ? `${(ph * 100).toFixed(0)}%` : 'no reading'}
          </text>
          <text x={cx} y={b + 34} textAnchor='middle' fontSize='11' fill='#374151'>
            {obs ? 'members over RP2' : 'not captured for this init'}
          </text>
          <text x={cx} y={b + 52} textAnchor='middle' fontSize='11' fontWeight='700'
            fill='#7c3aed'>reported, not combined</text>
        </g>
      );
    }

    if (spec.key === 'antecedent') {
      return (
        <g>
          <text x={cx} y={b + 14} textAnchor='middle' fontSize='16' fontWeight='700'
            fill='#111827'>{d?.state ?? '—'}</text>
          <text x={cx} y={b + 34} textAnchor='middle' fontSize='12' fill='#374151'>
            {_num(d?.mm_7d, 0)} mm / 7d
          </text>
          <text x={cx} y={b + 52} textAnchor='middle' fontSize='11' fill='#374151'>
            {d?.observed ? 'IMERG observed' : 'climatological prior'}
          </text>
        </g>
      );
    }

    if (spec.key === 'satellite') {
      // Keyed off the payload being present, not off the node being in the
      // schema: capture starts 2026-10-01 and every earlier init carries
      // `satellite: null`, so presence of the NODE says nothing about whether
      // there is an observation. Same trap as `fluvial`.
      if (!d) {
        return (
          <g>
            <text x={cx} y={b + 14} textAnchor='middle' fontSize='16' fontWeight='700'
              fill='#6b7280'>no reading</text>
            <text x={cx} y={b + 34} textAnchor='middle' fontSize='11' fill='#374151'>
              not captured for this init
            </text>
          </g>
        );
      }
      const agree = Number(d.corroborates ?? 0);
      const part = Number(d.partial ?? 0);
      const against = Number(d.contradicts ?? 0);
      return (
        <g>
          <text x={cx} y={b + 14} textAnchor='middle' fontSize='16' fontWeight='700'
            fill='#111827'>{d.verdict ?? '—'}</text>
          <text x={cx} y={b + 32} textAnchor='middle' fontSize='11' fill='#374151'>
            {agree} corroborate · {part} partial · {against} contradict
          </text>
          <text x={cx} y={b + 46} textAnchor='middle' fontSize='11' fill='#374151'>
            {String(d.observed ?? 'observed')}
          </text>
          {/* The whole point of the node, and the thing a reader will otherwise
              assume the opposite of. */}
          <text x={cx} y={b + 60} textAnchor='middle' fontSize='11' fontWeight='700' fill='#0d9488'>
            observed, not combined
          </text>
        </g>
      );
    }

    if (spec.key === 'heavy_rain') {
      const post: number[] = (d?.post ?? []).map((p: number | null) => p ?? 0);
      return (
        <g>
          <text x={cx} y={b + 12} textAnchor='middle' fontSize='15' fontWeight='700'
            fill='#1d4ed8'>P(heavy) {_num(d?.p_heavy)}</text>
          {bars(post, _RAIN_ABBR, '#2563eb', x, b + 20, NW, 30)}
        </g>
      );
    }

    // Exposure / susceptibility: a four-step ladder in a neutral ramp, filled
    // up to the rank. Ordinal, and visibly not the risk palette.
    if (spec.layer === 'context') {
      const si = _ORD_STEPS.indexOf(String(d?.state ?? ''));
      const detail = spec.key === 'exposure'
        ? (d?.top_elements ?? '')
        : (d?.basis ?? '');
      const pipGap = 4, pipW = (NW - 24 - 3 * pipGap) / 4;
      return (
        <g>
          <text x={cx} y={b + 12} textAnchor='middle' fontSize='15' fontWeight='700'
            fill='#111827'>{d?.state ?? '—'}</text>
          {_ORD_STEPS.map((_, i) => (
            <rect key={i} x={x + 12 + i * (pipW + pipGap)} y={b + 20} width={pipW}
              height={9} rx={2}
              fill={si >= 0 && i <= si ? _ORD_CLR[i] : '#ffffff'}
              stroke='#94a3b8' strokeWidth='0.75' />
          ))}
          {lines(String(detail).replace(/\+/g, ' + '), cx, b + 46, {}, 2)}
          {d?.thin_evidence && (
            <text x={cx} y={b + 74} textAnchor='middle' fontSize='11' fontWeight='700'
              fill='#b45309'>thin evidence</text>
          )}
        </g>
      );
    }

    if (spec.key === 'risk') {
      return (
        <g>
          <text x={cx} y={b + 12} textAnchor='middle' fontSize='15' fontWeight='700'
            fill='#111827'>{d?.state ?? '—'}</text>
          {bars(riskProbs, _RISK_ABBR, _RISK_CLR, x, b + 20, NW, 30)}
        </g>
      );
    }

    // Confidence: the RANK is the bar. The raw value is printed but not
    // scaled — see the header note.
    if (spec.key === 'confidence') {
      const rank = Number(d?.rank ?? 0);
      return (
        <g>
          <text x={cx} y={b + 14} textAnchor='middle' fontSize='16' fontWeight='700'
            fill='#111827'>{_num(d?.value)}</text>
          <rect x={x + 12} y={b + 24} width={NW - 24} height={9} rx={2} fill='#e5e7eb' />
          <rect x={x + 12} y={b + 24} width={Math.max(2, (NW - 24) * rank)} height={9}
            rx={2} fill='#7c3aed' />
          {lines(`sharpness rank ${(rank * 100).toFixed(0)} of this init`, cx, b + 50, {})}
        </g>
      );
    }

    // No `crma` or `significance` branch: the decision layer was removed
    // upstream (hazards/RISK_SCALE.md). The component is schema-driven, so an
    // absent node is simply never asked for — but carrying renderers for nodes
    // that cannot arrive invites someone to reintroduce the ladder to feed them.

    return (
      <text x={cx} y={b + 14} textAnchor='middle' fontSize='12' fill='#374151'>
        {spec.unit}
      </text>
    );
  };

  const subLabel = (n: _DNode): string => {
    if (n.agg) return `each under ${(_NEGLIGIBLE * 100).toFixed(0)}% — negligible`;
    const spec = n.spec!;
    // Checked first: satellite is static AND unverified, and "not verified"
    // is the caveat a reader needs (reads both the node spec and the payload).
    if (_unverified(spec, basin, win, schema)) return 'characterised, not verified';
    if (schema.static.includes(spec.key)) return 'does not vary with lead';
    if (spec.key === 'confidence') return 'posterior concentration — not skill';
    return spec.layer;
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
      const share = e.from === _AGG_KEY
        ? aggShare
        : Number(_pick(e.from, basin, win, schema)?.share ?? 0);
      width = 0.6 + 4.4 * Math.min(1, Math.max(0, share));
    }
    // Most edges run left to right down the layer columns, so they leave a's
    // right face and enter b's left. `corroborates` runs the other way —
    // satellite sits in `observation` and annotates nodes back in `evidence` —
    // and reusing the forward path for it threw a long S across the whole
    // figure, over the columns in between. Mirror it instead: leave a's LEFT
    // face, enter b's RIGHT, so the curve stays local and its direction reads.
    const back = b.x < a.x;
    const d = back
      ? `M ${a.x} ${a.y + NH / 2} C ${a.x - 30} ${a.y + NH / 2}, ${b.x + NW + 30} ${b.y + NH / 2}, ${b.x + NW} ${b.y + NH / 2}`
      : `M ${a.x + NW} ${a.y + NH / 2} C ${a.x + NW + 30} ${a.y + NH / 2}, ${b.x - 30} ${b.y + NH / 2}, ${b.x} ${b.y + NH / 2}`;
    return (
      <path key={i} d={d}
        fill='none' stroke={style.stroke} strokeWidth={width}
        strokeDasharray={style.dash} opacity={0.85} />
    );
  };

  return (
    <div className='ev-dag'>
      {showHeader && (
        <div className='ev-dag__head'>
          <span>CRMA medium-range — {basinId} · {win}</span>
          <span>{init}{season ? ` · ${season.toUpperCase()}` : ''}</span>
        </div>
      )}

      <div className='ev-dag__scroll'>
        <svg viewBox={`0 0 ${W} ${H}`}
          style={{ width: '100%', minWidth: fit ? undefined : W, height: 'auto', display: 'block' }}
          xmlns='http://www.w3.org/2000/svg' role='img'
          aria-label={`Evidence network for basin ${basinId}, ${win}`}>
          <g>{dedges.map(edge)}</g>

          {dnodes.map((n) => {
            const p = pos.get(n.key);
            if (!p) return null;
            const isStatic = !!n.spec && schema.static.includes(n.spec.key);
            const uncombined = !!n.spec && _uncombined(n.spec, basin, win, schema);
            const sub = _wrap(subLabel(n), SUB_CHARS, 2);
            return (
              <g key={n.key}>
                <rect x={p.x} y={p.y} width={NW} height={NH} rx={6}
                  fill={n.agg ? '#f9fafb' : '#ffffff'}
                  stroke={isStatic || uncombined ? '#94a3b8' : '#cbd5e1'}
                  strokeWidth={isStatic || uncombined ? 1.25 : 1}
                  strokeDasharray={
                    // `combined: false` wins over the static pattern: satellite
                    // is BOTH static and uncombined, and the caveat that
                    // matters is that it is not part of the posterior.
                    uncombined ? '2 4'
                    : isStatic ? '6 4'
                    : undefined} />
                <text x={p.x + NW / 2} y={p.y + TITLE} textAnchor='middle'
                  fontSize='13' fontWeight='700' fill={n.agg ? '#6b7280' : '#111827'}
                  letterSpacing='0.04em'>{n.label.toUpperCase()}</text>
                <text x={p.x + NW / 2} y={p.y + SUB} textAnchor='middle'
                  fontSize='11' fill='#4b5563' fontStyle='italic'>
                  {sub.map((l, i) => (
                    <tspan key={i} x={p.x + NW / 2} dy={i === 0 ? 0 : SUB_LH}>{l}</tspan>
                  ))}
                </text>
                {nodeBody(n, p.x, p.y)}
              </g>
            );
          })}

          {/* Column headings */}
          {layers.map((layer, ci) => (
            <text key={layer} x={PADX + ci * (NW + GAPX) + NW / 2} y={22}
              textAnchor='middle' fontSize='11' fontWeight='700' fill='#374151'
              letterSpacing='0.12em'>{layer.toUpperCase()}</text>
          ))}
        </svg>
      </div>

      {/* Plain-language legend: what the line and box styles MEAN. */}
      {showLegend && <CrmaMrLegend schema={schema} basin={basin} window={win} />}

      <details className='ev-technical'>
        <summary>Technical notes</summary>
        <div>
          Evidence bars are each node&rsquo;s share of {_num(heavy?.db_total, 1)} dB total — the
          decibels add, so share is the attribution. Bands (Quiet…Exceptional) and the
          exposure / susceptibility ladders are percentile ranks <em>of these 55 basins</em>,
          not absolute claims. Dashed boxes do not vary with lead.
          <strong>Sharpness</strong> is how concentrated the posterior is
          (1 − H/H_max), <em>not</em> forecast skill and not correctness — a sharp
          posterior can be sharply wrong. Assessment confidence is not yet
          available: the flood CPT is elicited and unverified.{' '}
          The risk node is the belief: a five-state posterior, with{' '}
          <em>P(High∪Extreme)</em> as the mass on its severe end. CRMA applies no
          threshold to it — compare that number to a tolerance of your own. No
          impact estimate is available or implied.
          {folding && (
            <>
              {' '}Evidence nodes under {(_NEGLIGIBLE * 100).toFixed(0)}% of the decibel
              total are drawn as one node; their share and dB are the sums.
            </>
          )}
        </div>
      </details>
    </div>
  );
}
