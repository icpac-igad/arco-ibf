# CMRA — Continuous Risk Monitoring & Assessment

An interactive early warning web application for flood and drought hazards across East Africa, built with Next.js and D3.js. The application is organized around three composable UI layers — a **D3 calendar heatmap**, a **choropleth map**, and an **MDX content renderer** — repeated across four pipeline stages that guide users from raw disaster event records through narrative context, situational risk monitoring, and impact-based forecasting.

---

## Application Structure

The app is driven by two URL parameters that are always reflected in the address bar:

```
?hazard=drought|flood   &   ?stage=events|storylines|crma|ibf
```

Every calendar cell and map region generates a deep-linkable URL so that any specific event, month, or region view can be shared, bookmarked, or embedded.

---

## Pages / Pipeline Stages

### Page 1 — EM-DAT Disaster Database (`?stage=events`)

Historical disaster event records from the EM-DAT database for flood and drought hazards.

**UI layers:**

| Layer | Component | Description |
|-------|-----------|-------------|
| Calendar | `DisasterCalendar` | D3 heatmap — year × month grid, color-scaled by event count. Each cell is a deep link: `?hazard=flood&stage=events&month=2011-08` |
| Map | `DisasterMap` | Admin1 choropleth — frequency of affected regions for the selected month/event. Each region is hoverable with event count tooltip |
| Content | `MarkdownPanel` | Per-event markdown rendered from the API (`/api/emdat-event-markdown/{event_key}`), describing the selected disaster record |

**Hazards:** `flood` and `drought` (toggled via HazardChips)

---

### Page 2 — Event Storylines (`?stage=storylines`)

Curated narratives for significant flood and drought events, linking calendar months to structured MDX storymaps.

**UI layers:**

| Layer | Component | Description |
|-------|-----------|-------------|
| Calendar | `DisasterCalendar` | Same year × month heatmap as Page 1. Selecting a cell deep-links to its storyline: `?hazard=flood&stage=storylines&month=2011-11` |
| Map | `DisasterMap` | Admin1 choropleth — broader regional overview for the selected storyline event |
| Content | MDX Storymap | Full MDX story rendered from `app/content/stories/`, including prose, figures, and embedded maps |

**Note:** Each calendar date links to a unique URL so storylines can be accessed directly without navigating through the calendar.

---

### Page 3 — CRMA + 400 Months (`?stage=crma`)

Continuous Risk Monitoring & Assessment view covering approximately 400 months (~33 years) of historical hazard data, providing situational awareness context.

**UI layers:**

| Layer | Component | Description |
|-------|-----------|-------------|
| Calendar | `DisasterCalendar` | Extended 400-month view of EM-DAT + BN risk data. Each cell links to: `?hazard=drought&stage=crma&month=1990-06` |
| Map | Choropleth (Admin1) | Regional risk intensity for the selected month across the CRMA monitoring footprint |
| Content | MDX | Situational awareness narrative — CRMA monitoring reports, climate context, and risk commentary rendered from MDX |

---

### Page 4 — IBF Forecasts (`?stage=ibf`)

Impact-Based Forecasting (IBF) pipeline — Admin1 Bayesian Network (BN) projections for the upcoming season.

**UI layers:**

| Layer | Component | Description |
|-------|-----------|-------------|
| Calendar | Forecast calendar | Available forecast months from BN model output. Each cell links to: `?hazard=drought&stage=ibf&month=2025-03` |
| Map | Admin1 choropleth | BN probability/severity projections per Admin1 region for the selected forecast month |
| Content | MDX | Forecast narrative — lead time, confidence, recommended actions |

---

## Core UI Architecture

The three composable layers are consistent across all four pages:

```
┌──────────────────────────────────────────────────┐
│  HazardChips   [Drought]  [Flood]                │  → updates ?hazard=, resets to events
│  PipelineChips [Events] [Storylines] [CRMA] [IBF]│  → updates ?stage=
├──────────────────────────────────────────────────┤
│                                                   │
│   D3 Calendar Heatmap          Choropleth Map     │
│   ┌───────────────────┐   ┌───────────────────┐  │
│   │  year × month     │   │  Admin1 regions   │  │
│   │  color = count    │   │  color = frequency│  │
│   │  click → URL      │   │  hover → tooltip  │  │
│   └───────────────────┘   └───────────────────┘  │
│                                                   │
│   MDX Content Renderer                            │
│   ┌─────────────────────────────────────────┐    │
│   │  Event markdown / Storymap / CRMA report│    │
│   │  Rendered from API or app/content/      │    │
│   └─────────────────────────────────────────┘    │
└──────────────────────────────────────────────────┘
```

### Deep-Linkable URL Schema

Every calendar cell click updates the URL, making each view shareable:

```
# Page 1 — specific flood event in August 2011
/?hazard=flood&stage=events&month=2011-08

# Page 2 — drought storyline for November 2011
/?hazard=drought&stage=storylines&month=2011-11

# Page 3 — CRMA view for June 1990
/?hazard=drought&stage=crma&month=1990-06

# Page 4 — IBF forecast for March 2025
/?hazard=drought&stage=ibf&month=2025-03
```

---

## Project Structure

```
app/
├── page.tsx                        # Entry point (Suspense wrapper)
├── layout.tsx                      # Root layout — clean, no header/footer
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
│   └── emdat.ts                    # EM-DAT API client (see API section below)
│
├── content/
│   ├── stories/                    # MDX storymaps for Page 2
│   └── datasets/                   # Supporting dataset MDX
│
├── types/
│   ├── emdat.ts                    # EmdatMonthDatum, EmdatRegionDatum types
│   └── pipeline.ts                 # PipelineStage, PipelineState types
│
├── utilities/hooks/
│   └── useResizeObserver.ts        # Container width → D3 responsive sizing
│
└── styles/
    ├── _uswds-theme.scss           # USWDS design token overrides
    ├── index.scss                  # Global styles entry
    └── dashboard.scss              # Card, chip, calendar cell, map path styles

app.py                              # FastAPI local proxy (Cloud Run auth)
proxy/                              # Proxy guides and startup scripts
public/
└── icpac_adm1v3.json              # East Africa Admin1 boundaries (static)
docs/
├── NEXTJS_SETUP_GUIDE.md          # Dev setup and debugging
├── SVELTE_TO_NEXT.md              # Migration notes from Svelte
└── PROXY_SETUP_GUIDE.md           # Cloud Run proxy architecture
```

---

## API Endpoints

> **Status: Not yet connected — next iteration**
>
> All API calls in `app/lib/api/emdat.ts` are wired and the Next.js proxy rewrites are configured, but the Cloud Run backend requires service account authentication. The app currently falls back to **mock data** for all visualizations. Connecting real data is the next development milestone.

The following endpoints are defined and ready to be activated:

### EM-DAT Disaster Events (Pages 1 & 2)

| Endpoint | Used by | Description |
|----------|---------|-------------|
| `GET /api/emdat-monthly-risk?type=drought\|flood` | `DisasterCalendar` | Year × month event counts for heatmap |
| `GET /api/emdat-month-regions/{event_key}` | `DisasterMap` | Admin1 region frequencies for selected event |
| `GET /api/emdat-event-markdown/{event_key}` | `MarkdownPanel` | Markdown narrative for selected event |

### BN Forecast (Page 4 — IBF)

| Endpoint | Used by | Description |
|----------|---------|-------------|
| `GET /api/available-months` | Forecast calendar | List of available BN forecast months |
| `GET /api/monthly-risk-data` | Forecast calendar | BN calendar heatmap data |
| `GET /api/monthly-region-data/{key}` | Forecast map | Admin1 BN projection per region |
| `GET /api/forecast-markdown/{key}` | `MarkdownPanel` | Forecast narrative content |

### Static Assets (served locally)

| Asset | Description |
|-------|-------------|
| `GET /icpac_adm1v3.json` | East Africa Admin1 boundaries (all pages) |

---

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NEXT_PUBLIC_API_BASE_URL` | Cloud Run API URL (for Next.js proxy rewrites) | `http://localhost:8000` |
| `NEXT_PUBLIC_SITE_URL` | Canonical site URL (for metadata) | `http://localhost:3000` |
| `CLOUDRUN_SERVICE_URL` | Cloud Run endpoint (used by local FastAPI proxy) | — |
| `CLOUDRUN_SA_KEY_FILE` | Path to service account JSON key | — |

---

## Quick Start

### 1. Install dependencies

```bash
yarn install
```

### 2. Start the local proxy (required for real API data)

```bash
# Requires micromamba env 'zarrv3' with fastapi, httpx, google-auth
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

## System Architecture

```
Browser (localhost:3000)
    │
    ├─ Next.js (port 3000)
    │     ├─ DashboardShell
    │     │     ├─ HazardChips      ──┐  URL: ?hazard=drought|flood
    │     │     ├─ PipelineChips    ──┤  URL: ?stage=events|storylines|crma|ibf
    │     │     │                     └─ URL: ?month=YYYY-MM  (calendar cell click)
    │     │     ├─ [Layer 1] DisasterCalendar  (D3 heatmap)
    │     │     ├─ [Layer 2] DisasterMap       (D3 choropleth)
    │     │     └─ [Layer 3] MarkdownPanel     (MDX renderer)
    │     │
    │     └─ /api/* rewrites ──► FastAPI proxy (port 8000)   [next iteration]
    │                                  │
    │                                  └──► Cloud Run API (GCP us-central1)
    │                                             │
    │                                             └──► GCS: cpc_awc
    │                                                   (Parquet + Markdown)
    │
    └─ /icpac_adm1v3.json  (Admin1 boundaries, static)
```

---

## Next Iteration

- [ ] Connect Cloud Run API endpoints (remove mock data fallback)
- [ ] Add `?month=YYYY-MM` URL param — sync calendar cell selection to URL
- [ ] Add `icpac_adm1v3.json` to `public/` for all choropleth pages
- [ ] Implement Page 3 CRMA panel (400-month extended calendar view)
- [ ] Implement Page 4 IBF panel (BN forecast calendar + Admin1 map)
- [ ] MDX storymap rendering for Page 2 storylines stage
- [ ] Redeploy Cloud Run service (schema fix: `GID_1`/`NAME_1`)

---

## Branch

`cmra-web` branch of the `arco-ibf` repository — standalone Next.js CMRA dashboard. Other branches contain the original Svelte implementation and backend services.
