# CRMA — Continuous Risk Monitoring & Assessment

An interactive early warning web application for flood and drought hazards across
East Africa, built with Next.js and D3.js. Three composable UI layers — a **D3
calendar heatmap**, a **choropleth map**, and an **MDX content renderer** — are
repeated across four pipeline stages guiding users from raw disaster event records
through narrative context, situational risk monitoring, and impact-based forecasting.

**Deployed at**:
- Frontend: `https://crma-frontend-HASH-uc.a.run.app` (public Cloud Run)
- API: `https://crma-api-462481537368.us-central1.run.app` (private Cloud Run)
- Content bucket: `gs://crma-mdx-store`
- Deployment configs: `cno-e4drr/devops/crma-api-cr/` and `cno-e4drr/devops/crma-fe-cr/`

---

## Application Structure

The app is driven by two URL parameters always reflected in the address bar:

```
?hazard=drought|flood   &   ?stage=events|storylines|crma|ibf
```

Every calendar cell and map region generates a deep-linkable URL so any view can be
shared, bookmarked, or embedded.

---

## Pages / Pipeline Stages

### Page 1 — EM-DAT Disaster Database (`?stage=events`)

Historical disaster event records from the EM-DAT database for flood and drought.

| Layer | Component | Description |
|-------|-----------|-------------|
| Calendar | `DisasterCalendar` | D3 heatmap — year × month grid, color-scaled by event count |
| Map | `DisasterMap` | Admin1 choropleth — frequency of affected regions for the selected month |
| Content | `MarkdownPanel` | Auto-generated markdown from `/api/emdat-event-markdown/{event_key}` |

### Page 2 — Event Storylines (`?stage=storylines`)

Curated narratives for significant flood and drought events.

| Layer | Component | Description |
|-------|-----------|-------------|
| Calendar | `DisasterCalendar` | Same year × month heatmap |
| Map | `DisasterMap` | Admin1 choropleth for the selected event |
| Content | MDX | Fetched from `gs://crma-mdx-store/rk/` via `/api/mdx/raw/rk/{filename}` |

### Page 3 — CRMA + 400 Months (`?stage=crma`)

Continuous Risk Monitoring view covering ~400 months (~33 years) of hazard data.

| Layer | Component | Description |
|-------|-----------|-------------|
| Calendar | `DisasterCalendar` | Extended 400-month EM-DAT + BN risk view |
| Map | Choropleth | Regional risk intensity for the selected month |
| Content | MDX | Fetched from `gs://crma-mdx-store/rm/` via `/api/mdx/raw/rm/{filename}` |

### Page 4 — IBF Forecasts (`?stage=ibf`)

Impact-Based Forecasting (IBF) — Admin1 Bayesian Network projections.

| Layer | Component | Description |
|-------|-----------|-------------|
| Calendar | Forecast calendar | Available forecast months from BN model output |
| Map | Admin1 choropleth | BN probability/severity projections per Admin1 region |
| Content | MDX | Fetched from `gs://crma-mdx-store/rd/` via `/api/mdx/raw/rd/{filename}` |

---

## Content Architecture (GCS-backed MDX)

MDX content is **not baked into the build**. It is stored in GCS and fetched at
runtime through the API. This allows updating reports without redeploying.

```
gs://crma-mdx-store/
├── manifest.json                  ← hash index; frontend uses this to detect updates
├── rk/                            ← Risk Knowledge  (Page 2 — storylines)
│   ├── dr-rk-YYYY-MM.mdx         (drought, monthly)
│   └── fl-rk-YYYY-MM.mdx         (flood, monthly)
├── rm/                            ← Risk Monitoring  (Page 3 — crma)
│   ├── dr-rm-YYYY-MM.mdx
│   └── fl-rm-YYYY-MM.mdx
├── rd/                            ← Risk Decisions   (Page 4 — ibf)
│   ├── dr-rd-YYYY-MM.mdx
│   └── fl-rd-YYYY-MM.mdx
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

Open: `http://localhost:3000/?hazard=drought&stage=events`

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
  │     │    ├─ PipelineChips      → ?stage=events|storylines|crma|ibf
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

```
/?hazard=flood&stage=events&month=2011-08       # Page 1 — EM-DAT flood event
/?hazard=drought&stage=storylines&month=2011-11  # Page 2 — drought storyline
/?hazard=drought&stage=crma&month=1990-06        # Page 3 — CRMA 400-month view
/?hazard=drought&stage=ibf&month=2025-03         # Page 4 — IBF forecast
```
