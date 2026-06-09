# Scenario Mode — Update Notes (country-focus map, EM-DAT windows, deploy)

Companion to [`SCENARIO_MODE.md`](SCENARIO_MODE.md). Records the changes made while
bringing the **drought Phase 1** flow to a deployed, production state. Newest first.

---

## 1. Country-specific choropleth generation (`focusCountry`)

**Problem.** The Risk-Monitoring choropleth (`DisasterMap`) renders the full ICPAC
domain — **227 admin-1 polygons across 11 countries** — with a single projection fit
to the whole region. For a small country (Burundi, Rwanda, Djibouti) the event's
admin-1 was a tiny sliver, so the scenario's region was barely visible.

**Solution.** `DisasterMap` takes an optional `focusCountry?: string`. When set, the
d3 projection is fit to **only that country's admin-1 features**, zooming so the
country fills the frame. All polygons are still drawn, so neighbours appear as
context (clipped by the viewport).

**How the map is generated** (`app/components/dashboard/DisasterMap.tsx`):

```ts
const geojson = feature(topology, topology.objects.icpac_adm1v3);   // all 227 adm1
// country filter: GID_1 like "BDI.10_1" → prefix "BDI"
const focusFeatures = focusCountry
  ? geojson.features.filter((f) => String(f.properties.GID_1).startsWith(`${focusCountry}.`))
  : geojson.features;
const fitGeo = focusCountry && focusFeatures.length
  ? { type: 'FeatureCollection', features: focusFeatures }
  : geojson;
const projection = d3.geoMercator().fitSize([width, 420], fitGeo);  // ← zoom target
const path = d3.geoPath(projection);
// …draw ALL geojson.features with `path` (neighbours show, clipped); fill by
//   CRMA traffic-light (RM) or frequency (RK). focusCountry added to effect deps.
```

Key points:
- **Only the projection's fit target changes** — `fitSize` to the country's features
  instead of the whole domain. Geometry/colour logic is untouched.
- **All polygons still rendered**, so the focused country sits in real geographic
  context rather than on a blank canvas.
- `focusCountry` is in the render effect's dependency array, so changing scenario
  (country) re-fits the projection.

**Wiring** (`app/scenario/[eventId]/ScenarioRunner.tsx`):

```tsx
<DisasterMap focusCountry={scenario.gid_1?.split('.')[0]} />   // "BDI.10_1" → "BDI"
```

- The **dashboard** calls `<DisasterMap />` with no prop → full-domain view, unchanged.
- Works **offline**: the topology is the static bundled `/icpac_adm1v3.json` (no
  backend), so the zoom renders even before the backend supplies region colours.

---

## 2. EM-DAT-derived round windows (T-6 months → onset → peak)

**Problem.** Round cursor months were hand-picked approximations.

**Solution.** Derive each drought scenario's three rounds from the **real EM-DAT
`Start`/`End`** in `data/emdat_drought_adm1.parquet`:

```
round 1  lead    = Start − 6 months     (forecast-led early signal)
round 2  onset   = Start                (event window begins; CDI + spatial + trend)
round 3  peak    = End                  (recorded drought duration)
```

The three events with no native EM-DAT record (Burundi `2021-IBF01`, Eritrea
`2021-IBF03`, Rwanda `2016-IBF06`) use the README onset month ± 6 months.

| Event | lead → onset → peak |
|---|---|
| Burundi 2021-22 | 2020-07 → 2021-01 → 2021-07 |
| Djibouti 2022 | 2021-12 → 2022-06 → 2022-07 |
| Eritrea Highlands 2021-23 | 2020-07 → 2021-01 → 2021-07 |
| Ethiopia Blue Nile 2021-22 | 2020-11 → 2021-05 → 2022-02 |
| Kenya Tana/ASAL 2020-23 | 2020-06 → 2020-12 → 2022-12 |
| Rwanda Akagera 2016-17 | 2015-07 → 2016-01 → 2016-07 |
| Somalia South-Central 2020-23 | 2020-09 → 2021-03 → 2022-12 |
| South Sudan Upper Nile 2021-23 | 2020-12 → 2021-06 → 2022-11 |
| Sudan Eastern 2022 | 2021-12 → 2022-06 → 2022-11 |
| Tanzania Kagera 2021-22 | 2021-05 → 2021-11 → 2022-12 |
| Uganda Karamoja 2022 | 2022-01 → 2022-07 → 2022-12 |

Every cursor month is confirmed present in the deployed drought BN (continuous
**1981-01 → 2024-12**), so the RM choropleth and BN DAG load for each round.

**Caveat — name vs EM-DAT admin-1s.** For a couple of events the GHACOF event *name*
and EM-DAT's recorded admin-1s diverge (EM-DAT lists South Sudan's 2021 drought in
Equatoria / Bahr-el-Ghazal, not Upper Nile; Tanzania's in the south / Zanzibar, not
Kagera). The scenario `gid_1` is kept on the **named** region so the auto-opened BN
DAG matches the title; the country-focused choropleth shows the actual affected
pattern.

---

## 3. Evidence bound to the live BN-DAG + risk advisory

- Evidence card values now read from the real engine at the cursor — `raw`/`state`
  from `/api/drought-bn-dag/{init}` keyed by `gid_1`
  (`bn_node → cur/def/spa/trn`; `cdi_class` and `R_obs` have no DAG node → scripted).
  Cards show `[live BN]` when bound, `[scripted]` when falling back offline.
- The engine's CRMA state + posterior + `P(High+Extreme)` is surfaced as a **risk
  advisory** (the cost-loss decision), separate from the participant's decision.

## 4. Debrief = Risk Knowledge; hazard removed from the flow

- The debrief opens the **RK EM-DAT loss & damage storyline** via the exact deep link
  from `pam_team/DevOps-hazard-modeling/README.md` (reconstructed from
  `hazard + debrief.rk_month + emdat_event_key`).
- `layers.hazard` is **optional**; drought scenarios omit it → **zero external
  runtime dependency**. (Hazard footprint survives only as a collapsed provenance
  block for flood cases.)

## 5. Deployment (Cloud Run, frontend only)

- `cd cno-e4drr/devops/crma-fe-cr && cp _build_fe.env.example _build_fe.env && bash _build_fe.sh`
- `_build_fe.sh` rsyncs the `arco-ibf` working tree → Cloud Build → `crma-frontend`
  Cloud Run, with `_API_URL` wired to the deployed `crma-api`. **No API rebuild.**
- Cloud Build `4419b850-0245-42db-8b1b-55e820f18932` → **SUCCESS** (4m23s).
- Live: **https://crma-frontend-yiyrp6yumq-uc.a.run.app/scenario**
- On Cloud Run the frontend gets a metadata identity token and reaches the private
  `crma-api` natively — so the local "Could not load drought BN DAG" error (no local
  backend) does not occur; the choropleth, BN DAG, and `[live BN]` evidence populate.
- Roll back: `gcloud run services update-traffic crma-frontend --to-revisions=<prev>=100`.

---

## Files touched (this update batch)

| File | Change |
|---|---|
| `app/components/dashboard/DisasterMap.tsx` | `focusCountry` prop → projection fit to one country; fix latent optional-`selectedMonth` type |
| `app/scenario/[eventId]/ScenarioRunner.tsx` | pass `focusCountry`; debrief = RK link; live BN binding + advisory; hazard → optional debrief block |
| `app/types/scenario.ts` | `layers.hazard` optional; `debrief.rk_month`; `scoring` deprecated |
| `app/content/scenarios/*.json` | 11 drought scenarios (EM-DAT-derived windows, no hazard layer, `rk_month`) + Nairobi flood |
| `app/lib/scenario/registry.ts` | register all 12 |
