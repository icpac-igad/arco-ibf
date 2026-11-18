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
  CANONICAL_EXAMPLE, CANONICAL_PROMPT, CRMA_PUBLIC_BASE, buildLlmPrompt, promptUrls,
} from './llm-prompt';

/** Edges grouped by kind, in first-seen order. */
const edgesByKind = (edges: { kind: string }[]) => {
  const m = new Map<string, { kind: string }[]>();
  edges.forEach((e) => m.set(e.kind, [...(m.get(e.kind) ?? []), e]));
  return Array.from(m.entries());
};

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
const target = { init: dag.init, window: WIN, boundary: BOUNDARY, placeName: dag.admin1[BOUNDARY].name };
const prompt = buildLlmPrompt(target);
const URL_LINE = (l: string) => l.startsWith(`${CRMA_PUBLIC_BASE}/api/`);

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

  it('the canonical text names every edge kind the payload has, and says five kinds and eleven edges', () => {
    for (const [kind] of edgesByKind(dag.schema.edges)) expect(CANONICAL_PROMPT).toContain(`\`${kind}\``);
    expect(CANONICAL_PROMPT).toContain('There are five kinds and eleven edges');
    expect(edgesByKind(dag.schema.edges)).toHaveLength(5);
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

describe('buildLlmPrompt: the canonical prompt, prefilled', () => {
  it('the canonical block carries exactly five links, at its example coordinates', () => {
    const urls = CANONICAL_PROMPT.split('\n').filter(URL_LINE);
    expect(urls).toHaveLength(5);
    const ex = promptUrls(CANONICAL_EXAMPLE).map((u) => u.url);
    expect(urls).toEqual(ex);
  });

  it('changes only the five link lines; every other line is the canonical text', () => {
    const a = CANONICAL_PROMPT.split('\n');
    const b = prompt.split('\n');
    expect(b).toHaveLength(a.length);
    a.forEach((line, i) => {
      if (URL_LINE(line)) expect(URL_LINE(b[i])).toBe(true);
      else expect(b[i]).toBe(line);
    });
  });

  it('fills in this date, admin-1 and lead', () => {
    const urls = prompt.split('\n').filter(URL_LINE);
    expect(urls).toEqual(promptUrls(target).map((u) => u.url));
    expect(urls.every((u) => u.includes(`/${dag.init}`))).toBe(true);
    expect(urls.filter((u) => u.includes(CANONICAL_EXAMPLE.init))).toHaveLength(dag.init === CANONICAL_EXAMPLE.init ? 5 : 0);
    expect(urls[2]).toContain(`/crma-mr-regions/${dag.init}/${WIN}?boundary=${BOUNDARY}`);
  });

  it('emits only filtered, public, credential-free URLs', () => {
    const u = promptUrls(target).map((x) => x.url);
    for (const x of u) {
      expect(x.startsWith(`${CRMA_PUBLIC_BASE}/api/`)).toBe(true);
      expect(x).not.toMatch(/localhost|crma-api-|token|key=/i);
      if (/crma-mr-(evidence|dag|regions)\//.test(x)) expect(x).toContain(`?boundary=${BOUNDARY}`);
    }
  });
});
