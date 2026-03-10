# CMRA — Continuous Risk Monitoring & Assessment

An interactive early warning web application for flood and drought hazards across East Africa, built with Next.js and D3.js.

## Overview

CMRA integrates multi-decade EM-DAT disaster event records with IBF (Impact-Based Forecasting) pipelines to provide a unified view of hazard risk at the regional level. Users can toggle between hazard types, explore historical event frequency through a calendar heatmap, inspect affected Admin2 regions on a choropleth map, and navigate into narrative storylines, CRMA situational awareness panels, and IBF forecast outputs — all from a single URL-driven interface.

---

## Features

### Visualizations
- **D3 Calendar Heatmap** — Monthly EM-DAT event frequency by hazard type (1980–present), color-scaled by event count per cell
- **Admin2 Choropleth Map** — Regional event frequency overlay on East Africa Admin2 boundaries using TopoJSON
- **Responsive layout** — Both visualizations adapt to container width via `useResizeObserver`

### Navigation
- **HazardChips** — Toggle between `drought` and `flood`; switching hazard resets to the `events` stage
- **PipelineChips** — Switch between four pipeline stages:
  - `events` — EM-DAT calendar + choropleth map
  - `storylines` — Event-specific MDX narrative content
  - `crma` — Regional situational awareness (CRMA monitoring)
  - `ibf` — Admin1 BN (Bayesian Network) forecast projections
- **URL-driven state** — All navigation is reflected in query params (`?hazard=drought&stage=events`), enabling shareable and bookmarkable views; browser back/forward navigation works natively

### API & Data
- **EM-DAT endpoints** — Calendar heatmap data, Admin2 region frequencies, and event markdown narratives served from a Cloud Run API
- **Next.js proxy rewrites** — All `/api/*` requests are transparently proxied to the backend; no CORS configuration needed in the browser
- **Graceful fallback** — Mock data is used if the API is unavailable, keeping visualizations functional during development
- **FastAPI local proxy** (`app.py`) — Handles Cloud Run service account authentication (ID token management) for local development

### Content
- **MDX stories** — Narrative content under `app/content/stories/` rendered inline in the storylines stage
- **Dataset MDX** — Supporting dataset descriptions under `app/content/datasets/`

---

## Architecture

```
Browser (localhost:3000)
    │
    ├─ Next.js dev server (port 3000)
    │     ├─ /app/page.tsx → DashboardShell
    │     │     ├─ HazardChips  ──┐
    │     │     ├─ PipelineChips ─┤── URL params: ?hazard=&stage=
    │     │     ├─ DisasterCalendar (D3 heatmap)
    │     │     └─ DisasterMap   (D3 choropleth)
    │     │
    │     └─ /api/* rewrites ──► FastAPI proxy (port 8000)
    │                                  │
    │                                  └──► Cloud Run API (GCP us-central1)
    │                                             │
    │                                             └──► GCS: cpc_awc (Parquet/Markdown)
    │
    └─ public/ea_adm2.topojson  (Admin2 boundaries, served statically)
```

---

## Quick Start

### 1. Install dependencies

```bash
yarn install
```

### 2. Start the local proxy (for authenticated API access)

```bash
# Requires micromamba env 'zarrv3' with fastapi, httpx, google-auth
# Requires service account key at the path set in .env
micromamba run -n zarrv3 uvicorn app:app --host 0.0.0.0 --port 8000 --reload
```

### 3. Start the Next.js dev server

```bash
yarn dev
```

Open: [http://localhost:3000/?hazard=drought&stage=events](http://localhost:3000/?hazard=drought&stage=events)

Or use the combined startup script:

```bash
./start_dev_servers.sh
```

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NEXT_PUBLIC_API_BASE_URL` | Cloud Run API base URL (for Next.js rewrites) | `http://localhost:8000` |
| `NEXT_PUBLIC_SITE_URL` | Canonical site URL (for metadata) | `http://localhost:3000` |
| `CLOUDRUN_SERVICE_URL` | Cloud Run endpoint (used by local proxy) | — |
| `CLOUDRUN_SA_KEY_FILE` | Path to service account JSON key | — |

---

## API Endpoints

All requests are made relative to `/api/` and proxied by Next.js to the backend.

| Endpoint | Description |
|----------|-------------|
| `GET /api/emdat-monthly-risk?type=drought\|flood` | Calendar heatmap data (year × month event counts) |
| `GET /api/emdat-month-regions/{event_key}` | Admin2 region frequencies for a selected event |
| `GET /api/emdat-event-markdown/{event_key}` | Markdown narrative for a selected event |
| `GET /api/available-months` | Available BN forecast months |
| `GET /api/monthly-risk-data` | BN forecast calendar data |
| `GET /api/monthly-region-data/{key}` | Admin1 BN region projections |

---

## URL Navigation

```
/?hazard=drought&stage=events       # Default view
/?hazard=flood&stage=events         # Flood calendar + map
/?hazard=drought&stage=storylines   # Drought narrative content
/?hazard=flood&stage=crma           # Flood CRMA monitoring
/?hazard=drought&stage=ibf          # IBF forecast panel
```

Clicking a **HazardChip** resets the stage to `events`.
Clicking a **PipelineChip** preserves the current hazard.

---

## Project Structure

```
app/
├── page.tsx                        # Entry point with Suspense wrapper
├── layout.tsx                      # Root layout (no header/footer — standalone)
├── config.ts                       # API_BASE_URL and path constants
├── components/dashboard/
│   ├── DashboardShell.tsx          # Layout container with PipelineProvider
│   ├── DisasterCalendar.tsx        # D3 calendar heatmap
│   ├── DisasterMap.tsx             # D3 Admin2 choropleth
│   ├── HazardChips.tsx             # Hazard toggle (drought/flood)
│   ├── PipelineChips.tsx           # Stage navigation chips
│   ├── MarkdownPanel.tsx           # Event markdown renderer
│   └── StagePanels.tsx             # Storylines/CRMA/IBF stage panels
├── store/providers/
│   └── pipeline.tsx                # URL-synced context (hazard, stage, selectedMonth)
├── lib/api/
│   └── emdat.ts                    # EM-DAT API client functions
├── content/
│   ├── stories/                    # MDX narrative stories
│   └── datasets/                   # MDX dataset descriptions
├── types/
│   ├── emdat.ts                    # EM-DAT data types
│   └── pipeline.ts                 # PipelineStage / PipelineState types
├── utilities/hooks/
│   └── useResizeObserver.ts        # Container width for D3 responsive sizing
└── styles/
    ├── _uswds-theme.scss           # USWDS theme tokens
    ├── index.scss                  # Global styles entry
    └── dashboard.scss              # Cards, chips, calendar, map styles

app.py                              # FastAPI local proxy (Cloud Run auth)
proxy/                              # Proxy setup guides and startup scripts
public/
└── ea_adm2.topojson               # East Africa Admin2 boundaries
docs/
├── NEXTJS_SETUP_GUIDE.md          # Detailed setup and debugging guide
├── SVELTE_TO_NEXT.md              # Migration notes from Svelte implementation
└── PROXY_SETUP_GUIDE.md           # Cloud Run proxy architecture
```

---

## Backend

The Cloud Run API is maintained separately:

- **Service:** `ibf-dashboard-api` (GCP project: `e4drr-crafd`, region: `us-central1`)
- **Data source:** GCS bucket `cpc_awc` (Parquet files + Markdown assets)
- **Auth:** Service account with `roles/run.invoker`

See `docs/PROXY_SETUP_GUIDE.md` for local proxy setup and Cloud Run redeployment instructions.

---

## Branch

This is the `cmra-web` branch of the `arco-ibf` repository, containing the standalone Next.js CMRA dashboard. Other branches contain the original Svelte implementation and backend services.
