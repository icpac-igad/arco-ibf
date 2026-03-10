# Next.js Dashboard Setup Guide

## Overview

The Next.js dashboard now has **URL-driven navigation** with hazard and pipeline stage chips, matching the functionality from the Svelte implementation.

---

## ✅ What's Been Implemented

### 1. **Chips with URL Navigation**
- ✅ **HazardChips** - Toggle between `drought` and `flood`
- ✅ **PipelineChips** - Switch between `events`, `storylines`, `crma`, and `ibf`
- ✅ URL updates when clicking chips
- ✅ Browser back/forward navigation works
- ✅ Shareable links with specific hazard/stage combinations

### 2. **URL Structure**
```
http://localhost:3000/                           # Default: drought + events
http://localhost:3000/?hazard=drought&stage=events
http://localhost:3000/?hazard=flood&stage=storylines
http://localhost:3000/?hazard=drought&stage=crma
```

### 3. **API Proxy Configuration**
- ✅ Next.js rewrites configured to proxy `/api/*` requests
- ✅ Environment variable for Cloud Run API URL
- ✅ Fallback mock data when API is unavailable
- ✅ Graceful error handling

### 4. **Components Restored**
- ✅ HazardChips with URL navigation
- ✅ PipelineChips with URL navigation
- ✅ DisasterCalendar with D3.js heatmap
- ✅ DisasterMap with choropleth visualization

---

## 🔧 How It Works

### URL Navigation Flow

**1. Clicking Hazard Chips:**
```
Before: /?hazard=drought&stage=crma
Click:  Flood chip
After:  /?hazard=flood&stage=events (resets to events)
```

**2. Clicking Pipeline Stage Chips:**
```
Before: /?hazard=drought&stage=events
Click:  CRMA stage
After:  /?hazard=drought&stage=crma (preserves hazard)
```

### State Management

The `PipelineProvider` context:
- Reads URL params on mount (`useSearchParams`)
- Updates URL when chips are clicked (`router.replace`)
- Syncs state bidirectionally with URL
- Preserves state during navigation

### API Proxy

**Next.js Rewrites** (`next.config.js`):
```javascript
{
  source: '/api/:path*',
  destination: 'https://ibf-dashboard-api-462481537368.us-central1.run.app/api/:path*'
}
```

**API calls in components:**
```typescript
fetch('/api/emdat-monthly-risk?type=drought')  // Relative URL
// ↓ Next.js rewrites to ↓
fetch('https://ibf-dashboard-api-462481537368.us-central1.run.app/api/emdat-monthly-risk?type=drought')
```

---

## 🚀 Running the Dashboard

### Option A: Direct Cloud Run API (Current Setup)

**Start the dev server:**
```bash
cd /data/08-2023/working_notes_jupyter/ignore_nka_gitrepos/ibf-calendar-cmra/eoviz-esip2025
yarn dev
```

**Visit:** http://localhost:3000/?hazard=drought&stage=events

**⚠️ Important Note:**
The Cloud Run API requires **authentication with ID tokens**. Direct calls from Next.js rewrites will fail with 401/403 errors unless the API is publicly accessible.

**Current behavior:**
- API calls will fail authentication
- Components will fall back to **mock data**
- Calendar and map will still display (with random sample data)

---

### Option B: Using Local Proxy (Recommended)

For authenticated API access, use a local proxy server (similar to the Svelte setup):

**Terminal 1: Start FastAPI Proxy**
```bash
cd /data/08-2023/working_notes_jupyter/ignore_nka_gitrepos/ibf-calendar-cmra/codex-svl-mdx-ibf-calendar-storymaps

# Start proxy with authentication
micromamba run -n zarrv3 uvicorn app:app --host 0.0.0.0 --port 8000 --reload
```

**Terminal 2: Update .env and Start Next.js**
```bash
cd /data/08-2023/working_notes_jupyter/ignore_nka_gitrepos/ibf-calendar-cmra/eoviz-esip2025

# Update .env to use local proxy
echo 'NEXT_PUBLIC_API_BASE_URL="http://localhost:8000"' >> .env.local

# Start Next.js dev server
yarn dev
```

**Expected Flow:**
1. Browser → `http://localhost:3000/api/emdat-monthly-risk`
2. Next.js proxy → `http://localhost:8000/api/emdat-monthly-risk`
3. FastAPI proxy → Cloud Run (with authentication)
4. Real data displayed in calendar and map

---

## 📊 Available API Endpoints

### EM-DAT Disaster Events
- `GET /api/emdat-monthly-risk?type=drought|flood` - Calendar heatmap data
- `GET /api/emdat-month-regions/{event_key}` - Regional frequency for choropleth
- `GET /api/emdat-event-markdown/{event_key}` - Event storyline content

### Example Requests
```bash
# Calendar data
curl http://localhost:3000/api/emdat-monthly-risk?type=drought

# Region data for specific event
curl http://localhost:3000/api/emdat-month-regions/2011-01_drought

# Storyline markdown
curl http://localhost:3000/api/emdat-event-markdown/2024-12_flood
```

---

## 🧪 Testing URLs

Open these URLs to test navigation:

```bash
# Drought events view (default)
http://localhost:3000/?hazard=drought&stage=events

# Flood storylines view
http://localhost:3000/?hazard=flood&stage=storylines

# Drought CRMA view
http://localhost:3000/?hazard=drought&stage=crma

# Drought IBF forecasts
http://localhost:3000/?hazard=drought&stage=ibf
```

**Test interactions:**
1. Click hazard chips → URL updates, stage resets to "events"
2. Click stage chips → URL updates, hazard preserved
3. Use browser back/forward → State syncs with URL
4. Copy/paste URL → Dashboard loads with correct state

---

## 🔍 Debugging

### Check if chips are rendering
Open browser console (F12) and look for:
- HazardChips buttons
- PipelineChips buttons
- Click events updating URL

### Check API calls
In Network tab:
```
/api/emdat-monthly-risk?type=drought
Status: 200 (if proxy working) or 401/403 (if auth failed)
```

### Check URL sync
In console:
```javascript
// Check current params
console.log(new URLSearchParams(window.location.search).get('hazard'))
// Should output: "drought" or "flood"
```

### Mock Data Fallback
If you see data but API is failing:
- Calendar shows random events 2020-2024
- Map shows sample East Africa regions
- Console logs "using mock data" messages

---

## 📁 Files Modified

```
app/
├── page.tsx                              # Added Suspense wrapper
├── config.ts                             # Changed API_BASE_URL to ''
├── layout.tsx                            # Removed VEDA UI Header/Footer
├── components/dashboard/
│   ├── DashboardShell.tsx               # Restored chips
│   ├── HazardChips.tsx                  # (no changes needed)
│   ├── PipelineChips.tsx                # (no changes needed)
│   ├── DisasterCalendar.tsx             # Has mock data fallback
│   └── DisasterMap.tsx                  # Has mock data fallback
├── store/providers/
│   └── pipeline.tsx                     # Added URL sync logic
└── .env                                 # Added NEXT_PUBLIC_API_BASE_URL

next.config.js                            # Added API proxy rewrites
docs/NEXTJS_SETUP_GUIDE.md               # This file
```

---

## 🔜 Next Steps

### For Real API Data

**Option 1: Start Local Proxy**
```bash
# See "Option B: Using Local Proxy" above
cd ../codex-svl-mdx-ibf-calendar-storymaps
micromamba run -n zarrv3 uvicorn app:app --port 8000
```

**Option 2: Make Cloud Run API Public** (not recommended)
```bash
gcloud run services add-iam-policy-binding ibf-dashboard-api \
  --region=us-central1 \
  --member="allUsers" \
  --role="roles/run.invoker"
```

**Option 3: Use Next.js API Routes for Auth**
Create `app/api/[...proxy]/route.ts` to handle Cloud Run authentication server-side.

### Add More Stages

When you want to implement storylines, CRMA, or IBF stages:

1. **Create stage components** (e.g., `StorylinePanel.tsx`, `CRMAPanel.tsx`)
2. **Add to DashboardShell** conditionally based on `stage`:
   ```tsx
   {stage === 'storylines' && <StorylinePanel />}
   {stage === 'crma' && <CRMAPanel />}
   {stage === 'ibf' && <IBFPanel />}
   ```

3. **Fetch stage-specific data** using the context:
   ```tsx
   const { hazard, stage } = usePipelineStore();
   ```

---

## ✅ Summary

**What works now:**
- ✅ Chips with URL navigation
- ✅ Calendar and map visualizations
- ✅ Browser back/forward
- ✅ Shareable URLs
- ✅ Mock data fallback
- ✅ Clean layout without VEDA UI wrapper

**What needs setup for real data:**
- ⏳ Start local proxy server for authenticated API access
- ⏳ Or configure Next.js API routes for server-side auth

**Current status:**
🌐 Server running at http://localhost:3000
📊 Chips and visualizations rendering
🔗 URL navigation working
⚠️ API using mock data (auth not configured)

**Test it now:**
```bash
open http://localhost:3000/?hazard=drought&stage=events
```

Click the chips and watch the URL update! 🎉
