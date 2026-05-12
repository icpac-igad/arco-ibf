# CRMA — Continuous Risk Monitoring & Assessment

An interactive early warning web application for flood and drought hazards across
East Africa, built with Next.js and D3.js. Three composable UI layers — a **D3
calendar heatmap**, a **choropleth map**, and an **MDX content renderer** — are
repeated across three pipeline stages (Risk Knowledge → Risk Monitoring → Risk
Decisions) guiding users from historical disaster records through ongoing
monitoring to impact-based forecasting.

**Deployed at**:
- Frontend: `https://crma-frontend-HASH-uc.a.run.app` (public Cloud Run)
- API: `https://crma-api-462481537368.us-central1.run.app` (private Cloud Run)
- Content bucket: `gs://crma-mdx-store`
- Deployment configs: `cno-e4drr/devops/crma-api-cr/` and `cno-e4drr/devops/crma-fe-cr/`

---

## Application Structure

The app is driven by URL parameters always reflected in the address bar:

```
?hazard=drought|flood
&  stage=risk-knowledge | risk-monitoring | risk-decisions
&  (month=YYYY-MM   for monthly calendars)
   (date=YYYY-MM-DD for daily calendars)
```

Every calendar cell and map region generates a deep-linkable URL so any view can be
shared, bookmarked, or embedded. Which date param applies depends on the stage's
calendar mode — see the per-stage table below.

---

## Pipeline Stages

The dashboard exposes **three pipeline stages**, navigated via the `PipelineChips`
row (`app/components/dashboard/PipelineChips.tsx`). Stage IDs are the source of
truth: `PipelineStage = 'risk-knowledge' | 'risk-monitoring' | 'risk-decisions'`
(`app/types/pipeline.ts:3`). Each stage uses the same three UI layers — calendar
heatmap, choropleth map, MDX content — wired to different data sources and date
ranges.

### Risk Knowledge (`?stage=risk-knowledge`)

**Disaster events & storylines** — historical EM-DAT records plus curated narratives.
Folds together what older docs called the "events" and "storylines" pages.

- **Calendar**: monthly, 1990–2025 (both hazards) — uses `?month=YYYY-MM`
- **MDX source**: `gs://crma-mdx-store/rk/{dr|fl}-rk-YYYY-MM.mdx`

| Layer | Component | Description |
|-------|-----------|-------------|
| Calendar | `DisasterCalendar` | D3 heatmap — year × month grid, color-scaled by event count |
| Map | `DisasterMap` | Admin1 choropleth — frequency of affected regions for the selected month |
| Content | `MarkdownPanel` / MDX | EM-DAT-generated markdown for the picked event + curated MDX storylines from `rk/` |

### Risk Monitoring (`?stage=risk-monitoring`)

**Forecasts, thresholds & observations** — ongoing monitoring over the longest record
available per hazard. Subsumes the older "CRMA 400-month" view.

- **Calendar (drought)**: monthly, 1981–2026 — uses `?month=YYYY-MM`
- **Calendar (flood)**: daily, 2022–2026 — uses `?date=YYYY-MM-DD`
- **MDX source**: `gs://crma-mdx-store/rm/{dr|fl}-rm-{period}.mdx`

| Layer | Component | Description |
|-------|-----------|-------------|
| Calendar | `DisasterCalendar` | Monthly (drought) or daily (flood) heatmap of risk intensity |
| Map | `DisasterMap` | Regional risk intensity for the selected period |
| Content | MDX | Fetched from `rm/` via `/api/mdx/raw/rm/{filename}` |

### Risk Decisions (`?stage=risk-decisions`)

**Risk evaluation & impact-based forecasting** — Admin1 Bayesian Network projections.
Flood uses a per-day BN (`bn-dag-YYYY-MM-DD.json`); drought uses a 4-parent post-CDI
BN keyed per init-month (`drought-bn-dag-YYYY-MM.json`).

- **Calendar**: daily, 2026 only — uses `?date=YYYY-MM-DD`
- **MDX source**: `gs://crma-mdx-store/rd/{dr|fl}-rd-{period}.mdx`

| Layer | Component | Description |
|-------|-----------|-------------|
| Calendar | Forecast calendar | Available forecast days from BN model output |
| Map | Admin1 choropleth | BN probability/severity projections per Admin1 region |
| Content | MDX + `BNDag` SVG | Forecast narrative plus a posterior-network diagram |
| Boundary click | `BoundaryDagPanel` / `BoundaryDagPanelDrought` | Click any Admin1 region on the map to open its BN evidence + posterior |

---

## Content Architecture (GCS-backed MDX)

MDX content is **not baked into the build**. It is stored in GCS and fetched at
runtime through the API. This allows updating reports without redeploying.

```
gs://crma-mdx-store/
├── manifest.json                  ← hash index; frontend uses this to detect updates
├── rk/                            ← Risk Knowledge   (?stage=risk-knowledge)
│   ├── dr-rk-YYYY-MM.mdx         (drought, monthly)
│   └── fl-rk-YYYY-MM.mdx         (flood, monthly)
├── rm/                            ← Risk Monitoring  (?stage=risk-monitoring)
│   ├── dr-rm-YYYY-MM.mdx         (drought, monthly)
│   └── fl-rm-YYYY-MM-DD.mdx      (flood, daily)
├── rd/                            ← Risk Decisions   (?stage=risk-decisions)
│   ├── dr-rd-YYYY-MM-DD.mdx      (drought, daily — 2026)
│   └── fl-rd-YYYY-MM-DD.mdx      (flood, daily — 2026)
├── parquet/
│   ├── emdat_drought_adm1.parquet
│   ├── emdat_flood_adm1.parquet
│   └── emdat_all_disasters_adm1.parquet
└── media/                         ← binary assets embedded in MDX
    ├── rk/{slug}/                 (PNG, JPG, SVG, GIF, MP4, WebM …)
    ├── rm/{slug}/
    └── rd/{slug}/
```

### MDX filename convention

```
{hazard_prefix}-{tab}-{YYYY}-{MM}.mdx
│               │
│               └── rk | rm | rd
└── dr (drought) | fl (flood)
```

Examples: `dr-rk-2021-05.mdx`, `fl-rm-2026-04.mdx`, `dr-rd-2026-02-10.mdx`

### Media files (PNG / MP4)

Figures and animations referenced in MDX are stored at `media/{tab}/{slug}/{file}`.
The API serves them via `/api/mdx/media/{tab}/{slug}/{file}` with a 1-hour cache header.
MDX files reference them by filename only; the frontend resolves the full API path.

---

## GCS Upload Tooling

```bash
# Upload everything (MDX + parquet + media)
python upload_to_gcs.py

# Selective uploads
python upload_to_gcs.py --mdx-only
python upload_to_gcs.py --parquet-only
python upload_to_gcs.py --media-only
python upload_to_gcs.py --media-src /data/data-nodelete/crma-mdx-store/media

# Different bucket
python upload_to_gcs.py --bucket my-other-bucket
```

`upload_to_gcs.py` also regenerates `manifest.json` with MD5 hashes after each run.

### MDX generation

```bash
# Generate MDX stubs for all tabs from parquet
python generate_mdx.py

# Generate per-event markdown from EM-DAT parquet
python generate_event_mdx.py
```

Generated MDX is written to `app/content/events/` then uploaded to GCS.

---

## API Endpoints (served by crma-api Cloud Run)

| Endpoint | Used by | Description |
|----------|---------|-------------|
| `GET /api/emdat-monthly-risk?type=drought\|flood` | `DisasterCalendar` | Year × month event counts |
| `GET /api/emdat-month-regions/{event_key}` | `DisasterMap` | Admin1 region frequencies |
| `GET /api/emdat-event-markdown/{event_key}` | `MarkdownPanel` | Auto-generated event markdown |
| `GET /api/mdx/manifest` | Frontend cache check | File list + MD5 hashes + `updated_at` |
| `GET /api/mdx/raw/{tab}/{filename}` | MDX renderer | Raw MDX text; tab ∈ `{rk, rm, rd}` |
| `GET /api/mdx/media/{path}` | MDX embedded assets | PNG, MP4, SVG … with 1h cache |
| `GET /icpac_adm1v3.json` | `DisasterMap` | ICPAC East Africa Admin1 TopoJSON |

The API requires a Cloud Run identity token (SA-based auth). The Next.js route
handlers in `app/api/` attach the token on behalf of the browser.

---

## Project Structure

```
app/
├── page.tsx                        # Entry point (Suspense wrapper)
├── layout.tsx                      # Root layout
├── config.ts                       # API_BASE_URL and path constants
│
├── components/dashboard/
│   ├── DashboardShell.tsx          # HazardChips + PipelineChips + stage layout
│   ├── DisasterCalendar.tsx        # D3 calendar heatmap (Layer 1)
│   ├── DisasterMap.tsx             # D3 choropleth map (Layer 2)
│   ├── MarkdownPanel.tsx           # MDX/markdown renderer (Layer 3)
│   ├── HazardChips.tsx             # Hazard toggle — updates ?hazard=
│   ├── PipelineChips.tsx           # Stage navigation — updates ?stage=
│   └── StagePanels.tsx             # Stage-specific panel wrappers
│
├── store/providers/
│   └── pipeline.tsx                # URL-synced context (hazard, stage, selectedMonth)
│
├── lib/api/
│   └── emdat.ts                    # EM-DAT API client (apiFetch with identity token)
│
├── content/
│   └── events/                     # Generated MDX stubs (source for GCS upload)
│       ├── rk/
│       ├── rm/
│       └── rd/
│
└── api/                            # Next.js route handlers (proxy to crma-api)

app.py                              # FastAPI local proxy for dev (Cloud Run auth)
upload_to_gcs.py                    # Upload MDX + parquet + media → gs://crma-mdx-store
generate_mdx.py                     # Generate MDX stubs from parquet
generate_event_mdx.py               # Generate per-event markdown from parquet
data/                               # Local parquet files (source for GCS upload)
public/
└── icpac_adm1v3.json              # East Africa Admin1 boundaries (static)
```

---

## Quick Start

### 1. Install dependencies

```bash
yarn install
```

### 2. Start the local API proxy (required for real data)

```bash
# Needs micromamba env 'zarrv3' with fastapi, httpx, google-auth
micromamba run -n zarrv3 uvicorn app:app --host 0.0.0.0 --port 8000 --reload
```

### 3. Start Next.js

```bash
yarn dev
# or combined:
./start_dev_servers.sh
```

Open: `http://localhost:3000/?hazard=drought&stage=risk-knowledge&month=2011-08`

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NEXT_PUBLIC_API_BASE_URL` | Cloud Run API URL (baked into Docker image at build time) | `http://localhost:8000` |
| `NEXT_PUBLIC_SITE_URL` | Canonical frontend URL | `http://localhost:3000` |

In local dev without `NEXT_PUBLIC_API_BASE_URL`, `next.config.js` rewrites
`/api/*` to `http://localhost:8000` (the local FastAPI proxy).

---

## System Architecture

```
Browser
  │
  ├─ Next.js crma-frontend (Cloud Run, public)
  │     ├─ DashboardShell
  │     │    ├─ HazardChips        → ?hazard=drought|flood
  │     │    ├─ PipelineChips      → ?stage=risk-knowledge|risk-monitoring|risk-decisions
  │     │    ├─ DisasterCalendar   (D3 heatmap)
  │     │    ├─ DisasterMap        (D3 choropleth, icpac_adm1v3.json)
  │     │    └─ MarkdownPanel      (MDX renderer)
  │     │
  │     └─ app/api/* route handlers (attach identity token)
  │              │
  │              ▼
  │         crma-api (FastAPI, Cloud Run, private)
  │              │
  │              ▼
  │         gs://crma-mdx-store
  │           ├── rk/*.mdx  rm/*.mdx  rd/*.mdx
  │           ├── parquet/emdat_*.parquet
  │           ├── media/{tab}/{slug}/*.{png,mp4,…}
  │           └── manifest.json
  │
  └─ /icpac_adm1v3.json  (served directly from crma-api /public/)
```

---

## URL Schema

Stage IDs and the date param used per stage come from `app/types/pipeline.ts`:

```
# Risk Knowledge — monthly, 1990–2025
/?hazard=drought&stage=risk-knowledge&month=1990-01
/?hazard=flood&stage=risk-knowledge&month=2016-02

# Risk Monitoring — drought monthly (1981–2026), flood daily (2022–2026)
/?hazard=drought&stage=risk-monitoring&month=1984-03
/?hazard=flood&stage=risk-monitoring&date=2023-03-10

# Risk Decisions — daily, 2026 (Bayesian Network projections)
/?hazard=drought&stage=risk-decisions&date=2026-04-04
/?hazard=flood&stage=risk-decisions&date=2026-09-18
```

The date param name differs by calendar mode: monthly stages use `?month=YYYY-MM`,
daily stages use `?date=YYYY-MM-DD`. The frontend stores both as `selectedMonth`
on `PipelineState` (`app/types/pipeline.ts:14`) — the URL serialization picks the
right param name based on `getCalendarConfig(stage, hazard).mode`.
