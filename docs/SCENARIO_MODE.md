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
- **Three-act flow** (design: `cmra/quiz/quiz_reorient_three_Acts.md` + refinements):
  **Act I** (*what is happening?*) = situational awareness + a generic
  **evidence-elicitation quiz** — the same 9 questions for every event
  (`app/lib/scenario/quiz.ts`; hazard-specific option wording only, zero per-event
  authoring): strongest evidence → hard/soft/virtual classification → reliability →
  hazard condition → impact pathway → next evidence request → **pre-BN risk estimate
  (Q7) + DOC status (Q8)** → a "model trust" seed question. The BN DAG panels and
  risk advisory are **hidden in Act I** so Q7/Q8 are committed before any model
  output is seen; completing the quiz produces the evidence-inventory transition
  and unlocks **Act II** (*what do we think is happening?* — the live BN rounds).
  **Act III** (*what should we do and why?*) = decision + debrief, opening with a
  **your-estimate vs engine-indication comparison** (Q7/Q8 vs `risk.state` /
  `crma.state` at the final cursor) and the model-criticism reflection. Quiz answers
  persist per event in `localStorage` (`scenario:<id>:act1`). Formative, not scored.
- **Decision capture**: DOC ladder (Monitor → Watch → Warning → Emergency
  Coordination) mapped 1:1 to the engine's CRMA states, a **required uncertainty
  note**, and an optional **no-regret action** flag. Saved to `localStorage`.
  Assessment is **formative** — reasoning capture + debrief comparison. There is
  **no competitive scoring or leaderboard** (dropped; see §6). Round `quiz` ids are
  shown as non-scored "Consider:" reflection prompts.
- **Debrief = Risk Knowledge**: the primary debrief is the **RK EM-DAT loss &
  damage storyline** (`stage=risk-knowledge&event=<DisNo>`) — "work backward from
  the recorded loss." Plus the peak and counterfactual. Hazard footprint is now an
  **optional, collapsed `<details>` provenance block** rendered only when a scenario
  carries `layers.hazard` (flood cases); the **drought flow has no hazard layer**.
  All kept hidden until the debrief reveal (`hindsight: off`).

### Hazard flow & scenario set

Both hazards are built **purely on the deployed CRMA app** — no external assets,
**zero runtime dependency** beyond `crma-api`:

- **Risk Monitoring (RM)** drives the rounds — live BN replay: **drought by `init`
  month** (`/api/ibf-drought-{calendar,regions}`, `/api/drought-bn-dag/{init}`),
  **flood by `date`** (`/api/ibf-flood-{calendar,regions}`, `/api/bn-dag/{date}`):
  choropleth + per-boundary BN DAG = the evolving evidence/risk the participant reads.
- **Risk Knowledge (RK)** drives the debrief — the EM-DAT storyline
  (`/api/emdat-event-markdown/{DisNo}`).
- **Risk Decisions** hosts the launcher → `/scenario`.

`layers.hazard` is **optional** in the schema; scenarios omit it.

**23 scenarios — 11 drought (monthly) + 12 flood (daily).** The `/scenario` index
has a **hazard filter** (Flood / Drought / All), **flood default**, so 22+ events
don't clutter the list (`ScenarioBrowser`, client component; `page.tsx` feeds it a
slim list and it filters by `hazard`).

| Hazard | Phase | Count | Rounds | Example |
|---|---|---|---|---|
| Drought | 1 | 11 | **monthly** init, T-6mo lead → onset → peak (from EM-DAT Start/End) | `kenya_asal_drought_2020` `KEN.40_1`, init 2020-06→2022-12 |
| Flood | 2 | 12 | **daily**, lead → escalation → onset (per event's flood BN window) | `kenya_nairobi_flood_2024` `KEN.30_1`, 2024-04-09/17/23 |

Flood = all 11 GHACOF events (2019–2024) + `nairobi_flood_2026`. Some events share
a BN window — **Eritrea & Sudan** share Aug-2019, **Burundi/Kenya/Tanzania** share
Apr-2024 — each scenario focuses its own country via `gid_1`.

> **Admin-1 anchor caveat**: `gid_1` is a single representative admin-1 (drives the
> DAG panel + the choropleth zoom); events span more admin-1s, and some GHACOF event
> names diverge from EM-DAT's recorded admin-1s (kept on the named region). Lookups
> from `public/icpac_adm1v3.json` (TopoJSON, `GID_1`/`NAME_1`).

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
- **Flood replay coverage** — the flood BN now covers all 11 GHACOF event windows
  (2019–2024, e.g. May/Aug/Oct/Nov 2019, May 2021, Apr/Sep 2023, Apr 2024) + Nairobi
  2026; flood scenarios are built against them. New/other flood dates need a
  `flood_data_prep` → Julia BN run. The flood RM **dashboard** calendar starts at
  2019 (`getCalendarConfig`), matching the storyline years.

---

## 7. Roadmap (product phases)

Framing: **forecast + observations + context → CRMA → decision**; hazard/impact
modelling is supporting science, added later as its own phases.

| Phase | Scope | Status |
|---|---|---|
| **1 — Drought** | all 11 drought events on the deployed CRMA app (RM rounds → RK debrief; **no hazard/impact**) | **done** — 11/11; engine + live BN-DAG binding + advisory |
| **2 — Flood** | all 11 GHACOF flood events + Nairobi 2026 (daily RM rounds → RK debrief) | **done** — 12 flood scenarios on the 2019+ flood BN windows; hazard toggle (flood default) |
| **3 — Drought + hazard/impact** | add wflow WRSI + CLIMADA to the drought events | later |
| **4 — Flood + hazard/impact** | add RIM2D + CLIMADA to the flood events | later |

Within Phase 1, live BN-DAG evidence binding + the risk advisory are done; a
satellite-rainfall debrief animation (IMERG/CHIRPS/CMORPH) is optional polish.
Each event's **RK debrief link** is the deep link in
`pam_team/DevOps-hazard-modeling/README.md` (the runner reproduces it from
`hazard` + `debrief.rk_month` + `emdat_event_key`).
