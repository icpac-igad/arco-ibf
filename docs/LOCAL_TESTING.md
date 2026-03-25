# Local Testing Guide

> **Important:** You MUST start **both** servers (FastAPI on 8000 + Next.js on 3000).
> The `ECONNREFUSED` error means FastAPI is not running.

## Prerequisites

- **Node.js** ≥ 18 (`node --version`)
- **Python** ≥ 3.9 with `pandas`, `pyarrow`, `fastapi`, `uvicorn` installed
- Parquet data at `/data/08-2023/working_notes_jupyter/ignore_nka_gitrepos/ea-impact-events/Output/`

## Quick Start — Two Terminals

### Terminal 1: FastAPI backend (port 8000)

```bash
cd /data/08-2023/working_notes_jupyter/ignore_nka_gitrepos/pam_team/crma/arco-ibf
uvicorn app:app --host 0.0.0.0 --port 8000 --reload
```

You should see:
```
INFO:     Uvicorn running on http://0.0.0.0:8000
INFO:     Application startup complete.
```

**Quick test:**
```bash
curl http://localhost:8000/
# Should return: {"status":"ok","message":"CRMA Dashboard API (local parquet)", ...}
```

### Terminal 2: Next.js frontend (port 3000)

```bash
cd /data/08-2023/working_notes_jupyter/ignore_nka_gitrepos/pam_team/crma/arco-ibf
yarn install   # only first time
npx next dev --port 3000
```

You should see:
```
✓ Ready in ~2s
```

### Open in browser

```
http://localhost:3000/?hazard=drought&stage=events
http://localhost:3000/?hazard=flood&stage=events
```

## Common Errors

### `ECONNREFUSED ::1:8000` / `127.0.0.1:8000`

**Cause:** FastAPI backend is not running on port 8000.

**Fix:** Start the backend first in a separate terminal:
```bash
uvicorn app:app --host 0.0.0.0 --port 8000 --reload
```

### Calendar shows no data / blank heatmap

**Cause:** Backend returned empty or errored.

**Test the API directly:**
```bash
# Calendar data
curl "http://localhost:8000/api/emdat-monthly-risk?type=drought"

# Region data for a specific event
curl "http://localhost:8000/api/emdat-month-regions/2021-9546-ETH"

# Event markdown
curl "http://localhost:8000/api/emdat-event-markdown/2021-9546-ETH"
```

### MDX panel shows "No MDX storyline available"

**Cause:** MDX files not generated, or event key doesn't match filename.

**Fix:** Regenerate MDX files:
```bash
python3 generate_event_mdx.py
# Should output: drought: 80 files, flood: 368 files
```

**Test MDX API route (served by Next.js, not FastAPI):**
```bash
curl "http://localhost:3000/api/event-mdx?hazard=drought&event=2021-9546-ETH"
```

### SCSS / build errors

**Fix:** Clear Next.js cache and rebuild:
```bash
rm -rf .next
npx next dev --port 3000
```

## API Endpoints Reference

### FastAPI (port 8000) — parquet data

| Endpoint | Description |
|----------|-------------|
| `GET /` | Health check |
| `GET /api/emdat-monthly-risk?type=drought\|flood` | Calendar heatmap data |
| `GET /api/emdat-month-regions/{event_key}` | Admin1 regions for choropleth |
| `GET /api/emdat-event-markdown/{event_key}` | Auto-generated markdown |
| `GET /icpac_adm1v3.json` | Admin1 TopoJSON boundaries |

### Next.js (port 3000) — MDX rendering

| Endpoint | Description |
|----------|-------------|
| `GET /api/event-mdx?hazard=drought\|flood&event={key}` | Serialized MDX for client rendering |

### Quick API Health Check

```bash
# Run this to verify everything is working:
echo "=== FastAPI ===" && \
curl -s http://localhost:8000/ | python3 -m json.tool && \
echo "=== Calendar ===" && \
curl -s "http://localhost:8000/api/emdat-monthly-risk?type=drought" | \
  python3 -c "import sys,json; d=json.load(sys.stdin)['data']; print(f'{len(d)} drought events')" && \
curl -s "http://localhost:8000/api/emdat-monthly-risk?type=flood" | \
  python3 -c "import sys,json; d=json.load(sys.stdin)['data']; print(f'{len(d)} flood events')" && \
echo "=== MDX ===" && \
curl -s "http://localhost:3000/api/event-mdx?hazard=drought&event=2021-9546-ETH" | \
  python3 -c "import sys,json; d=json.load(sys.stdin); print(f'{d[\"meta\"][\"name\"]} ✓')" && \
echo "=== All OK ==="
```

## Architecture

```
Browser (localhost:3000)
  │
  ├── Next.js (port 3000)
  │   ├── DashboardShell
  │   │   ├── HazardChips (drought/flood toggle)
  │   │   ├── PipelineChips (events active, others disabled)
  │   │   ├── DisasterCalendar (D3 heatmap, 1990-2025)
  │   │   ├── DisasterMap (D3 choropleth, icpac_adm1v3.json)
  │   │   └── MarkdownPanel (MDXRemote + CountryHeader/ImpactStats)
  │   │
  │   ├── /api/event-mdx → reads app/content/events/*.mdx
  │   │                     serializes with next-mdx-remote
  │   │
  │   └── /api/* rewrites → FastAPI (port 8000)
  │
  └── FastAPI (port 8000)
      ├── Reads ea-impact-events/Output/*.parquet
      ├── /api/emdat-monthly-risk → calendar data
      ├── /api/emdat-month-regions → choropleth regions
      └── /api/emdat-event-markdown → fallback markdown
```

## Browser Debug Checklist

If the calendar cells don't respond to clicks or MDX doesn't render:

### 1. Open Browser DevTools Console (F12)

Look for errors like:
- `ECONNREFUSED` → FastAPI not running (start it on port 8000)
- `404 /api/emdat-monthly-risk` → API proxy misconfigured
- `Failed to fetch` → Network issue

### 2. Check Network Tab

After page loads, you should see these requests succeed (200):
- `GET /api/emdat-monthly-risk?type=drought` → returns JSON with `data[]`
- When you click a colored cell: `GET /api/emdat-month-regions/{event_key}` → returns `regions[]`
- When you click a colored cell: `GET /api/event-mdx?hazard=drought&event={key}` → returns MDX

### 3. Calendar shows all grey cells (no colored events)

This means the API returned empty data or failed. Check:
```bash
curl "http://localhost:8000/api/emdat-monthly-risk?type=drought" | head -200
```

### 4. Click on colored cell but nothing happens

- Only **colored cells** (cells with event data) are clickable
- Grey/empty cells have no events and won't trigger map or MDX updates
- Check console for `handleCellClick` errors

### 5. Map doesn't update on click

The TopoJSON file must be accessible:
```bash
curl -s http://localhost:3000/icpac_adm1v3.json | python3 -c "import sys,json; t=json.load(sys.stdin); print(f'TopoJSON OK: {len(t[\"objects\"][\"icpac_adm1v3\"][\"geometries\"])} regions')"
```

### 6. MDX panel shows error or stays blank

Test the Next.js MDX API route directly:
```bash
curl "http://localhost:3000/api/event-mdx?hazard=drought&event=2021-9546-ETH"
```
Should return JSON with `meta` and `mdxSource.compiledSource`.

### 7. Fresh start (nuclear option)

```bash
# Kill everything
fuser -k 8000/tcp 3000/tcp 2>/dev/null

# Clear Next.js cache
rm -rf .next

# Restart both
./start_dev_servers.sh
```
