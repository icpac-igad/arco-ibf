# Scenario Mode (Risk Decisions) — Developer Quickstart

Interactive simulation layer for the CRMA dashboard. Participants replay a past
hydro-met event **as if it were unfolding today**, read the evidence round by
round, weigh the uncertainty, and log a defensible DOC (Disaster Operations
Centre) decision. This is the `risk-decisions` pipeline stage made interactive.

> Full design rationale (pedagogy, evidence-type theory, event selection, phasing)
> lives in the companion repo: `scenario-sim/IMPLEMENTATION_PLAN.md`. This file is
> the **developer quickstart for the code in `arco-ibf`**.

---

## 1. What is delivered (this build)

A self-contained **Scenario Mode** reachable at **`/scenario`**, plus a launcher
card in the dashboard's Risk Decisions stage.

- **Dedicated route**, not a query param — `/scenario` (index) and
  `/scenario/[eventId]` (a run). Differentiated URL, focused layout (no dashboard
  chrome), shareable for a workshop.
- **The simulation engine is data**: one JSON per event (the *scenario script*)
  under `app/content/scenarios/`. A scenario steps a **date cursor** through the
  real BN-IBF artifacts already served by `crma-api`; the existing store-driven
  panels (`DisasterMap`, `BoundaryDagPanel(Drought)`) follow the cursor
  automatically.
- **Round + checkpoint gating**: evidence unlocks per round; the DOC decision form
  only appears on checkpoint rounds.
- **Evidence typing**: every card is tagged hard / soft / virtual and mapped to a
  real BN node (`antecedent_rainfall`, `cur`, `tail_risk`, `cdi_class`, `R_obs`…).
- **Live BN-DAG binding**: evidence values are read from the real engine at the
  cursor — `raw`/`state` from `/api/{bn-dag,drought-bn-dag}` keyed by `gid_1`
  (`bn_node → ant/exc/spa/trn/tail` for flood, `cur/def/spa/trn` for drought).
  Cards show `[live BN]` when bound, `[scripted]` when falling back to the authored
  string (offline / no backend). `cdi_class` and `R_obs` have no DAG node and stay
  scripted.
- **Risk advisory**: when the backend is connected, the live CRMA state + risk
  posterior + `P(High+Extreme)` are surfaced as an advisory (the engine's cost-loss
  decision), distinct from the participant's own decision.
- **Decision capture**: DOC ladder (Monitor → Watch → Warning → Emergency
  Coordination) mapped 1:1 to the engine's CRMA states, a **required uncertainty
  note**, and an optional **no-regret action** flag. Saved to `localStorage`.
  Assessment is **formative** — reasoning capture + debrief comparison. There is
  **no competitive scoring or leaderboard** (dropped; see §6). Round `quiz` ids are
  shown as non-scored "Consider:" reflection prompts.
- **Debrief**: reveals the peak, the **hazard footprint** (RIM2D GIF / wflow WRSI,
  hotlinked from HuggingFace, badged `validation: illustrative`) as *context/
  provenance — not a decision input*, the counterfactual, and a link to the EM-DAT
  loss storyline (all kept hidden during the decision when `hindsight: off`).

### Scenario set

| Event | hazard | `gid_1` | hazard asset | BN replay |
|---|---|---|---|---|
| `nairobi_flood_2026` | flood | `KEN.30_1` (Nairobi) | RIM2D `nairobi_2026-03-06/preview.gif` | flood **daily** Mar 1–15 2026 |
| `kenya_asal_drought_2020` | drought | `KEN.40_1` (Tana River) | wflow `ken_wrsi.png` | drought **monthly** init `2020-12` |
| `uganda_karamoja_drought_2022` | drought | `UGA.40_1` (Moroto) | wflow `uga_wrsi.png` | drought **monthly** init `2022-07` |

> **Admin-1 anchor caveat**: `gid_1` is a single representative admin-1 for the
> DAG panel. Kenya ASAL spans more counties than Tana River; Karamoja spans
> Kotido / Moroto / Nakapiripirit in this GADM vintage. The scenario `brief`
> notes this. Lookups are from `public/icpac_adm1v3.json` (TopoJSON, `GID_1`/`NAME_1`).

---

## 2. Architecture

```
/scenario                         app/scenario/page.tsx            (index, server)
/scenario/[eventId]               app/scenario/[eventId]/page.tsx  (server → runner)
  └─ ScenarioRunner               app/scenario/[eventId]/ScenarioRunner.tsx (client)
       └─ <PipelineProvider syncUrl={false}>     ← reuse the store WITHOUT URL nav
            └─ ScenarioBoard
                 ├─ scenario chrome (rounds, evidence, decision, debrief)
                 └─ reused dashboard panels: DisasterMap, BoundaryDagPanel(Drought)

app/types/scenario.ts             schema as TS types
app/lib/scenario/registry.ts      bundles + indexes the scenario JSONs
app/content/scenarios/*.json      the game scripts
```

**Key mechanism — cursor drives reuse.** On each round change `ScenarioBoard`
sets the shared pipeline store: `hazard`, `stage='risk-monitoring'`,
`selectedMonth = round.cursor_date`, `selectedBoundary = gid_1`. The existing
panels read that store and render the matching BN regions / DAG — no panel code
was duplicated.

**Why `syncUrl={false}`.** `PipelineProvider`'s setters normally
`router.replace('/?...')`, which would bounce `/scenario` back to the dashboard.
The provider takes an optional `syncUrl` prop (default `true`); Scenario Mode
passes `false` so the store is pure state. This is the only change to a shared
file (`app/store/providers/pipeline.tsx`).

---

## 3. Local testing

```bash
npm install          # first time
npm run dev          # http://localhost:3000
```

Routes to check:

| URL | Expect |
|---|---|
| `/scenario` | index lists the three scenarios |
| `/scenario/nairobi_flood_2026` | runner; step rounds Mar 1 → Mar 4 → Mar 6 |
| `/scenario/uganda_karamoja_drought_2022` | drought runner; CDI virtual evidence at round 2 |
| `/scenario/does_not_exist` | 404 |
| `/?stage=risk-decisions` | dashboard shows the "Launch simulation" card |

Smoke test from a shell:

```bash
for id in nairobi_flood_2026 kenya_asal_drought_2020 uganda_karamoja_drought_2022; do
  curl -s -o /dev/null -w "%{http_code} $id\n" http://localhost:3000/scenario/$id
done
```

### What works with / without the backend

The scenario **chrome, evidence gating, decision form, hazard GIF, and debrief
render with no backend** — they read the bundled JSON + hotlinked HuggingFace
assets. The **live BN map/DAG need `crma-api`**: they fetch `/api/ibf-*` and
`/api/*bn-dag*`. Point the app at a backend via `.env`:

```
NEXT_PUBLIC_API_BASE_URL='http://localhost:8000'      # local crma-api, or…
NEXT_PUBLIC_API_BASE_URL='https://crma-api-…run.app'  # deployed (needs SA identity token)
```

Without it the panels render empty; everything else still works.

---

## 4. Add a new scenario

1. **Find the admin-1 `GID_1`** in `public/icpac_adm1v3.json` (`GID_1`↔`NAME_1`).
2. **Author the JSON** under `app/content/scenarios/<event_id>.json`. Copy the
   closest existing one. Schema = `app/types/scenario.ts`. Key fields:
   - `hazard` (`flood` daily `date`, `drought` monthly `init`)
   - `layers.risk_monitoring` endpoints + `key_field`
   - `layers.hazard.asset_url` (HuggingFace `resolve` URL) + `validation`
   - `rounds[]` — `cursor_date`, `reveal_evidence` (card ids), `checkpoint`
   - `evidence_cards[]` — `bn_node`, `evidence_type` (hard/soft/virtual),
     `value_by_date`
   - `forecastability` (`strong`/`tail`/`surprise`) → drives debrief framing
   - `peak` (hidden until debrief), `debrief.loss_markdown` (EM-DAT key)
3. **Register it** in `app/lib/scenario/registry.ts` (import + add to `SCENARIOS`).
4. **Verify**: `npx tsc --noEmit` (JSON casts through `unknown`), then probe
   `/scenario/<event_id>`.

Cursor dates must exist in the BN artifacts: flood = `bn-dag-YYYY-MM-DD.json`
(currently only Mar 1–15 2026), drought = `drought-bn-dag-YYYY-MM.json`
(1981→2026). See `CRMA_QUICKSTART.md` (repo `cno-e4drr/devops`).

---

## 5. Deploy

Frontend-only change → **frontend rebuild only**:

```bash
cd <cno-e4drr>/devops/crma-fe-cr && bash _build_fe.sh
```

No API change, no BN pipeline run, no GCS upload. (Scenario JSON + hazard
hotlinks are bundled / external.) See `CRMA_QUICKSTART.md` §"Rebuild & deploy".

---

## 6. Known TODOs / caveats

- **Styling QA** — reused dashboard panels are mounted outside their normal grid;
  they adapt via `useResizeObserver` but verify sizing in a browser
  (`TODO(styling)` in `ScenarioRunner.tsx`).
- **`hindsight` mode** is in the schema (`mode_defaults.hindsight`) but not yet a
  UI toggle; current runner keeps the outcome hidden until the debrief reveal.
- **Competitive scoring + leaderboard — dropped** (note1 realignment). For DRM
  professionals, ranking adds little. The `scoring` JSON field is deprecated/unused;
  assessment is formative (reasoning capture + debrief). `rounds[].quiz` is kept as
  non-scored reflection prompts.
- **`hindsight` mode** is in the schema but not yet a UI toggle; the runner keeps
  the outcome hidden until the debrief reveal.
- **CLIMADA impact layer** — deferred. "Impact" = recorded EM-DAT loss at debrief.
  Hazard footprint (RIM2D/WRSI) is **hazard only** and shown in the **debrief** as
  context, not as a decision input.
- **Satellite-rainfall debrief animation** (IMERG/CHIRPS/CMORPH) — *not built*.
  The current `preview.gif` is a RIM2D **inundation** animation (a model output),
  not a raw-rainfall animation; the latter is new asset work.
- **Forecast basis** — flood evidence is **ECMWF/IFS** only; **GEFS is not wired**
  (it is the retired `forecast_agreement` node). Drought is **SEAS5/SEAS51**. So
  "surface more forecast evidence" is mostly exposing existing BN values, not new
  modelling.
- **Licensing** — RIM2D is CC-BY-4.0; **wflow WRSI is CC-BY-NC-4.0** (fine for a
  training/workshop tool; matters only if the app is commercialised).
- **Flood replay coverage** — only `nairobi_flood_2026` has daily BN artifacts.
  Other flood events need a `flood_data_prep` → Julia BN run first (verify ECMWF
  reforecast availability for pre-2026 dates).

---

## 7. Roadmap (note1 realignment — evidence/CRMA-centric)

Reframed from the original hazard→impact→decision narrative to
**forecast + observations + context → CRMA → decision**. Hazard/impact modelling
is supporting science for building storylines, not part of the participant flow.

| Phase | Scope | Status |
|---|---|---|
| **1** | Scenario script + CRMA evidence cards + DOC decision + debrief | **done** |
| **2** | Live BN-DAG value binding + risk advisory (`crma_explanation`) | **done (this build)** |
| **3** | Satellite-rainfall debrief animation (IMERG/CHIRPS/CMORPH) | new asset work |
| **4** | Debrief linking evidence → decision → loss & damage (server session optional) | next |
| **5** | Hazard/impact (RIM2D/wflow/CLIMADA) as illustrative background only | optional |
