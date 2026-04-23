# BN-IBF → CRMA Web Application Integration Plan

**Date**: 2026-04-23  
**Branch**: `cmra-web` (arco-ibf), `jua-bnet` (bn-ibf/flood_ibf)  
**Status**: Phase 1 implemented and ready for local testing

---

## Background

The `flood_ibf` pipeline (`bn-ibf/flood_ibf/`) produces daily Admin-1 flood risk
assessments for the ICPAC domain (227 boundaries) using a Bayesian Network with
soft evidence, dynamic temporal coupling (DBN, α = 0.6), and per-member storyline
selection. For March 1–10 2026 the pipeline successfully flagged the Nairobi River
flash-flood event with a 2-day lead time.

The CRMA web application (`arco-ibf/`) has four pipeline stages. The IBF stage
(`?stage=risk-decisions`) was structurally present but had two gaps:
- The **choropleth map** was always blank for non-RK stages (the map component only
  reads `selectedEventKey`, which is never set for RM/RD stages).
- **MDX content** for flood IBF (`fl-rd-*.mdx`) did not exist.

This document records the integration work and forward plan.

---

## Gap Analysis (current state before this work)

| Layer | `risk-knowledge` | `risk-monitoring` | `risk-decisions` |
|-------|-----------------|------------------|-----------------|
| Calendar | EM-DAT parquet → colored cells | Synthetic flat (level=1) | Synthetic flat, daily mode |
| Choropleth map | `selectedEventKey` → EMDAT regions | **Always blank** | **Always blank** |
| MDX panel | `fl-rk-YYYY-MM.mdx` from GCS | `fl-rm-YYYY-MM.mdx` from GCS | `fl-rd-YYYY-MM-DD.mdx` (none existed) |

Root cause for blank maps: `DisasterMap.tsx` reads only `selectedEventKey` (line 16).
For RM/RD stages the calendar calls `setSelectedEventKey(null)` unconditionally, so
the map never fetches.

---

## Changes implemented in this commit

### 1. `app/components/mdx/event-components.tsx` — `BNDag` component

A custom pure-SVG React component that renders the flood BN DAG structure from a
JSON string prop. **No external library is used** — it is written entirely in React
JSX with native SVG elements (`<rect>`, `<text>`, `<line>`, `<g>`).

Usage in any MDX file:
```mdx
<BNDag dataJson='{"boundary":"Nairobi","date":"2026-03-04",
  "ant":{"state":"Very_Wet","probs":[0,0,0.009,0.941,0.05],"raw":"83.6 mm/7d"},
  "exc":{"state":"Very_Low","probs":[1,0,0,0,0],"raw":"P=0.010"},
  "spa":{"state":"Moderate","probs":[0,0.977,0.023],"raw":"50% hotspot"},
  "trn":{"state":"Decreasing","probs":[0.655,0.345,0],"raw":"-2.4 mm/d"},
  "tail":{"state":"Moderate","probs":[0,0.232,0.769,0],"raw":"1.11× RP"},
  "risk":{"probs":[0.094,0.351,0.455,0.087,0.013],"state":"Moderate"},
  "crma":{"state":"Assess","p_he":0.100}}' />
```

**SVG layout** (900 × 476 viewBox, dark theme):
```
[ANT 5-bar] [EXC 5-bar] [SPA 3-bar] [TRN 3-bar] [TAIL 4-bar]
      ↘          ↓           ↓           ↓         ↙
                    [RISK LEVEL — 5-bar posterior]
                                ↓
                         [CRMA badge]
```

Each parent node shows: abbreviated name, raw value, current state pill, and a
mini probability bar chart with the argmax bar highlighted in blue. The risk node
shows the full 5-state posterior with per-color bars (grey → blue → green → amber →
red). The CRMA badge uses the traffic-light color (green/yellow/orange/red).

The `dataJson` prop is a JSON string (not an inline object) for reliable
`next-mdx-remote` v6 serialization — string props pass through the compile step
without issue, whereas complex inline object props can fail in edge cases.

### 2. `app/components/dashboard/MarkdownPanel.tsx`

`BNDag` imported and added to `mdxComponents`. Two lines added.

### 3. `app/app.py` — three new local dev endpoints

Mirrors the production crma-api GCS endpoints so local development works without
GCS access or Cloud Run auth:

| Endpoint | Serves from |
|----------|-------------|
| `GET /api/mdx/manifest` | MD5-scans `app/content/events/**/*.mdx` |
| `GET /api/mdx/raw/{tab}/{filename}` | `app/content/events/{tab}/{filename}` |
| `GET /api/mdx/media/{path}` | `public/bn-ibf/{path}` |

### 4. `app/content/events/rm/fl-rm-2026-03.mdx` — test MDX

Proof-of-concept MDX using real Nairobi March 4 data (extracted from
`bn_inputs/flood_inputs_2026-03-04_soft.csv` and
`output/dbn/flood_bn_v1_2026-03-04.csv`). Contains:
- `<CountryHeader>` + `<Hero>` + `<StatGrid>` blocks (existing components)
- One `<BNDag>` block with validated JSON (all probability vectors sum to 1.0)
- 10-day Nairobi CRMA table
- CPT structure and expert rules summary

---

## Local test procedure

```bash
cd arco-ibf
yarn install          # first time only
./start_dev_servers.sh
```

Open: `http://localhost:3000/?hazard=flood&stage=risk-monitoring&month=2026-03`

The MDX panel should render the BNDag SVG showing Nairobi March 4:
antecedent Very_Wet (tail Moderate, 1.11× RP), risk Moderate, CRMA **Assess** (orange).

---

## Forward plan

### Phase 2 — Parquet + choropleth map (Options B + C)

**Script**: `flood_ibf/generate_bn_parquet.py`  
Reads all 10 `output/dbn/flood_bn_v1_2026-03-{DD}.csv` files and writes two parquets:

1. `arco-ibf/data/flood_bn_ibf_daily.parquet` — one row per day:
   `year, month, day, event_key, level (1–5), n_monitor, n_evaluate, n_assess, n_actionable`

2. `arco-ibf/data/flood_bn_ibf_boundary_daily.parquet` — one row per boundary × day:
   `event_key, boundary_id, risk_level_int, crma_state, traffic_light, p_high_extreme, risk_minimal..risk_extreme`

**API**: add to `app.py`:
- `GET /api/ibf-flood-calendar?hazard=flood` — replaces synthetic calendar for `risk-decisions`
- `GET /api/ibf-flood-regions/{date}` — returns `{shapeID, frequency=risk_level_int, ...}`

**Frontend**: `DisasterMap.tsx` — when `stage === 'risk-decisions' && hazard === 'flood'`,
fetch from `ibf-flood-regions/{selectedMonth}` instead of `emdat-month-regions/{selectedEventKey}`.

### Phase 3 — Full 10-day MDX generation (Option D + E)

**Script**: `flood_ibf/generate_flood_ibf_mdx.py`  
For each date March 1–10, reads the soft input CSV and DBN output CSV, picks the
top-3 boundaries by `p_high_extreme`, and emits a `fl-rd-2026-03-{DD}.mdx` with:
- `<BNDag>` blocks for each top boundary
- Per-day risk map PNG reference (from `output/maps/`)
- Evidence input table (top-20 boundaries)
- CRMA state distribution table
- Nairobi call-out on March 4, 6, 7

Media assets (PNG maps, BN DAG images) go to `public/bn-ibf/fl-rd-2026-03-{DD}/`
for local dev, and `gs://crma-mdx-store/media/rd/fl-rd-2026-03-{DD}/` for production.

### Phase 4 — Map fix (DisasterMap blank for RM/RD)

`DisasterMap.tsx` currently reads `selectedEventKey` only. Fix: when
`stage !== 'risk-knowledge'`, derive the fetch key from `selectedMonth` and route to
the IBF boundary endpoint. One `useEffect` branch change.

### Phase 5 — Production upload

```bash
python arco-ibf/upload_to_gcs.py --mdx-only    # MDX + manifest
python arco-ibf/upload_to_gcs.py --parquet-only # parquet files
python arco-ibf/upload_to_gcs.py --media-only   # PNG assets
```

No Cloud Run redeployment needed — content is fetched at runtime from GCS.

---

## Data flow summary

```
flood_ibf/
  bn_inputs/flood_inputs_2026-03-{DD}_soft.csv   ← soft-bin evidence
  output/dbn/flood_bn_v1_2026-03-{DD}.csv        ← BN risk posterior + CRMA
         │
         ├── generate_bn_parquet.py
         │     → data/flood_bn_ibf_daily.parquet
         │     → data/flood_bn_ibf_boundary_daily.parquet
         │
         └── generate_flood_ibf_mdx.py
               → app/content/events/rd/fl-rd-2026-03-{DD}.mdx
                    contains <BNDag dataJson='...' />
                    references media/rd/fl-rd-2026-03-{DD}/*.png

arco-ibf/
  app.py        ← /api/ibf-flood-regions/{date}, /api/mdx/raw/...
  DisasterMap   ← choropleth colored by risk_level_int (1–5)
  MarkdownPanel ← renders BNDag SVG from JSON embedded in MDX
```
