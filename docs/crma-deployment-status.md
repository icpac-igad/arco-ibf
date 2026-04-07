# CRMA Deployment Status — 2026-04-07

## Overview

The CRMA dashboard has two deployed Cloud Run services in GCP project `e4drr-crafd` (`us-central1`):

| Service | URL | Auth |
|---|---|---|
| `crma-api` | `https://crma-api-yiyrp6yumq-uc.a.run.app` | Private (ingress: internal) |
| `crma-frontend` | `https://crma-frontend-yiyrp6yumq-uc.a.run.app` | Public (allow-unauthenticated) |

---

## Frontend (`crma-frontend`)

### Source code
- **Repo:** `arco-ibf` (this repo, branch `cmra-web`)
- **Framework:** Next.js (TypeScript)
- **Content:** `app/` — React components, D3 calendar, choropleth map, MDX markdown panels

### How the Docker image is built

The Dockerfile and `cloudbuild.yaml` live in:
```
cno-e4drr/devops/crma-fe-cr/Dockerfile
cno-e4drr/devops/crma-fe-cr/cloudbuild.yaml
```

**Build flow:**
1. The entire `arco-ibf` source tree is copied to `/tmp/crma-fe-build/`
2. `output: 'standalone'` is patched into `next.config.js` in the temp directory (the source repo does NOT have this — it's added at build time)
3. `gcloud builds submit` is run from `/tmp/crma-fe-build/` with `--config=cloudbuild.yaml`
4. Cloud Build (machine: `E2_HIGHCPU_8`) runs a multi-stage Docker build:
   - **Stage 1 (`builder`):** `node:20-slim`, installs deps via `yarn install --frozen-lockfile`, runs `yarn build` with `NEXT_PUBLIC_API_BASE_URL` injected as build arg
   - **Stage 2 (`runner`):** copies `.next/standalone`, `.next/static`, `public/`, and `app/content/` (MDX files)
5. Image pushed to `us-central1-docker.pkg.dev/e4drr-crafd/crma/crma-frontend:latest`
6. Deployed to Cloud Run: `max-instances=2`, `concurrency=40`, `min-instances=0`

**Key point:** The MDX files (`app/content/`) are **baked into the Docker image** at build time. They are not served from GCS or fetched at runtime.

### API proxy
`next.config.js` has a rewrite rule:
```js
source: '/api/:path*',
destination: `${process.env.NEXT_PUBLIC_API_BASE_URL}/api/:path*`
```
So all `/api/*` calls from the browser go to the FE Cloud Run, which proxies to `crma-api`. The `NEXT_PUBLIC_API_BASE_URL` is baked in at Docker build time via `--build-arg`.

**Known issue:** The Next.js rewrite is a dumb HTTP proxy — it does not inject GCP identity tokens. The API is set to `ingress=internal`, so the FE Cloud Run can reach it from within GCP, but the rewrite itself doesn't carry auth headers. This was left unresolved after initial deployment (the page loads, API calls may fail depending on whether internal-ingress alone is sufficient without invoker auth).

### Scaling / cost guard
- `max-instances=2`, `concurrency=40` → max 80 simultaneous users before 503
- `min-instances=0` → scales to zero when idle
- Service account: `crma-fe-deployer@e4drr-crafd.iam.gserviceaccount.com`

---

## Backend (`crma-api`)

### Source code
- **Repo:** `cno-e4drr/devops/crma-api-cr/app.py` (deployed separately)
- **Also present:** `arco-ibf/app.py` — this is a local/dev version of the same FastAPI app

### What it serves
```
GET /api/emdat-monthly-risk?type=drought|flood
GET /api/emdat-month-regions/{event_key}
GET /api/emdat-event-markdown/{event_key}
```

Reads EM-DAT parquet files (`data/emdat_drought_adm1.parquet`, `data/emdat_flood_adm1.parquet`) bundled into the API container.

---

## MDX content — current status and plan

### Current: bundled in FE image
- MDX files in `app/content/` are copied into the Docker image (`COPY --from=builder /app/app/content ./app/content`)
- Generated locally by `generate_mdx.py` / `generate_event_mdx.py`
- To update MDX, a full image rebuild and redeploy is required

### Planned: serve MDX via API (not yet implemented)
- The plan in `2026-04-01-crma-gcs-mdx.txt` discussed serving MDX files from GCS via the FastAPI backend
- The FE SA has `storage.objectViewer` IAM role already provisioned (ready for GCS access)
- The `api_invoker` IAM binding on `crma-api` for the FE SA is also provisioned
- **This has not been implemented yet** — MDX is still baked into the FE image

---

## Terraform / infra

All infra-as-code lives in `cno-e4drr/devops/`:
```
devops/crma-api-cr/          — API Cloud Run terraform + cloudbuild.yaml
devops/crma-fe-cr/
  Dockerfile                 — multi-stage Next.js build
  cloudbuild.yaml            — Cloud Build config
  terraform/                 — Cloud Run service terraform
  service_account/           — SA + IAM terraform
    main.tf                  — SA, IAM bindings (AR writer, run.admin, storage viewer, api_invoker)
    outputs.tf
    variables.tf
```

---

## To redeploy frontend

```bash
# 1. Copy arco-ibf source to temp dir
BUILD_DIR="/tmp/crma-fe-build"
rsync -a --exclude='.git' --exclude='node_modules' --exclude='.next' \
  /data/08-2023/working_notes_jupyter/ignore_nka_gitrepos/pam_team/crma/arco-ibf/ \
  $BUILD_DIR/

# 2. Patch next.config.js for standalone output (if not already present)
# Add: output: 'standalone', inside module.exports

# 3. Copy cloudbuild.yaml + Dockerfile from cno-e4drr
cp /data/08-2023/working_notes_jupyter/ignore_nka_gitrepos/cno-e4drr/devops/crma-fe-cr/Dockerfile $BUILD_DIR/
cp /data/08-2023/working_notes_jupyter/ignore_nka_gitrepos/cno-e4drr/devops/crma-fe-cr/cloudbuild.yaml $BUILD_DIR/

# 4. Submit build
cd $BUILD_DIR
gcloud builds submit . \
  --config=cloudbuild.yaml \
  --project=e4drr-crafd \
  --substitutions=_API_URL=https://crma-api-yiyrp6yumq-uc.a.run.app
```
