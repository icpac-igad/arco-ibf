# CRMA MDX → GCS Plan

## Current state (what exists today)

```
Browser
  → GET /api/event-mdx?hazard=drought&stage=risk-knowledge&period=2021-05
      → Next.js API route: app/api/event-mdx/route.ts
          → loadEventMdx() in app/lib/load-event-mdx.ts
              → fs.readFileSync(app/content/events/rk/dr-rk-2021-05.mdx)
              → gray-matter (frontmatter)
              → next-mdx-remote/serialize (compile MDX → React tree)
              → return { meta, mdxSource }
```

**MDX files are read from disk** — they are baked into the Docker image at build time via:
```dockerfile
COPY --from=builder /app/app/content ./app/content
```

---

## The problem to solve

1. Non-technical editors can't update MDX without a full rebuild + redeploy
2. As the corpus grows (PNG/GIF media embedded), the image gets large → slow cold starts
3. The MDX + media lifecycle should be decoupled from code deploys

---

## Constraint that cannot change

**MDX serialization must stay in the Next.js container.** `next-mdx-remote/serialize` is a Node.js library that compiles MDX into a serialized React component tree. FastAPI (Python) cannot do this. The FastAPI `crma-api` can only serve **raw MDX text** — the Next.js frontend must still receive it and call `serialize()`.

---

## Proposed architecture

```
[Editor] ─── gsutil cp / web UI ──► [GCS bucket: crma-mdx-store (PRIVATE)]
                                           │
                                    bucket layout:
                                    /events/rk/dr-rk-2021-05.mdx
                                    /events/rm/fl-rm-2023-11.mdx
                                    /media/dr-rk-2021-05-fig1.png
                                    /manifest.json
                                           │
                              ┌────────────▼──────────────┐
                              │  crma-api (FastAPI)        │
                              │  GET /api/mdx/manifest     │
                              │  GET /api/mdx/raw/{path}   │
                              └────────────┬──────────────┘
                                           │ raw MDX string
                              ┌────────────▼──────────────┐
                              │  crma-frontend (Next.js)   │
                              │  /api/event-mdx            │
                              │    1. fetch raw from API   │
                              │    2. serialize (Node.js)  │
                              │    3. in-memory LRU cache  │
                              │    4. return to browser    │
                              └───────────────────────────┘
```

---

## Auth: how each service accesses the private GCS bucket

### crma-api (FastAPI Cloud Run) → GCS

Cloud Run services automatically get **Application Default Credentials (ADC)** from their attached service account. The `crma-api` SA needs `storage.objectViewer` on the bucket.

```python
# No explicit credentials needed — ADC is automatic on Cloud Run
from google.cloud import storage

client = storage.Client()  # uses ADC
bucket = client.bucket("crma-mdx-store")
blob = bucket.blob(f"events/{path}")
raw_mdx = blob.download_as_text()
```

**The SA already has `storage.objectViewer`** — this was provisioned by the `crma-fe-cr` SA terraform. You need to verify the `crma-api` SA also has it (check `cno-e4drr/devops/crma-api-cr/service_account/main.tf`).

### crma-frontend (Next.js Cloud Run) → crma-api

The FE does **not** call GCS directly. It calls the internal `crma-api`. The SA has `run.invoker` on `crma-api`, provisioned in terraform.

**But the Next.js rewrite in `next.config.js` does NOT carry auth headers** — this is the known issue. The rewrite is a dumb HTTP proxy. The fix is to replace the rewrite with a **Next.js API route** that fetches with an identity token:

```typescript
// app/api/mdx-proxy/route.ts  (NEW — replaces the next.config.js rewrite for MDX)
import { NextRequest, NextResponse } from 'next/server';
import { GoogleAuth } from 'google-auth-library';

const auth = new GoogleAuth();

export async function GET(request: NextRequest) {
  const apiUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
  const path = request.nextUrl.searchParams.get('path');

  // Get identity token for Cloud Run service-to-service auth
  const client = await auth.getIdTokenClient(apiUrl!);
  const res = await client.request({ url: `${apiUrl}/api/mdx/raw/${path}` });

  return NextResponse.json(res.data);
}
```

This uses ADC (the FE SA's credentials, automatically available in Cloud Run) to get a signed identity token and attach it to the request to `crma-api`.

---

## Issues to pinpoint (from previous discussions)

### Issue 1: `next.config.js` rewrites don't carry auth → API calls fail

The current `/api/*` rewrite proxies to `crma-api` without a GCP identity token. Since the API has `ingress=internal`, the FE Cloud Run CAN reach it network-wise (same project, internal ingress), but the service also requires invoker auth (`--no-allow-unauthenticated`). The rewrite sends an unauthenticated request → 403.

**Fix:** Replace the rewrite for sensitive endpoints with explicit Next.js API routes that use `google-auth-library` to attach identity tokens.

### Issue 2: MDX serialization coupling

The MDX serialize step uses `next-mdx-remote/serialize`. This must run in the Next.js process. FastAPI can only serve raw `.mdx` text — it cannot pre-serialize. The frontend must always receive raw MDX and call serialize locally.

**Implication for caching:** The in-memory cache (`Map<key, serialized>`) must live in the Next.js process. If Cloud Run spins up a new instance, the cache is cold. This is acceptable — each request for a cold key does one fetch to the API + one serialize (~10-50ms).

### Issue 3: PNG/GIF media in MDX

If MDX files reference images like `![map](./dr-rk-2021-05-fig1.png)`, those image URLs will break unless the images are also served. Options:

**Option A — Store media in GCS, serve via signed URLs or public CDN path:**
- FastAPI adds `GET /api/mdx/media/{filename}` — streams from GCS
- MDX references use absolute URLs: `![map](/api/mdx/media/dr-rk-2021-05-fig1.png)`

**Option B — Embed images as base64 in the MDX:**
- During `generate_event_mdx.py`, images are base64-encoded and embedded inline
- No separate media endpoint needed
- Increases MDX file size (~30% larger than binary)

Option A is cleaner for large images. Option B is simpler for small diagrams.

### Issue 4: Bucket privacy + manifest freshness

The GCS bucket should be private (no `allUsers` reader). The `crma-api` SA reads from it via ADC. The manifest (`manifest.json`) is updated by:
- `generate_event_mdx.py` after generating files, or
- A GCS trigger → Cloud Function → update manifest

For a simple start, `generate_event_mdx.py` uploads files and regenerates `manifest.json` after each run:
```python
import json, hashlib
from google.cloud import storage

client = storage.Client()
bucket = client.bucket("crma-mdx-store")

# Upload MDX file
blob = bucket.blob(f"events/rk/{filename}")
blob.upload_from_filename(local_path)

# Regenerate manifest
manifest = {}
for b in bucket.list_blobs(prefix="events/"):
    manifest[b.name] = {"hash": b.md5_hash, "updated": b.updated.isoformat()}
bucket.blob("manifest.json").upload_from_string(json.dumps(manifest))
```

---

## Step-by-step implementation plan

### Step 1: Create GCS bucket + upload existing MDX

```bash
gsutil mb -p e4drr-crafd -l us-central1 gs://crma-mdx-store
gsutil iam ch -d allUsers gs://crma-mdx-store  # ensure private
gsutil -m cp -r app/content/events/* gs://crma-mdx-store/events/

# Grant crma-api SA read access
gsutil iam ch \
  serviceAccount:crma-api-runner@e4drr-crafd.iam.gserviceaccount.com:objectViewer \
  gs://crma-mdx-store
```

### Step 2: Add MDX endpoints to crma-api (FastAPI)

Add to `cno-e4drr/devops/crma-api-cr/app.py`:
```python
from google.cloud import storage as gcs

GCS_BUCKET = os.environ.get("MDX_BUCKET", "crma-mdx-store")
_gcs_client = None

def get_gcs():
    global _gcs_client
    if _gcs_client is None:
        _gcs_client = gcs.Client()  # ADC
    return _gcs_client

@app.get("/api/mdx/manifest")
async def mdx_manifest():
    blob = get_gcs().bucket(GCS_BUCKET).blob("manifest.json")
    return JSONResponse(json.loads(blob.download_as_text()))

@app.get("/api/mdx/raw/{path:path}")
async def mdx_raw(path: str):
    blob = get_gcs().bucket(GCS_BUCKET).blob(f"events/{path}")
    if not blob.exists():
        raise HTTPException(404)
    return PlainTextResponse(blob.download_as_text())
```

### Step 3: Rewrite `load-event-mdx.ts` to fetch from API

Replace disk read with API fetch + in-memory cache:

```typescript
// app/lib/load-event-mdx.ts
import matter from 'gray-matter';
import { serialize } from 'next-mdx-remote/serialize';

const API = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8000';
const mdxCache = new Map<string, { hash: string; result: any }>();

function buildMdxKey(hazard: string, stage: string, dateKey: string): string {
  const hp = ({ drought: 'dr', flood: 'fl' } as any)[hazard] ?? hazard.slice(0, 2);
  const tab = ({ 'risk-knowledge': 'rk', 'risk-monitoring': 'rm', 'risk-decisions': 'rd' } as any)[stage] ?? 'rk';
  return `${tab}/${hp}-${tab}-${dateKey}.mdx`;
}

export async function loadEventMdx(hazard: string, stage: string, dateKey: string) {
  const key = buildMdxKey(hazard, stage, dateKey);

  // Fetch manifest hash to check staleness
  let manifestHash: string | null = null;
  try {
    const manifest = await fetch(`${API}/api/mdx/manifest`).then(r => r.json());
    manifestHash = manifest.files?.[`events/${key}`]?.hash ?? null;
  } catch { /* fallback: always fetch */ }

  // Cache hit
  const cached = mdxCache.get(key);
  if (cached && manifestHash && cached.hash === manifestHash) {
    return cached.result;
  }

  // Fetch raw MDX
  const res = await fetch(`${API}/api/mdx/raw/${key}`);
  if (!res.ok) {
    // Fallback to month-level key for daily requests
    if (dateKey.length === 10) {
      return loadEventMdx(hazard, stage, dateKey.slice(0, 7));
    }
    return null;
  }

  const raw = await res.text();
  const { data, content } = matter(raw);
  const mdxSource = await serialize(content, { parseFrontmatter: false });
  const result = { meta: data, mdxSource };

  mdxCache.set(key, { hash: manifestHash ?? '', result });
  return result;
}
```

### Step 4: Fix the auth issue (Next.js → crma-api)

Install `google-auth-library` in the FE:
```bash
yarn add google-auth-library
```

Create an authenticated fetch helper:
```typescript
// app/lib/api-fetch.ts
import { GoogleAuth } from 'google-auth-library';

const auth = new GoogleAuth();
const API = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8000';

export async function apiFetch(path: string): Promise<Response> {
  // In local dev, no auth needed
  if (!process.env.NEXT_PUBLIC_API_BASE_URL || API.includes('localhost')) {
    return fetch(`${API}${path}`);
  }
  // On Cloud Run, get identity token for service-to-service auth
  const client = await auth.getIdTokenClient(API);
  const headers = await client.getRequestHeaders();
  return fetch(`${API}${path}`, { headers });
}
```

Use `apiFetch` instead of raw `fetch` in `load-event-mdx.ts`.

### Step 5: Update Dockerfile — remove app/content/events

```dockerfile
# Remove this line:
# COPY --from=builder /app/app/content ./app/content

# Keep public/ for static assets (topojson, etc.)
COPY --from=builder /app/public ./public
```

### Step 6: Set MDX_BUCKET env var on crma-api Cloud Run

```bash
gcloud run services update crma-api \
  --region=us-central1 \
  --project=e4drr-crafd \
  --set-env-vars=MDX_BUCKET=crma-mdx-store
```

---

## Summary of what changes where

| Component | Change |
|---|---|
| `app/lib/load-event-mdx.ts` | Replace `fs.readFileSync` with `apiFetch` to `crma-api` |
| `app/lib/api-fetch.ts` | NEW — authenticated fetch using ADC/identity token |
| `cno-e4drr/devops/crma-api-cr/app.py` | Add `/api/mdx/manifest` + `/api/mdx/raw/{path}` |
| `cno-e4drr/devops/crma-fe-cr/Dockerfile` | Remove `COPY app/content` line |
| `generate_event_mdx.py` | Upload to GCS instead of writing to disk |
| `next.config.js` | No change needed (rewrite stays for emdat endpoints if API is made public-within-VPC) |
| GCS | Create `crma-mdx-store` bucket (private) |

---

## Known remaining issue: crma-api auth

The current `next.config.js` rewrite for `/api/emdat-*` also doesn't carry auth tokens. If `crma-api` is `ingress=internal` AND requires invoker auth, those calls also fail via the rewrite. Fixing this requires either:
- Making `crma-api` `--allow-unauthenticated` but `ingress=internal` (internal traffic doesn't need auth token — Cloud Run accepts it because it comes from within the project's VPC)
- Or replacing all API rewrites with explicit Next.js API routes that attach identity tokens

The safest: set `crma-api` to `--allow-unauthenticated --ingress=internal`. This means only traffic from within the GCP project (other Cloud Run services, VMs) can reach it — no internet access possible — so unauthenticated is acceptable.
