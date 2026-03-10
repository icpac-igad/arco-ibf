# IBF Dashboard Proxy Setup Guide

## Overview

This document explains the proxy architecture used to connect the local Svelte frontend to the Cloud Run API backend, including setup instructions, troubleshooting, and the error handling improvements made on 2026-02-17.

---

## Architecture

```
┌─────────────────────┐     ┌─────────────────────┐     ┌──────────────────────────┐
│   Browser           │────►│  Local Dev Stack    │────►│  Cloud Run API           │
│   localhost:5000    │     │                     │     │  (GCP us-central1)       │
└─────────────────────┘     │  1. Vite Dev Server │     └──────────────────────────┘
                            │     (port 5000)      │              │
                            │     - Svelte App     │              │
                            │     - Hot Reload     │              ▼
                            │                      │     ┌──────────────────────────┐
                            │  2. FastAPI Proxy    │     │  GCS Bucket: cpc_awc     │
                            │     (port 8000)      │     │  - Parquet files         │
                            │     - Auth to Cloud  │     │  - Markdown content      │
                            │     - ID Token Mgmt  │     │  - Assets                │
                            └─────────────────────┘     └──────────────────────────┘
```

### Why a Proxy?

The Cloud Run API requires **service account authentication** with ID tokens. The proxy server:
1. **Authenticates** to Cloud Run using a service account key
2. **Manages ID tokens** (refresh, caching)
3. **Forwards requests** from the Svelte app to Cloud Run
4. **Serves local static files** (TopoJSON) when available

---

## Setup Instructions

### Prerequisites

- **Micromamba environment** with Python dependencies: `fastapi`, `httpx`, `google-auth`
- **Service account key** for Cloud Run authentication
- **Environment variables** configured in `.env` file

### Step 1: Configure Environment Variables

Create `.env` file in the project root:

```bash
# Location: /path/to/ibf-calendar-cmra/codex-svl-mdx-ibf-calendar-storymaps/.env

CLOUDRUN_SERVICE_URL=https://ibf-dashboard-api-462481537368.us-central1.run.app
CLOUDRUN_SA_KEY_FILE=/path/to/cloudrun-deployer-key.json
```

**Service Account Key Location:**
```
/home/roller/Documents/08-2023/working_notes_jupyter/ignore_nka_gitrepos/cno-e4drr/devops/cloud_run/service_account/cloudrun-deployer-key.json
```

### Step 2: Start the Proxy Server

**Terminal 1: Start FastAPI Proxy**

```bash
cd /path/to/ibf-calendar-cmra/codex-svl-mdx-ibf-calendar-storymaps

# Start proxy with uvicorn (recommended for logging)
micromamba run -n zarrv3 uvicorn app:app --host 0.0.0.0 --port 8000 --reload

# Or start as background process with logs
nohup micromamba run -n zarrv3 uvicorn app:app --host 0.0.0.0 --port 8000 > proxy.log 2>&1 &

# Monitor logs
tail -f proxy.log
```

**Expected Output:**
```
INFO:     Started server process [12345]
INFO:     Waiting for application startup.
[PROXY] ID token refreshed, expires in 3599s
[PROXY] Connected to https://ibf-dashboard-api-462481537368.us-central1.run.app
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
```

### Step 3: Start the Svelte Dev Server

**Terminal 2: Start Vite Dev Server**

```bash
cd /path/to/ibf-calendar-cmra/codex-svl-mdx-ibf-calendar-storymaps/svelte-app

npm run dev
```

**Expected Output:**
```
VITE v7.2.0  ready in 500 ms

➜  Local:   http://localhost:5000/
➜  Network: http://0.0.0.0:5000/
```

### Step 4: Verify Setup

**Check Proxy Status:**
```bash
curl http://localhost:8000/
```

**Expected Response:**
```json
{
  "status": "ok",
  "message": "IBF Dashboard Proxy",
  "upstream": "https://ibf-dashboard-api-462481537368.us-central1.run.app",
  "endpoints": [...]
}
```

**Test Frontend:**

Open browser: `http://localhost:5000/?stage=events&hazard=drought`

---

## API Endpoints

### Cloud Run API Endpoints (via Proxy)

All `/api/*` requests from the frontend are proxied to Cloud Run:

| Frontend Request | Proxy Forwards To | Cloud Run Endpoint |
|-----------------|-------------------|-------------------|
| `http://localhost:5000/api/emdat-monthly-risk?type=drought` | `http://localhost:8000/api/emdat-monthly-risk?type=drought` | `https://ibf-dashboard-api-462481537368.us-central1.run.app/api/emdat-monthly-risk?type=drought` |

### Available Endpoints

#### BN Forecast Endpoints
- `GET /api/available-months` - List available forecast months
- `GET /api/monthly-risk-data` - Calendar heatmap data
- `GET /api/monthly-region-data/{key}` - Region-level forecast data
- `GET /api/forecast-markdown/{key}` - Forecast narrative content

#### EM-DAT Disaster Event Endpoints
- `GET /api/emdat-monthly-risk?type=drought|flood` - Calendar of disaster events
- `GET /api/emdat-month-regions/{event_key}` - Affected regions for an event
- `GET /api/emdat-event-markdown/{event_key}` - Event details (markdown)

#### Static Files
- `GET /icpac_adm1v3.json` - Admin1 TopoJSON (served locally)
- `GET /ea_adm2.topojson` - Admin2 TopoJSON (served locally)

---

## Vite Proxy Configuration

The Svelte dev server (Vite) automatically proxies API requests to the FastAPI server.

**File:** `svelte-app/vite.config.ts`

```typescript
export default defineConfig({
  plugins: [sveltekit()],
  server: {
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: 'http://localhost:8000',  // FastAPI proxy
        changeOrigin: true
      },
      '/icpac_adm1v3.json': {
        target: 'http://localhost:8000',
        changeOrigin: true
      },
      '/ea_adm2.topojson': {
        target: 'http://localhost:8000',
        changeOrigin: true
      }
    }
  }
});
```

**Request Flow:**
1. Browser → `http://localhost:5000/api/emdat-monthly-risk`
2. Vite proxy → `http://localhost:8000/api/emdat-monthly-risk`
3. FastAPI proxy → `https://ibf-dashboard-api-462481537368.us-central1.run.app/api/emdat-monthly-risk`

---

## Error Handling (2026-02-17 Update)

### Problem Discovered

When accessing `http://localhost:5000/?stage=events&hazard=drought` and clicking on calendar cells, the backend API returned **500 errors**:

```json
{
  "detail": "Binder Error: Referenced column \"shape_id\" not found in FROM clause!"
}
```

**Root Cause:** Schema mismatch
- **Deployed Cloud Run API** queries for: `shape_id`, `shape_name` (Admin2 schema)
- **GCS Parquet files** contain: `GID_1`, `NAME_1` (Admin1 schema)
- **Local codebase** already fixed to use `GID_1`, `NAME_1`
- **Deployed service** running outdated code

### Frontend Error Handling Improvements

**Files Modified:**
1. `svelte-app/src/utils/dataService.ts`
2. `svelte-app/src/stores/appStore.ts`
3. `svelte-app/src/components/DisasterCalendar.svelte`
4. `svelte-app/src/routes/+page.svelte`

**Changes:**

#### 1. Graceful API Error Handling
```typescript
// dataService.ts - fetchEmdatMonthRegions()
try {
  const response = await fetch(`/api/emdat-month-regions/${eventKey}`);
  if (!response.ok) {
    console.error(`API Error (${response.status}): ${await response.text()}`);
    return [];  // Return empty array instead of throwing
  }
  // ...
} catch (error) {
  console.error(`Network error:`, error);
  return [];  // Graceful degradation
}
```

#### 2. Error State Management
```typescript
// appStore.ts
export const emdatError = writable<string | null>(null);
```

#### 3. User-Friendly Error Display
```svelte
<!-- DisasterCalendar.svelte -->
{#if $emdatError}
  <div class="error-bar">
    <span class="error-icon">⚠️</span>
    {$emdatError}
  </div>
{/if}
```

**Result:**
- ✅ No UI crashes when API fails
- ✅ Error banner displays: *"⚠️ No data available for {event_key}. The backend API may be experiencing issues."*
- ✅ Detailed console logging for debugging
- ✅ Map shows empty state (gray regions) instead of breaking
- ✅ App remains functional for other features

---

## Troubleshooting

### Proxy Server Won't Start

**Check environment variables:**
```bash
cat .env
# Verify CLOUDRUN_SERVICE_URL and CLOUDRUN_SA_KEY_FILE are set
```

**Check service account key exists:**
```bash
ls -l /path/to/cloudrun-deployer-key.json
```

**Check Python dependencies:**
```bash
micromamba run -n zarrv3 python -c "import fastapi, httpx, google.auth"
```

### API Returns 401 Unauthorized

**Issue:** ID token expired or invalid

**Solution:** Restart proxy server to refresh token
```bash
pkill -f "uvicorn app:app"
micromamba run -n zarrv3 uvicorn app:app --host 0.0.0.0 --port 8000
```

### API Returns 500 Internal Server Error

**Check proxy logs:**
```bash
tail -f proxy.log
```

**Test endpoint directly:**
```bash
curl -s http://localhost:8000/api/emdat-monthly-risk?type=drought
```

**Current Known Issue (2026-02-17):**
- `/api/emdat-month-regions/{event_key}` returns 500 due to schema mismatch
- Frontend gracefully handles this error
- **Fix:** Redeploy Cloud Run service with updated code

### Frontend Not Loading

**Check Vite dev server:**
```bash
curl http://localhost:5000/
```

**Check browser console:**
- Open DevTools (F12)
- Look for CORS errors or network failures
- Verify `/api/*` requests are being proxied correctly

### CORS Errors

**Should not happen** with this setup since:
- Frontend and proxy both on `localhost`
- Vite proxy handles forwarding
- Cloud Run API allows configured origins

If CORS errors occur:
1. Verify Vite proxy config in `vite.config.ts`
2. Check Cloud Run API `ALLOWED_ORIGINS` env var

---

## Testing the Setup

### Test Script

```bash
#!/bin/bash
# test_proxy_setup.sh

echo "=== Testing Proxy Setup ==="

echo -e "\n1. Testing Proxy Health:"
curl -s http://localhost:8000/ | python3 -m json.tool

echo -e "\n2. Testing BN Forecast Data:"
curl -s http://localhost:8000/api/available-months | python3 -m json.tool | head -20

echo -e "\n3. Testing EM-DAT Monthly Risk:"
curl -s -w "\nHTTP Status: %{http_code}\n" \
  http://localhost:8000/api/emdat-monthly-risk?type=drought | head -10

echo -e "\n4. Testing EM-DAT Month Regions (known 500 error):"
curl -s -w "\nHTTP Status: %{http_code}\n" \
  http://localhost:8000/api/emdat-month-regions/2011-01_drought

echo -e "\n5. Testing Svelte Dev Server:"
curl -s http://localhost:5000/ | grep -o '<title>.*</title>'

echo -e "\n=== Setup Test Complete ==="
```

**Run:**
```bash
chmod +x test_proxy_setup.sh
./test_proxy_setup.sh
```

---

## Monitoring

### Watch Proxy Logs
```bash
tail -f proxy.log
```

### Check Token Refresh
```bash
grep "ID token refreshed" proxy.log
```

### Monitor API Requests
```bash
# Proxy access logs show all forwarded requests
grep "GET /api/" proxy.log
```

---

## Backend Fix Required

**Issue:** Deployed Cloud Run service has schema mismatch

**Location:** `/home/roller/Documents/08-2023/working_notes_jupyter/ignore_nka_gitrepos/cno-e4drr/devops/cloud_run`

**Local Code Status:** ✅ Already fixed (uses `GID_1`, `NAME_1`)

**Required Action:** Redeploy Cloud Run service

```bash
cd /home/roller/Documents/08-2023/working_notes_jupyter/ignore_nka_gitrepos/cno-e4drr/devops/cloud_run

# Build new image
gcloud builds submit --config=cloudbuild.yaml --project=e4drr-crafd

# Deploy updated service
gcloud run deploy ibf-dashboard-api \
  --image=us-central1-docker.pkg.dev/e4drr-crafd/ibf-dashboard/ibf-dashboard-api:latest \
  --region=us-central1 \
  --project=e4drr-crafd
```

**Verify Parquet Schema:**
```bash
gsutil cp gs://cpc_awc/bn_parqs/emdat_events.parquet /tmp/
python3 -c "
import pandas as pd
df = pd.read_parquet('/tmp/emdat_events.parquet')
print('Columns:', list(df.columns))
print('Has GID_1:', 'GID_1' in df.columns)
print('Has NAME_1:', 'NAME_1' in df.columns)
"
```

**Expected Output:**
```
Columns: ['event_key', 'dis_no', ..., 'GID_1', 'NAME_1', 'event_count']
Has GID_1: True
Has NAME_1: True
```

---

## Quick Reference

### Start Both Servers

```bash
# Terminal 1: Proxy
cd /path/to/codex-svl-mdx-ibf-calendar-storymaps
nohup micromamba run -n zarrv3 uvicorn app:app --host 0.0.0.0 --port 8000 > proxy.log 2>&1 &

# Terminal 2: Frontend
cd svelte-app
npm run dev
```

### Stop Servers

```bash
# Stop proxy
pkill -f "uvicorn app:app"

# Stop frontend (Ctrl+C in terminal, or)
pkill -f "vite dev"
```

### Access Points

- **Frontend:** http://localhost:5000
- **Proxy API:** http://localhost:8000
- **Events Tab:** http://localhost:5000/?stage=events&hazard=drought
- **Cloud Run Direct:** https://ibf-dashboard-api-462481537368.us-central1.run.app

---

## Related Documentation

- **Cloud Run README:** `/cno-e4drr/devops/cloud_run/README.md`
- **EM-DAT Plan:** `docs/EMDAT_DISASTER_EVENT_TAB_PLAN.md`
- **URL Navigation:** `docs/URL_NAVIGATION_GUIDE.md`
- **Frontend Error Handling:** This document, section "Error Handling"

---

**Last Updated:** 2026-02-17
**Status:** Frontend error handling implemented ✅ | Backend redeployment needed ⏳
