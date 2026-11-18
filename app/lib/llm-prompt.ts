/**
 * The "explanatory prompt" for an AI assistant, filled in for one place, one
 * initialisation and one lead window.
 *
 * The canonical text lives in another repo:
 * `icpac-igad/cno-e4drr` → `devops/crma-api-cr/CRMA_LLM_ACCESS.md`, section
 * "The explanatory prompt". This is a copy, and copies of that file have drifted
 * before (it once described `crma_state` as a cost–loss ladder after the field
 * was deleted, and asserted an alpha the payload contradicted). So:
 *
 *   - every count and every list of nodes/edges is READ FROM THE SCHEMA the
 *     panel already holds, never written here;
 *   - no fitted parameter (alpha, AUC, leak) is quoted — the prompt tells the
 *     agent where in the payload to read it;
 *   - what must stay literal (the meaning of each edge kind) is guarded by
 *     `llm-prompt.test.ts` against a fixture captured from the real payload.
 *
 * If the canonical doc changes, update this and re-capture the fixtures.
 *
 * Pure: no React, no fetch, relative type imports only (vitest has no path
 * aliases configured).
 */
import { CRMA_MR_WINDOWS } from '../types/crma-mr';
import type { CrmaMrEdgeSpec, CrmaMrNodeSpec } from '../types/crma-mr';

/**
 * The public, credential-free base. From CRMA_LLM_ACCESS.md → "Endpoints":
 * "Prefix everything with https://crma-frontend-yiyrp6yumq-uc.a.run.app". The
 * frontend's /api/* routes are server-side proxies that attach the identity
 * token themselves; the private API host answers 403 to an anonymous agent.
 * Deliberately NOT window.location.origin: in development that is localhost,
 * which no hosted assistant can reach.
 */
export const CRMA_PUBLIC_BASE = 'https://crma-frontend-yiyrp6yumq-uc.a.run.app';

export interface PromptTarget {
  /** Initialisation, YYYY-MM-DD. */
  init: string;
  /** Lead window: D1, D2-3, D4-5, D6-7 or D8-10. */
  window: string;
  /** Admin-1 GID_1 (e.g. KEN.18_1). Preferred: one fetch covers the unit and its basins. */
  boundary?: string | null;
  /** Basin id, used only when there is no boundary. */
  basin?: string | null;
  /** Display name of the admin-1 unit. */
  placeName?: string | null;
  /** The basin this unit inherits from at this window. */
  topBasin?: string | null;
  /** `top_basin_unit_share` at this window (0–1). */
  share?: number | null;
}

export interface PromptUrl {
  label: string;
  url: string;
}

/**
 * The URLs the prompt carries, verbatim (several agents refuse to fetch an
 * address they assembled themselves). Always the FILTERED forms: the bare
 * evidence/DAG bodies are ~0.4–1 MB and agent fetchers truncate them.
 *
 * `crma-mr-regions` is only emitted with `?boundary=`: its `?basin=` form is
 * not filtered (it returns all units, ~120 KB). The synoptic and brief
 * endpoints have no filter and are small (< 10 KB).
 */
export function promptUrls(t: PromptTarget, base: string = CRMA_PUBLIC_BASE): PromptUrl[] {
  const init = encodeURIComponent(t.init);
  const win = encodeURIComponent(t.window);
  const q = t.boundary
    ? `?boundary=${encodeURIComponent(t.boundary)}`
    : t.basin
      ? `?basin=${encodeURIComponent(t.basin)}`
      : null;
  if (!q) return [];
  const urls: PromptUrl[] = [
    { label: 'Evidence graph (reason from this)', url: `${base}/api/crma-mr-evidence/${init}${q}` },
    { label: 'Network node values (cross-check)', url: `${base}/api/crma-mr-dag/${init}${q}` },
  ];
  if (t.boundary) {
    urls.push({
      label: 'Map row for this unit',
      url: `${base}/api/crma-mr-regions/${init}/${win}${q}`,
    });
  }
  urls.push(
    { label: 'Synoptic brief', url: `${base}/api/crma-mr-synoptic/${init}` },
    { label: 'Assessment brief', url: `${base}/api/crma-mr-brief/${init}` },
  );
  return urls;
}

/**
 * What each edge kind means. This is the one literal claim the template makes
 * about the network, so the test checks it against each edge's `verified`
 * string in the evidence fixture. A kind not listed here is still emitted,
 * with an instruction to read its `verified` field instead of a gloss.
 */
export const EDGE_KIND_GLOSS: Record<string, string> = {
  noisy_or: 'FITTED and counted against observed IMERG.',
  measurement:
    'FITTED and counted against observed IMERG, then discounted by alpha, fitted per ' +
    'season and window: read it from schema.edges (precipitation -> heavy_rain)' +
    '.params[<window>].alpha in the evidence payload; do not assume a value. It is ' +
    'discounted because it comes from the same forecast as the evidence, and it is not a parent.',
  elicited: 'EXPERT JUDGEMENT and has NEVER been scored against outcomes. Say so whenever you use it.',
  proposed:
    'NOT COMPUTED at all: the node is reported and carries `combined: false`. It does not ' +
    'move risk_level or p_high_extreme, and presenting it as a contribution is wrong.',
  derived:
    'arithmetic on the posterior, not a fitted link and not evidence. Do not describe it as ' +
    'something the model learned.',
  corroborates:
    'an observation set BESIDE a forecast node. It is NOT an inference edge: nothing flows ' +
    'into the belief along it, and it does not verify the forecast.',
};

type SchemaLike = { nodes: CrmaMrNodeSpec[]; edges: CrmaMrEdgeSpec[] };

/** Edges grouped by kind, in first-appearance order. */
export function edgesByKind(edges: CrmaMrEdgeSpec[]): [string, CrmaMrEdgeSpec[]][] {
  const m = new Map<string, CrmaMrEdgeSpec[]>();
  for (const e of edges) {
    if (!m.has(e.kind)) m.set(e.kind, []);
    m.get(e.kind)!.push(e);
  }
  return Array.from(m.entries());
}

/** "a, b -> x; c -> y" — sources grouped by target. */
function _edgeList(edges: CrmaMrEdgeSpec[]): string {
  const byTo = new Map<string, string[]>();
  for (const e of edges) {
    if (!byTo.has(e.to)) byTo.set(e.to, []);
    byTo.get(e.to)!.push(e.from);
  }
  return Array.from(byTo.entries())
    .map(([to, from]) => `${from.join(', ')} -> ${to}`)
    .join('; ');
}

const _plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * The full prompt text. Counts, node names and edge lists come from `schema`
 * (the DAG payload's `schema`, which the panel already holds); the only
 * literals are the per-kind meanings above and the reading rules from the
 * canonical doc.
 */
export function buildLlmPrompt(
  schema: SchemaLike,
  t: PromptTarget,
  base: string = CRMA_PUBLIC_BASE,
): string {
  const nodes = schema.nodes ?? [];
  const edges = schema.edges ?? [];
  const kinds = edgesByKind(edges);
  const evidence = nodes.filter((n) => n.layer === 'evidence').map((n) => n.key);
  const notCombined = nodes.filter((n) => n.combined === false).map((n) => n.key);
  const elicitedIntoRisk = edges.filter((e) => e.kind === 'elicited' && e.to === 'risk');
  const hasSatellite =
    nodes.some((n) => n.key === 'satellite') || edges.some((e) => e.kind === 'corroborates');
  const urls = promptUrls(t, base);

  const L: string[] = [];
  L.push(
    'You are explaining one CRMA flood-risk assessment so a reader can follow the',
    'reasoning. You are not forecasting: every number is already computed, and',
    'nothing here supports an impact estimate.',
    '',
  );

  // The coordinates, stated once so the agent cannot silently pick another window.
  const place = t.placeName && t.boundary ? `${t.placeName} (${t.boundary})` : t.boundary ?? t.basin ?? '';
  L.push(
    `The assessment: ${place}, initialisation ${t.init}, lead window ${t.window}.`,
    `Every value is keyed (init, window); this question is about window ${t.window} only.`,
  );
  if (t.boundary && t.topBasin) {
    const sh =
      typeof t.share === 'number'
        ? `, and the unit makes up ${(t.share * 100).toFixed(t.share < 0.1 ? 2 : 1)}% of that basin` +
          ' (top_basin_unit_share)'
        : '';
    L.push(
      `At this window the unit inherits its assessment from basin ${t.topBasin}${sh}.`,
      'Quote that share with any value you report for the unit. The top basin can',
      'differ by window: read top_basin_by_window.',
    );
  }
  L.push('');

  L.push(`Fetch these ${urls.length}:`, '');
  for (const u of urls) L.push(u.url);
  L.push('');

  L.push(
    'The FIRST is the evidence graph and it is the one to reason from. It carries the',
    "network's nodes, the fitted strength of every edge, the ordered path that moved",
    "this basin's belief, and the sha256 of every table the parameters came from.",
    'If it answers 404, the edge parameters are not yet published for this date:',
    'reason from the second and say that they were not available.',
    'Read schema.nodes and schema.edges out of the payload. Do not assume the',
    'topology; it has changed before and it travels with the data for that reason.',
    '',
    `When this prompt was made, the schema had ${_plural(nodes.length, 'node')} and ` +
      `${_plural(edges.length, 'edge')} of ${_plural(kinds.length, 'kind')}. ` +
      'Count them in the payload rather than trusting this.',
    '',
    "Every edge carries a `verified` field, and you must read it before describing",
    'any link. The kinds are not decoration:',
    '',
  );
  for (const [kind, es] of kinds) {
    const gloss =
      EDGE_KIND_GLOSS[kind] ??
      'not described in this prompt: describe it only as its `verified` string says.';
    L.push(`- \`${kind}\` (${_edgeList(es)}): ${gloss}`);
  }
  L.push('');

  L.push(
    "`schema.skill` carries out-of-sample AUC, but read its own `source` line before",
    'quoting it: it covers only the windows it names, not every window, and it may',
    'predate the in-season level correction that the `noisy_or` edges\' `verified`',
    'strings describe. So it describes the discrimination of the fitted links, not',
    'the calibration of the numbers in front of you. Say which you mean.',
    '',
    'Each path step gives `p_link_moderate_at_state` AND `p_link_heavy_at_state`.',
    'There is no single `p_link`: the per-node `db` and `share` are computed against',
    'the moderate noisy-OR (schema.notes gives the thresholds), not the heavy band,',
    'so quote whichever you name and say which.',
    '',
    "The second is the same network's node values in the dashboard's shape; use it",
    'only to cross-check. The shared fields are equal by construction.',
    '',
    'How the network is built, which governs how you may describe it:',
    '',
    `- The ${_plural(evidence.length, 'evidence node')} (${evidence.join(', ')}) combine by`,
    '  noisy-OR into a latent heavy_rain. Their contributions are decibels and they',
    '  ADD, so `share` is the attribution: a node at share 0.62 moved most of the',
    '  belief and one at 0.00 moved none, whatever band it sits in.',
    "- precipitation is the model's own rainfall entering as a MEASUREMENT of that",
    '  latent, discounted by alpha (see the `measurement` edge above).',
    '- antecedent is observed IMERG: the only input in the graph that is not this',
    '  forecast.',
  );
  if (hasSatellite) {
    L.push(
      '- satellite is observed too, from the 24 h before the init. It carries',
      '  `combined: false`: it changes neither risk_level nor p_high_extreme. Report',
      '  it as an observation standing beside the forecast, not a verification of it;',
      '  its measured gain is small and not significant, so never present it as',
      '  improving skill. It is null for early inits: key off the payload being',
      '  present, not off the node appearing in the schema.',
    );
  }
  L.push(
    '- exposure and susceptibility are ordinal context and never multiply the',
    '  hazard. Report them as the standing vulnerability of the place, not as',
    '  something that moved this forecast.',
    '- There is NO decision layer and no threshold. `crma_state`, `traffic_light`,',
    '  `cost_loss_*` and `action_probs` were removed upstream; CRMA holds no policy',
    '  number. What exists is belief: `risk_level` (Minimal/Low/Moderate/High/Extreme,',
    '  the mode of a five-state posterior) and `p_high_extreme` (P(High)+P(Extreme)).',
    '  Do not reintroduce a ladder, a traffic light or a trigger.',
    '- `confidence` is `1 - H/H_max`: sharpness, not skill. A sharp posterior can be',
    '  confidently wrong. Quote its percentile `rank` within the initialisation',
    '  rather than the raw value, which reads uniformly low.',
    '',
    'Write four short sections, in plain language a non-specialist can follow:',
    '',
    '1. Synoptic: what the atmosphere was doing, from the synoptic brief, and',
    '   whether the evidence shares at this lead agree with that story.',
    '2. Evidence chain: which nodes carried the belief and by how much, in decibels',
    '   and share; what the antecedent contributed; what the measurement added.',
    '3. The belief: `risk_level` and `p_high_extreme`, and the confidence RANK',
    '   within this initialisation (not the raw value). There is no decision to',
    '   report: say what the network believes, not what anyone should do.',
    '4. What this cannot say. At minimum:',
  );
  if (t.boundary) {
    L.push('   - the unit inherits from a basin and covers top_basin_unit_share of it;');
  }
  if (elicitedIntoRisk.length) {
    L.push(
      `   - the ${_plural(elicitedIntoRisk.length, '`elicited` edge')} into risk ` +
        `(from ${elicitedIntoRisk.map((e) => e.from).join(', ')})`,
      `     ${elicitedIntoRisk.length === 1 ? 'is' : 'are'} unscored judgement, while only the rain half is fitted`,
      '     and counted;',
    );
  }
  if (notCombined.length) {
    L.push(`   - ${notCombined.join(', ')} ${notCombined.length === 1 ? 'is' : 'are'} reported but not combined;`);
  }
  L.push(
    '   - bands are percentile ranks of the basins in this feed, not absolutes;',
    '   - sharpness is not skill;',
    '   - no impact estimate (people or assets affected) is available or implied.',
    '',
    'To ask about a different place, date or lead, change the coordinates in the',
    'URLs: boundary= (a GID_1 like KEN.30_1) or basin= (a basin id), the date',
    '(YYYY-MM-DD; ask /api/crma-mr-calendar?window=D1 which dates exist rather than',
    `guessing), and the window (${CRMA_MR_WINDOWS.join(', ')}). A date the feed does`,
    'not hold answers 404. Always keep the boundary= or basin= filter: the',
    'unfiltered responses are too large for most fetch tools.',
  );
  return L.join('\n');
}
