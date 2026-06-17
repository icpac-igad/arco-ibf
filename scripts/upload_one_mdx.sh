#!/usr/bin/env bash
# Upload (or update) a SINGLE MDX file to GCS and patch its manifest entry.
#
# Use this instead of upload_to_gcs.py when you've only touched one storyline —
# it avoids re-uploading all ~3,000 MDX files, and patches just that file's
# manifest hash so the frontend cache invalidates. No frontend rebuild needed:
# the API serves MDX from GCS at request time.
#
# Workflow:
#   1. create/edit the file locally:  app/content/events/<tab>/<name>.mdx
#   2. run:  bash scripts/upload_one_mdx.sh <tab>/<name>.mdx
#
# Examples:
#   bash scripts/upload_one_mdx.sh rk/fl-rk-2021-0343-ETH.mdx
#   bash scripts/upload_one_mdx.sh rm/dr-rm-2022-07.mdx
#
# Auth: needs an active gcloud account with write on the bucket, e.g.
#   gcloud auth activate-service-account --key-file=<sa-key>.json
set -euo pipefail

REL="${1:?usage: upload_one_mdx.sh <tab>/<filename>.mdx   (tab = rk|rm|rd)}"
BUCKET="${MDX_BUCKET:-gs://crma-mdx-store}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCAL="$ROOT/app/content/events/$REL"

[ -f "$LOCAL" ] || { echo "ERROR: local file not found: $LOCAL"; exit 1; }

echo "→ uploading $REL → $BUCKET/$REL"
gcloud storage cp "$LOCAL" "$BUCKET/$REL"

echo "→ patching manifest entry for $REL"
TMP="$(mktemp)"
gcloud storage cat "$BUCKET/manifest.json" > "$TMP"
python3 - "$TMP" "$LOCAL" "$REL" <<'PY'
import json, hashlib, datetime, sys, pathlib
mf, local, rel = sys.argv[1:4]
m = json.load(open(mf))
files = m.get("files", m)                       # supports {files:{...}} or flat {...}
data = pathlib.Path(local).read_bytes()
now = datetime.datetime.utcnow().isoformat() + "Z"
files[rel] = {"hash": hashlib.md5(data).hexdigest(), "updated": now, "size": len(data)}
if "updated_at" in m:
    m["updated_at"] = now
json.dump(m, open(mf, "w"), indent=2)
print(f"  patched {rel}  hash={files[rel]['hash']}  size={files[rel]['size']}")
PY
gcloud storage cp "$TMP" "$BUCKET/manifest.json"
rm -f "$TMP"
echo "✓ done — $REL is live in GCS (frontend picks it up on next request; no rebuild)."
