# CRMA Build & Test Quick-Start Guide — 2026-04-08

## Overview

Two repos, two Cloud Run services, one GCS bucket.

| Repo | What it contains |
|---|---|
| `arco-ibf` | Next.js frontend source (branch `cmra-web`) |
| `cno-e4drr` | Dockerfiles, cloudbuild.yaml, terraform (branch `main`) |

| Service | URL | Auth |
|---|---|---|
| `crma-api` | `https://crma-api-462481537368.us-central1.run.app` | Private (identity token required) |
| `crma-frontend` | `https://crma-frontend-yiyrp6yumq-uc.a.run.app` | Public |

| Bucket | Contents |
|---|---|
| `gs://crma-mdx-store` | `rk/rm/rd/*.mdx` + `parquet/*.parquet` + `manifest.json` |

---

## Quick-start: full redeploy from scratch

```bash
# 1. Activate API deployer SA
gcloud auth activate-service-account \
  --key-file=cno-e4drr/devops/crma-api-cr/service_account/crma-api-deployer-key.json

# 2. Upload MDX + parquet to GCS
cd arco-ibf
micromamba run -n zarrv3 python upload_to_gcs.py

# 3. Build + deploy crma-api
cd cno-e4drr/devops/crma-api-cr
gcloud builds submit . \
  --config=cloudbuild.yaml \
  --project=e4drr-crafd \
  --service-account=projects/e4drr-crafd/serviceAccounts/crma-api-deployer@e4drr-crafd.iam.gserviceaccount.com

# 4. Build + deploy crma-frontend
cd arco-ibf
bash _build_fe.sh     # see helper script section below
```

---

## Step-by-step build commands

### A. Build & deploy `crma-api`

**Prerequisites:** SA key at `cno-e4drr/devops/crma-api-cr/service_account/crma-api-deployer-key.json`

```bash
# Activate deployer SA (REQUIRED — build fails with NOT_FOUND without this)
gcloud auth activate-service-account \
  --key-file=/data/08-2023/working_notes_jupyter/ignore_nka_gitrepos/cno-e4drr/devops/crma-api-cr/service_account/crma-api-deployer-key.json

# Submit build — runs docker build, push, gcloud run deploy
cd /data/08-2023/working_notes_jupyter/ignore_nka_gitrepos/cno-e4drr/devops/crma-api-cr

gcloud builds submit . \
  --config=cloudbuild.yaml \
  --project=e4drr-crafd \
  --service-account=projects/e4drr-crafd/serviceAccounts/crma-api-deployer@e4drr-crafd.iam.gserviceaccount.com
```

**What cloudbuild.yaml does:**
1. `docker build` — builds Python 3.11 slim image with FastAPI + google-cloud-storage
2. `docker push` — pushes to `us-central1-docker.pkg.dev/e4drr-crafd/crma/crma-api:latest`
3. `gcloud run deploy crma-api` — deploys with `--memory=512Mi`, `--max-instances=2`, `--no-allow-unauthenticated`, `--set-env-vars=MDX_BUCKET=crma-mdx-store`

**Expected output:**
```
ID: 30edbd61-...   DURATION: 3M   STATUS: SUCCESS
```

---

### B. Build & deploy `crma-frontend`

The frontend source is in `arco-ibf` but the `Dockerfile` and `cloudbuild.yaml` are in `cno-e4drr/devops/crma-fe-cr/`. A temp build directory is needed because `next.config.js` must be patched with `output: 'standalone'` (not committed to source — it breaks local dev HMR).

```bash
# Step 1: Create temp build directory
BUILD_DIR="/tmp/crma-fe-build"
rm -rf $BUILD_DIR

# Step 2: Copy arco-ibf source (excluding large/irrelevant dirs)
rsync -a \
  --exclude='.git' --exclude='node_modules' --exclude='.next' \
  --exclude='__pycache__' --exclude='*.txt' --exclude='*.py' \
  /data/08-2023/working_notes_jupyter/ignore_nka_gitrepos/pam_team/crma/arco-ibf/ \
  $BUILD_DIR/

# Step 3: Copy Dockerfile and cloudbuild.yaml from cno-e4drr
cp /data/08-2023/working_notes_jupyter/ignore_nka_gitrepos/cno-e4drr/devops/crma-fe-cr/Dockerfile $BUILD_DIR/
cp /data/08-2023/working_notes_jupyter/ignore_nka_gitrepos/cno-e4drr/devops/crma-fe-cr/cloudbuild.yaml $BUILD_DIR/

# Step 4: Patch next.config.js with output: 'standalone' (required by Dockerfile)
sed -i "s/module.exports = {/module.exports = {\n  output: 'standalone',/" $BUILD_DIR/next.config.js

# Step 5: Activate FE deployer SA
gcloud auth activate-service-account \
  --key-file=/data/08-2023/working_notes_jupyter/ignore_nka_gitrepos/cno-e4drr/devops/crma-fe-cr/service_account/crma-fe-deployer-key.json

# Step 6: Submit build with real API URL injected as build arg
cd $BUILD_DIR
gcloud builds submit . \
  --config=cloudbuild.yaml \
  --project=e4drr-crafd \
  --service-account=projects/e4drr-crafd/serviceAccounts/crma-fe-deployer@e4drr-crafd.iam.gserviceaccount.com \
  --substitutions=_API_URL=https://crma-api-462481537368.us-central1.run.app
```

**What cloudbuild.yaml does:**
1. `docker build` — multi-stage Next.js build: `yarn install` → `yarn build` → slim runtime image
2. `docker push` — pushes to `us-central1-docker.pkg.dev/e4drr-crafd/crma/crma-frontend:latest`
3. `gcloud run deploy crma-frontend` — deploys with `--allow-unauthenticated`, `--max-instances=2`, `--concurrency=40`

**Expected output:**
```
ID: 30c08852-...   DURATION: ~5M   STATUS: SUCCESS
```

---

### C. Upload MDX + parquet to GCS

Run from `arco-ibf/`:

```bash
# Upload everything (MDX + parquet) and regenerate manifest.json
micromamba run -n zarrv3 python upload_to_gcs.py

# Upload MDX files only (faster, ~2-3 min for 2665 files)
micromamba run -n zarrv3 python upload_to_gcs.py --mdx-only

# Upload parquet files only
micromamba run -n zarrv3 python upload_to_gcs.py --parquet-only

# Preview what would be uploaded (no actual upload)
micromamba run -n zarrv3 python upload_to_gcs.py --dry-run

# Upload a single new/edited MDX file + refresh manifest
gsutil cp app/content/events/rk/dr-rk-2025-06.mdx gs://crma-mdx-store/rk/
micromamba run -n zarrv3 python upload_to_gcs.py --mdx-only
```

**Bucket layout:**
```
gs://crma-mdx-store/
  rk/*.mdx          — Risk Knowledge (267 files)
  rm/*.mdx          — Risk Monitoring (2378 files)
  rd/*.mdx          — Risk Decisions (20 files)
  parquet/emdat_drought_adm1.parquet
  parquet/emdat_flood_adm1.parquet
  parquet/emdat_all_disasters_adm1.parquet
  manifest.json     — hash index, refreshed by upload_to_gcs.py
```

Frontend picks up new MDX within **5 minutes** (manifest TTL) — no redeploy needed.

---

### D. Terraform — bucket and IAM (run once)

Only needed when setting up a new environment:

```bash
cd /data/08-2023/working_notes_jupyter/ignore_nka_gitrepos/cno-e4drr/devops/crma-api-cr/terraform

# Copy and fill in tfvars
cp terraform.tfvars.example terraform.tfvars

# Activate user account for terraform
gcloud config set account nkalladath@icpac.net

terraform init
terraform plan    # review: bucket + IAM bindings
terraform apply
```

If `crma-api` Cloud Run service already exists from a previous manual deploy, import it first:
```bash
terraform import google_cloud_run_v2_service.crma_api \
  "projects/e4drr-crafd/locations/us-central1/services/crma-api"
```

---

## Test commands

### Test `crma-api` (all endpoints)

```bash
cd /data/08-2023/working_notes_jupyter/ignore_nka_gitrepos/cno-e4drr/devops/crma-api-cr

# Activate SA first (token needed — API is private)
gcloud auth activate-service-account \
  --key-file=service_account/crma-api-deployer-key.json

# Run full test suite (9 tests)
micromamba run -n zarrv3 python test_api.py
```

**Expected output:**
```
Testing CRMA API: https://crma-api-462481537368.us-central1.run.app
======================================================================
  [PASS] Root / Health                   ~1000ms  status=ok, endpoints=6
  [PASS] Drought Calendar                 ~500ms  80 events
  [PASS] Flood Calendar                   ~900ms  368 events
  [PASS] Regions (1990-9289-SDN)          ~400ms  18 regions
  [PASS] Markdown (1990-9289-SDN)         ~500ms  475 chars
  [PASS] TopoJSON                         ~800ms  type=Topology
  [PASS] MDX Manifest                     ~900ms  2668 files
  [PASS] MDX Raw (dr-rk-2021-05)          ~600ms  484 chars
  [PASS] Unauthenticated → 403           protected
======================================================================
Result: 9/9 passed
```

### Test `crma-api` manually with curl

```bash
# Get identity token
gcloud auth activate-service-account \
  --key-file=/data/08-2023/working_notes_jupyter/ignore_nka_gitrepos/cno-e4drr/devops/crma-api-cr/service_account/crma-api-deployer-key.json
TOKEN=$(gcloud auth print-identity-token)
API="https://crma-api-462481537368.us-central1.run.app"

# Root / health check
curl -s -H "Authorization: Bearer $TOKEN" $API/

# Drought calendar data (80 events)
curl -s -H "Authorization: Bearer $TOKEN" "$API/api/emdat-monthly-risk?type=drought" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d['data']), 'events')"

# Flood calendar data (368 events)
curl -s -H "Authorization: Bearer $TOKEN" "$API/api/emdat-monthly-risk?type=flood" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d['data']), 'events')"

# Admin1 regions for an event
curl -s -H "Authorization: Bearer $TOKEN" "$API/api/emdat-month-regions/1990-9289-SDN" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d['regions']), 'regions')"

# MDX manifest (2668 files)
curl -s -H "Authorization: Bearer $TOKEN" "$API/api/mdx/manifest" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d['files']), 'files')"

# Raw MDX file
curl -s -H "Authorization: Bearer $TOKEN" "$API/api/mdx/raw/rk/dr-rk-2021-05.mdx" | head -5

# Confirm unauthenticated access is blocked (should return 403)
curl -s -o /dev/null -w "HTTP %{http_code}\n" $API/
```

### Test `crma-frontend` (public, no auth needed)

```bash
FE="https://crma-frontend-yiyrp6yumq-uc.a.run.app"

# Page loads
curl -s -o /dev/null -w "HTTP %{http_code}\n" $FE

# Drought calendar via FE proxy route (server-side, adds identity token internally)
curl -s "$FE/api/emdat-monthly-risk?type=drought" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d['data']), 'events')"

# Flood calendar
curl -s "$FE/api/emdat-monthly-risk?type=flood" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d['data']), 'events')"

# Admin1 regions
curl -s "$FE/api/emdat-month-regions/1990-9289-SDN" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d['regions']), 'regions')"

# Event markdown
curl -s "$FE/api/emdat-event-markdown/1990-9289-SDN" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d.get('markdown','')), 'chars')"

# MDX (event exists)
curl -s "$FE/api/event-mdx?hazard=drought&stage=risk-knowledge&period=2021-05" | python3 -c "import sys,json; d=json.load(sys.stdin); print('meta:', d.get('meta',{}).get('id'))"

# MDX (event missing — should return 404 + JSON error, not 500)
curl -s "$FE/api/event-mdx?hazard=flood&stage=risk-knowledge&period=1994-03"
# Expected: {"error":"Event MDX not found"}
```

---

## Common errors and fixes

| Error | Cause | Fix |
|---|---|---|
| `NOT_FOUND` on `gcloud builds submit` | Missing `--service-account` flag | Always pass `--service-account=projects/e4drr-crafd/serviceAccounts/crma-api-deployer@...` |
| `memory < 512Mi not supported` | Cloud Run minimum for unthrottled CPU | Use `--memory=512Mi` in cloudbuild.yaml |
| `Resource 'crma-api' already exists` in terraform | Service exists outside terraform state | Run `terraform import google_cloud_run_v2_service.crma_api ...` |
| 403 on `/api/emdat-*` from browser | Old code using `next.config.js` rewrite without auth | Fixed: use Next.js API route handlers with `apiFetch()` |
| 500 on `/api/emdat-month-regions/...` | `next.config.js` rewrite catching route before handler | Fixed: rewrite now only active in local dev |
| MDX returns 404 | (a) File missing in GCS, or (b) unauthenticated fetch | (a) Check parquet for event existence; (b) ensure `apiFetch` is used |

---

## Helper build script

Save as `arco-ibf/_build_fe.sh` for repeated FE builds:

```bash
#!/usr/bin/env bash
set -e

API_URL="https://crma-api-462481537368.us-central1.run.app"
PROJECT="e4drr-crafd"
FE_SA="projects/e4drr-crafd/serviceAccounts/crma-fe-deployer@e4drr-crafd.iam.gserviceaccount.com"
FE_KEY="/data/08-2023/working_notes_jupyter/ignore_nka_gitrepos/cno-e4drr/devops/crma-fe-cr/service_account/crma-fe-deployer-key.json"
ARCO_IBF="/data/08-2023/working_notes_jupyter/ignore_nka_gitrepos/pam_team/crma/arco-ibf"
FE_DEVOPS="/data/08-2023/working_notes_jupyter/ignore_nka_gitrepos/cno-e4drr/devops/crma-fe-cr"
BUILD_DIR="/tmp/crma-fe-build"

echo "Preparing build context..."
rm -rf $BUILD_DIR
rsync -a \
  --exclude='.git' --exclude='node_modules' --exclude='.next' \
  --exclude='__pycache__' --exclude='*.txt' --exclude='*.py' \
  $ARCO_IBF/ $BUILD_DIR/
cp $FE_DEVOPS/Dockerfile $BUILD_DIR/
cp $FE_DEVOPS/cloudbuild.yaml $BUILD_DIR/
sed -i "s/module.exports = {/module.exports = {\n  output: 'standalone',/" $BUILD_DIR/next.config.js

echo "Activating FE deployer SA..."
gcloud auth activate-service-account --key-file=$FE_KEY

echo "Submitting Cloud Build..."
cd $BUILD_DIR
gcloud builds submit . \
  --config=cloudbuild.yaml \
  --project=$PROJECT \
  --service-account=$FE_SA \
  --substitutions=_API_URL=$API_URL
```

Make executable:
```bash
chmod +x arco-ibf/_build_fe.sh
```

Run:
```bash
cd /data/08-2023/working_notes_jupyter/ignore_nka_gitrepos/pam_team/crma
bash arco-ibf/_build_fe.sh
```
