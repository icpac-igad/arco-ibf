/**
 * Drift guard for the AI-assistant prompt (see llm-prompt.ts).
 *
 * The fixtures are trimmed captures of the real payload (2026-11-16,
 * boundary=KEN.18_1). Two kinds of check:
 *   1. the payload still has the shape the prompt's literal wording describes
 *      (edge kinds and their meaning, removed fields, the alpha location);
 *   2. the prompt quotes the counts it is given and emits only filtered,
 *      public, credential-free URLs.
 * If the network changes, re-capture the fixtures; a failing assertion here is
 * the prompt's wording going out of date, which is the point.
 */
import { describe, expect, it } from 'vitest';
import type { CrmaMrDagResponse } from '../types/crma-mr';
import dagFixture from './__fixtures__/crma-mr-dag-KEN.18_1.json';
import evFixture from './__fixtures__/crma-mr-evidence-KEN.18_1.json';
import {
  CRMA_PUBLIC_BASE, EDGE_KIND_GLOSS, buildLlmPrompt, edgesByKind, promptUrls,
} from './llm-prompt';

const dag = dagFixture as unknown as CrmaMrDagResponse;
const ev = evFixture as unknown as {
  provenance: { tables: Record<string, string> };
  schema: {
    nodes: CrmaMrDagResponse['schema']['nodes'];
    edges: { from: string; to: string; kind: string; verified: string; params?: Record<string, { alpha: number }> }[];
    skill: { source: string; by_window: Record<string, unknown> };
    notes: string[];
  };
  basins: Record<string, { windows: Record<string, { path: Record<string, unknown>[] }> }>;
};

const BOUNDARY = 'KEN.18_1';
const WIN = 'D1';
const unitWin = dag.admin1[BOUNDARY].windows[WIN];
const target = {
  init: dag.init,
  window: WIN,
  boundary: BOUNDARY,
  placeName: dag.admin1[BOUNDARY].name,
  topBasin: unitWin.top_basin,
  share: unitWin.top_basin_unit_share,
};
const prompt = buildLlmPrompt(dag.schema, target);

describe('fixture: the network the prompt describes', () => {
  it('has the node and edge counts the prompt was written against', () => {
    expect(dag.schema.nodes).toHaveLength(14);
    expect(dag.schema.edges).toHaveLength(11);
    expect(dag.schema.nodes.filter((n) => n.layer === 'evidence')).toHaveLength(5);
  });

  it('has five edge kinds, split 5/1/3/1/1', () => {
    const counts = Object.fromEntries(edgesByKind(dag.schema.edges).map(([k, es]) => [k, es.length]));
    expect(counts).toEqual({ noisy_or: 5, measurement: 1, elicited: 3, proposed: 1, derived: 1 });
  });

  it('has three elicited edges, all into risk, and fluvial not combined', () => {
    const elicited = dag.schema.edges.filter((e) => e.kind === 'elicited');
    expect(elicited.map((e) => e.to)).toEqual(['risk', 'risk', 'risk']);
    expect(dag.schema.nodes.find((n) => n.key === 'fluvial')?.combined).toBe(false);
  });

  it('every edge kind has a gloss in the template', () => {
    for (const [kind] of edgesByKind(dag.schema.edges)) expect(EDGE_KIND_GLOSS[kind]).toBeTruthy();
  });

  it('evidence and DAG schemas agree on topology', () => {
    const sig = (es: { from: string; to: string; kind: string }[]) =>
      es.map((e) => `${e.from}>${e.to}:${e.kind}`);
    expect(sig(ev.schema.edges)).toEqual(sig(dag.schema.edges));
    expect(ev.schema.nodes.map((n) => n.key)).toEqual(dag.schema.nodes.map((n) => n.key));
  });

  it('each edge kind gloss matches what the payload says in `verified`', () => {
    expect(ev.schema.edges.every((e) => typeof e.verified === 'string' && e.verified)).toBe(true);
    const v = (kind: string) => ev.schema.edges.filter((e) => e.kind === kind).map((e) => e.verified);
    for (const s of v('noisy_or')) expect(s).toMatch(/fitted/i);
    for (const s of v('noisy_or')) expect(s).toMatch(/IMERG/);
    for (const s of v('measurement')) expect(s).toMatch(/counted/i);
    for (const s of v('measurement')) expect(s).toMatch(/alpha/i);
    for (const s of v('elicited')) expect(s).toMatch(/expert judgement/i);
    for (const s of v('elicited')) expect(s).toMatch(/never scored/i);
    for (const s of v('proposed')) expect(s).toMatch(/not computed/i);
    for (const s of v('derived')) expect(s).toMatch(/arithmetic/i);
  });

  it('alpha lives where the prompt says, per window', () => {
    const m = ev.schema.edges.find((e) => e.from === 'precipitation' && e.to === 'heavy_rain');
    expect(m?.kind).toBe('measurement');
    for (const w of dag.windows) expect(typeof m?.params?.[w]?.alpha).toBe('number');
  });

  it('path steps carry both p_link fields and no single p_link', () => {
    const step = ev.basins[unitWin.top_basin!].windows[WIN].path[0];
    expect(step).toHaveProperty('p_link_moderate_at_state');
    expect(step).toHaveProperty('p_link_heavy_at_state');
    expect(step).not.toHaveProperty('p_link');
  });

  it('schema.skill names its windows and source', () => {
    expect(ev.schema.skill.source).toBeTruthy();
    expect(Object.keys(ev.schema.skill.by_window).length).toBeGreaterThan(0);
  });

  it('belief, confidence and inheritance fields are where the prompt says', () => {
    const levels = ['Minimal', 'Low', 'Moderate', 'High', 'Extreme'];
    const w = dag.basins[unitWin.top_basin!].windows[WIN];
    expect(w.risk.probs).toHaveLength(5);
    expect(levels).toContain(w.risk.state);
    expect(typeof w.risk.p_high_extreme).toBe('number');
    expect(typeof w.confidence.rank).toBe('number');
    const derived = ev.schema.edges.find((e) => e.kind === 'derived');
    expect(derived?.verified).toContain('1 - H/H_max');
    expect(dag.basins[unitWin.top_basin!].static.antecedent.observed).toBe(true);
    expect(dag).toHaveProperty('top_basin_by_window');
    expect(levels).toContain(unitWin.inherited?.risk_level);
    expect(typeof unitWin.inherited?.p_high_extreme).toBe('number');
    expect(typeof unitWin.top_basin_unit_share).toBe('number');
  });

  it('schema.notes states the moderate/heavy thresholds and percentile bands', () => {
    const notes = ev.schema.notes.join(' ');
    expect(notes).toMatch(/moderate/i);
    expect(notes).toMatch(/heavy/i);
    expect(notes).toMatch(/mm\/day/);
    expect(notes).toMatch(/percentile/i);
  });

  it('provenance carries a sha256 per table', () => {
    const t = Object.values(ev.provenance.tables);
    expect(t.length).toBeGreaterThan(0);
    for (const h of t) expect(h).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('the removed decision fields stay removed', () => {
    const removed = ['crma_state', 'crma_state_baseline', 'traffic_light', 'action_probs'];
    const found: string[] = [];
    const walk = (o: unknown) => {
      if (Array.isArray(o)) o.forEach(walk);
      else if (o && typeof o === 'object') {
        for (const [k, v] of Object.entries(o)) {
          if (removed.includes(k) || k.startsWith('cost_loss')) found.push(k);
          walk(v);
        }
      }
    };
    walk(dagFixture);
    walk(evFixture);
    expect(found).toEqual([]);
  });
});

describe('buildLlmPrompt', () => {
  it('quotes the counts from the schema it is given, not literals', () => {
    expect(prompt).toContain('14 nodes and 11 edges of 5 kinds');
    const fewer = buildLlmPrompt(
      { nodes: dag.schema.nodes.slice(0, 13), edges: dag.schema.edges.slice(0, 10) },
      target,
    );
    expect(fewer).toContain('13 nodes and 10 edges of 4 kinds');
  });

  it('lists each kind with its edges from the payload', () => {
    expect(prompt).toContain(
      '`noisy_or` (moisture, transport, disturbance, vertical, convective -> heavy_rain)',
    );
    expect(prompt).toContain('`measurement` (precipitation -> heavy_rain)');
    expect(prompt).toContain('`elicited` (heavy_rain, antecedent, tail -> risk)');
    expect(prompt).toContain('`proposed` (fluvial -> risk)');
    expect(prompt).toContain('`derived` (risk -> confidence)');
    expect(prompt).toContain('the 3 `elicited` edges into risk (from heavy_rain, antecedent, tail)');
    expect(prompt).toContain('fluvial is reported but not combined');
  });

  it('falls back to `verified` for an unknown edge kind', () => {
    const p = buildLlmPrompt(
      { nodes: dag.schema.nodes, edges: [...dag.schema.edges, { from: 'x', to: 'risk', kind: 'new_kind' as never }] },
      target,
    );
    expect(p).toMatch(/`new_kind` \(x -> risk\): not described in this prompt/);
  });

  it('states the coordinates and the inherited share', () => {
    expect(prompt).toContain(`Kitui (KEN.18_1), initialisation 2026-11-16, lead window D1`);
    expect(prompt).toContain('basin hybas_1040008470, and the unit makes up 30.7% of that basin');
  });

  it('quotes no fitted number: alpha is read from the payload', () => {
    expect(prompt).toContain('.params[<window>].alpha');
    expect(prompt).not.toMatch(/alpha\D{0,20}\d/i);
    expect(prompt).not.toMatch(/AUC\D{0,20}\d/);
  });

  it('omits the satellite paragraph when the schema has no satellite', () => {
    expect(prompt).not.toMatch(/satellite/i);
  });

  it('adds the satellite caveats when the schema carries a corroborates edge', () => {
    const p = buildLlmPrompt(
      {
        nodes: [...dag.schema.nodes, { key: 'satellite', label: 'Satellite', layer: 'observation', unit: '', combined: false }],
        edges: [...dag.schema.edges, { from: 'satellite', to: 'moisture', kind: 'corroborates' }],
      },
      target,
    );
    expect(p).toContain('`corroborates` (satellite -> moisture): an observation set BESIDE');
    expect(p).toMatch(/satellite is observed too/);
    expect(p).toContain('fluvial, satellite are reported but not combined');
  });

  it('emits only filtered, public, credential-free URLs', () => {
    const urls = prompt.match(/https?:\/\/\S+/g) ?? [];
    expect(urls).toHaveLength(5);
    for (const u of urls) {
      expect(u.startsWith(`${CRMA_PUBLIC_BASE}/api/`)).toBe(true);
      if (/crma-mr-(evidence|dag|regions)\//.test(u)) expect(u).toContain('?boundary=KEN.18_1');
    }
    expect(urls).toContain(`${CRMA_PUBLIC_BASE}/api/crma-mr-regions/2026-11-16/D1?boundary=KEN.18_1`);
    expect(prompt).not.toMatch(/localhost|crma-api-|token=|key=|Bearer/i);
  });

  it('basin-only form filters by basin and drops the unfilterable regions URL', () => {
    const u = promptUrls({ init: '2026-11-16', window: 'D1', basin: 'hybas_1040008470' });
    expect(u.map((x) => x.url).filter((x) => /evidence|dag/.test(x)).every((x) => x.endsWith('?basin=hybas_1040008470'))).toBe(true);
    expect(u.some((x) => x.url.includes('crma-mr-regions'))).toBe(false);
    expect(promptUrls({ init: '2026-11-16', window: 'D1' })).toEqual([]);
  });
});
