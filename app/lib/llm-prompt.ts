/**
 * The AI-assistant prompt for one admin-1 unit, one initialisation and one lead.
 *
 * It is the CANONICAL "explanatory prompt" from icpac-igad/cno-e4drr
 * `devops/crma-api-cr/CRMA_LLM_ACCESS.md` (copied verbatim at commit e72f0d2),
 * prefilled: only the coordinates inside its five API links change — the date
 * (initialisation), the admin-1 GID_1 (`boundary=`) and the lead window. The
 * prose is never rewritten here, so updating the prompt means re-copying the
 * block from that file (and the drift test in llm-prompt.test.ts says when
 * the payload no longer matches what the prose claims).
 */

/** Public front-end proxy: anonymous agents can read it (the private API host
 *  answers 403). Not window.location.origin — in development that is localhost,
 *  which no hosted assistant can reach. */
export const CRMA_PUBLIC_BASE = 'https://crma-frontend-yiyrp6yumq-uc.a.run.app';

/** Where the canonical text was copied from, for the dialog's footnote. */
export const CANONICAL_SOURCE =
  'icpac-igad/cno-e4drr · devops/crma-api-cr/CRMA_LLM_ACCESS.md · "The explanatory prompt" @ e72f0d2';

/** The coordinates the canonical block is written with. */
export const CANONICAL_EXAMPLE = { init: '2026-11-12', boundary: 'KEN.30_1', window: 'D8-10' };

/** Verbatim canonical block (example coordinates). Do not edit by hand. */
export const CANONICAL_PROMPT = `You are explaining one CRMA flood-risk assessment so a reader can follow the
reasoning. You are not forecasting: every number is already computed, and
nothing here supports an impact estimate.

Fetch these five:

https://crma-frontend-yiyrp6yumq-uc.a.run.app/api/crma-mr-evidence/2026-11-12?boundary=KEN.30_1
https://crma-frontend-yiyrp6yumq-uc.a.run.app/api/crma-mr-dag/2026-11-12?boundary=KEN.30_1
https://crma-frontend-yiyrp6yumq-uc.a.run.app/api/crma-mr-regions/2026-11-12/D8-10?boundary=KEN.30_1
https://crma-frontend-yiyrp6yumq-uc.a.run.app/api/crma-mr-synoptic/2026-11-12
https://crma-frontend-yiyrp6yumq-uc.a.run.app/api/crma-mr-brief/2026-11-12

The FIRST is the evidence graph and it is the one to reason from. It carries the
network's nodes, the fitted strength of every edge, the ordered path that moved
this basin's belief, and the sha256 of every table the parameters came from.
Read schema.nodes and schema.edges out of the payload — do not assume the
topology; it has changed three times and it travels with the data for that
reason.

**Every edge carries a \`verified\` field, and you must read it before describing
any link.** The kinds are not decoration:

- \`noisy_or\` (five evidence nodes -> heavy_rain) and \`measurement\`
  (precipitation -> heavy_rain) are FITTED and counted against observed IMERG.
- \`elicited\` (heavy_rain -> risk, antecedent -> risk, tail -> risk) is EXPERT
  JUDGEMENT and has NEVER been scored. Say so whenever you use it.
- \`proposed\` (fluvial -> risk) is NOT COMPUTED at all: the node is reported and
  carries \`combined: false\`. It does not move risk_level or p_high_extreme, and
  presenting it as a contribution is wrong.
- \`derived\` (risk -> confidence) is arithmetic on the posterior, not a fitted
  link and not evidence. Do not describe it as something the model learned.

There are five kinds and eleven edges; count them in the payload rather than
trusting this list.

\`schema.skill\` carries out-of-sample AUC, but read its own \`source\` line before
quoting it: it covers only the windows it names — **not every window** — and it
predates the in-season level correction that the \`noisy_or\` edges' \`verified\`
strings say has been applied since 2026-10-11. So it describes the
discrimination of the fitted links, not the calibration of the numbers in front
of you. Say which you mean.

Each path step gives \`p_link_moderate_at_state\` AND \`p_link_heavy_at_state\`.
There is no single \`p_link\`: the per-node \`db\` and \`share\` are computed against
the >= 2 mm/day ("moderate") noisy-OR, not the >= 8 mm/day heavy band, so quote
whichever you name and say which.

The second is the same network's node values in the dashboard's shape; use it
only to cross-check — the shared fields are equal by construction.

How the network is built, which governs how you may describe it:

- Five evidence nodes (moisture, transport, disturbance, vertical, convective)
  combine by noisy-OR into a latent heavy_rain. Their contributions are
  decibels and they ADD, so \`share\` is the attribution: a node at share 0.62
  moved most of the belief and one at 0.00 moved none, whatever band it sits in.
- precipitation is the model's own rainfall entering as a MEASUREMENT of that
  latent, discounted by alpha, fitted per season and window — read it from
  schema.edges (precipitation -> heavy_rain).params[<window>].alpha in the
  evidence payload; do not assume a value. It is discounted because it comes
  from the same forecast as the evidence, and it is not a parent.
- antecedent is observed IMERG — the only input in the graph that is not this
  forecast, and the synoptic brief says so explicitly.
- satellite (v4.7 onward) is observed too: NOAA GMGSI brightness and EUMETSAT
  MTG-0 cloud-motion winds from the 24 h BEFORE the init. Per evidence node it
  gives a tercile (low / normal / high) of that region's OWN record, the D1
  forecast state beside it, and an \`agreement\` of corroborates / partial /
  contradicts, summarised as a \`verdict\`. Four things govern how you may use it:
  * **\`corroborates\` is not an inference edge.** Nothing flows into the belief
    along it. The node carries \`combined: false\`; it changes neither
    \`risk_level\` nor \`p_high_extreme\`, and the posterior is identical with and
    without it. Report it as an observation standing beside the forecast.
  * **It is not a verification of the forecast.** The observed quantities are
    not the forecast's — brightness and cloud motion, not column water or
    850-hPa flow — so agreement corroborates an *ingredient*, it does not
    confirm a number.
  * **The measured gain is small and not significant.** On 45 inits x 55 basins
    against IMERG at D1, adding the observed states lowered the Brier score
    1.6 % (>= 2 mm) and 1.8 % (>= 8 mm), with 83-89 % of resamples over inits
    better — **not significant at 95 %**. Never present it as improving skill.
  * **\`satellite\` is null before 2026-10-01**, which is most of the corpus. Key
    off the payload being present, not off the node appearing in the schema. A
    \`verdict\` of "disagrees" is a real reading; a missing payload is not.
  Coverage limits worth stating: AMV winds are absent east of about 67E and
  sparse over land.
- exposure and susceptibility are ordinal context and never multiply the
  hazard. With the cost-loss layer gone they no longer reach any decision at
  all: report them as the standing vulnerability of the place, not as something
  that moved this forecast.
- There is NO decision layer and no threshold. \`crma_state\`, \`traffic_light\`,
  \`cost_loss_*\` and \`action_probs\` were removed upstream: a rung called
  "actionable" is a piece of a decision and CRMA holds no policy number. What
  exists is belief — \`risk_level\` (Minimal/Low/Moderate/High/Extreme, the mode
  of a five-state posterior) and \`p_high_extreme\` (P(High)+P(Extreme)). Do not
  reintroduce a ladder, a traffic light or a trigger.
- \`confidence\` is \`1 - H/H_max\` — **sharpness, not skill**. A sharp posterior
  can be confidently wrong. Quote its percentile \`rank\` within the
  initialisation rather than the raw value, which reads uniformly low.

Write four short sections:

1. Synoptic — what the atmosphere was doing, from the synoptic brief, and
   whether the evidence shares at this lead agree with that story.
2. Evidence chain — which nodes carried the belief and by how much, in decibels
   and share; what the antecedent contributed; what the measurement added.
3. The belief — \`risk_level\` and \`p_high_extreme\`, and the confidence RANK
   within this initialisation (not the raw value). There is no decision to
   report: say what the network believes, not what anyone should do.
4. What this cannot say — at minimum: the unit inherits from a basin and covers
   top_basin_unit_share of it; the three \`elicited\` edges into risk are
   unscored judgement while only the rain half is fitted and counted;
   \`fluvial\` is reported but not combined; bands are percentile ranks of these
   55 basins, not absolutes; and sharpness is not skill.

To ask about a different place, date or lead, change the three coordinates:
boundary= (a GID_1 like KEN.30_1, or an admin-1 name), the date (YYYY-MM-DD, an
initialisation from 2024-03-06 onward — ask /api/crma-mr-calendar?window=D1
which dates exist rather than guessing), and the window (D1, D2-3, D4-5, D6-7,
D8-10). A date the feed does not hold answers 404.`;

export interface PromptTarget {
  /** Initialisation, YYYY-MM-DD. */
  init: string;
  /** Lead window: D1, D2-3, D4-5, D6-7 or D8-10. */
  window: string;
  /** Admin-1 GID_1 (e.g. KEN.18_1). */
  boundary: string;
  /** Display name of the admin-1 unit (dialog header only, not the prompt). */
  placeName?: string | null;
}

export interface PromptUrl {
  label: string;
  url: string;
}

/** The five links, in the canonical order, for this unit / date / lead. Always
 *  the filtered `?boundary=` forms (the bare bodies are ~0.4–1 MB and agent
 *  fetchers truncate them); synoptic and brief are unfiltered and small. */
export function promptUrls(t: PromptTarget, base: string = CRMA_PUBLIC_BASE): PromptUrl[] {
  const init = encodeURIComponent(t.init);
  const win = encodeURIComponent(t.window);
  const q = `?boundary=${encodeURIComponent(t.boundary)}`;
  return [
    { label: 'Evidence graph (reason from this)', url: `${base}/api/crma-mr-evidence/${init}${q}` },
    { label: 'Network node values (cross-check)', url: `${base}/api/crma-mr-dag/${init}${q}` },
    { label: 'Map row for this unit and lead', url: `${base}/api/crma-mr-regions/${init}/${win}${q}` },
    { label: 'Synoptic brief', url: `${base}/api/crma-mr-synoptic/${init}` },
    { label: 'Assessment brief', url: `${base}/api/crma-mr-brief/${init}` },
  ];
}

/** The canonical prompt with its five link lines replaced, in order, by this
 *  unit's links. Every other character is the canonical text. */
export function buildLlmPrompt(t: PromptTarget): string {
  const urls = promptUrls(t).map((u) => u.url);
  let n = 0;
  return CANONICAL_PROMPT.split('\n')
    .map((line) => (line.startsWith(`${CRMA_PUBLIC_BASE}/api/`) ? urls[n++] ?? line : line))
    .join('\n');
}
