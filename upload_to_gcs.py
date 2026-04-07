"""
Upload MDX files and parquet data to GCS bucket, then regenerate manifest.json.

Bucket layout (gs://crma-mdx-store):
  /rk/*.mdx          — Risk Knowledge MDX files
  /rm/*.mdx          — Risk Monitoring MDX files
  /rd/*.mdx          — Risk Decisions MDX files
  /parquet/*.parquet — EM-DAT parquet data files
  /manifest.json     — hash index for change detection by the frontend

Usage:
  python upload_to_gcs.py                         # upload everything
  python upload_to_gcs.py --mdx-only              # MDX files only
  python upload_to_gcs.py --parquet-only          # parquet files only
  python upload_to_gcs.py --bucket my-other-bucket

Requires:
  pip install google-cloud-storage
  gcloud auth application-default login   # or use a service account key
"""

import argparse
import base64
import json
import os
from datetime import datetime, timezone
from pathlib import Path

from google.cloud import storage as gcs

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
REPO_ROOT = Path(__file__).parent
MDX_EVENTS_DIR = REPO_ROOT / "app" / "content" / "events"
PARQUET_DIR = REPO_ROOT / "data"

TABS = ("rk", "rm", "rd")
PARQUET_FILES = [
    "emdat_drought_adm1.parquet",
    "emdat_flood_adm1.parquet",
    "emdat_all_disasters_adm1.parquet",
]

DEFAULT_BUCKET = "crma-mdx-store"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _b64_to_hex(b64: str) -> str:
    """Convert GCS base64 MD5 hash to hex string."""
    return base64.b64decode(b64).hex()


def upload_mdx(bucket: gcs.Bucket, dry_run: bool = False) -> dict:
    """
    Upload all MDX files from app/content/events/{tab}/ → gs://{bucket}/{tab}/
    Returns manifest entries for uploaded files.
    """
    manifest_entries = {}
    total = 0

    for tab in TABS:
        tab_dir = MDX_EVENTS_DIR / tab
        if not tab_dir.exists():
            print(f"  [skip] {tab_dir} does not exist")
            continue

        mdx_files = sorted(tab_dir.glob("*.mdx"))
        print(f"  {tab}/ — {len(mdx_files)} files")

        for local_path in mdx_files:
            gcs_path = f"{tab}/{local_path.name}"
            if not dry_run:
                blob = bucket.blob(gcs_path)
                blob.upload_from_filename(str(local_path), content_type="text/plain; charset=utf-8")
                blob.reload()
                manifest_entries[gcs_path] = {
                    "hash": _b64_to_hex(blob.md5_hash),
                    "updated": blob.updated.isoformat(),
                    "size": blob.size,
                }
            else:
                manifest_entries[gcs_path] = {"hash": "dry-run", "updated": "", "size": 0}
            total += 1

    print(f"  uploaded {total} MDX files")
    return manifest_entries


def upload_parquet(bucket: gcs.Bucket, dry_run: bool = False) -> dict:
    """
    Upload parquet files from data/ → gs://{bucket}/parquet/
    Returns manifest entries for uploaded files.
    """
    manifest_entries = {}

    for filename in PARQUET_FILES:
        local_path = PARQUET_DIR / filename
        if not local_path.exists():
            print(f"  [skip] {local_path} not found")
            continue

        gcs_path = f"parquet/{filename}"
        print(f"  {gcs_path} ({local_path.stat().st_size // 1024}KB)")

        if not dry_run:
            blob = bucket.blob(gcs_path)
            blob.upload_from_filename(str(local_path), content_type="application/octet-stream")
            blob.reload()
            manifest_entries[gcs_path] = {
                "hash": _b64_to_hex(blob.md5_hash),
                "updated": blob.updated.isoformat(),
                "size": blob.size,
            }
        else:
            manifest_entries[gcs_path] = {"hash": "dry-run", "updated": "", "size": 0}

    print(f"  uploaded {len(manifest_entries)} parquet files")
    return manifest_entries


def write_manifest(bucket: gcs.Bucket, entries: dict, dry_run: bool = False):
    """Write/overwrite manifest.json in the bucket root."""
    manifest = {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "files": entries,
    }
    content = json.dumps(manifest, indent=2)

    if dry_run:
        print(f"\n[dry-run] manifest.json would contain {len(entries)} entries")
        return

    blob = bucket.blob("manifest.json")
    blob.upload_from_string(content, content_type="application/json")
    print(f"\n  manifest.json written — {len(entries)} entries")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(description="Upload CRMA data to GCS bucket")
    parser.add_argument("--bucket", default=DEFAULT_BUCKET, help="GCS bucket name")
    parser.add_argument("--mdx-only", action="store_true", help="Upload MDX files only")
    parser.add_argument("--parquet-only", action="store_true", help="Upload parquet files only")
    parser.add_argument("--dry-run", action="store_true", help="Print what would be uploaded, no actual upload")
    args = parser.parse_args()

    do_mdx = not args.parquet_only
    do_parquet = not args.mdx_only

    client = gcs.Client()
    bucket = client.bucket(args.bucket)

    if args.dry_run:
        print(f"[dry-run] bucket: gs://{args.bucket}")
    else:
        print(f"Uploading to gs://{args.bucket}")

    manifest_entries = {}

    if do_mdx:
        print("\nMDX files:")
        manifest_entries.update(upload_mdx(bucket, dry_run=args.dry_run))

    if do_parquet:
        print("\nParquet files:")
        manifest_entries.update(upload_parquet(bucket, dry_run=args.dry_run))

    print("\nManifest:")
    write_manifest(bucket, manifest_entries, dry_run=args.dry_run)

    print("\nDone.")
    if not args.dry_run:
        print(f"Bucket URL: gs://{args.bucket}")
        print(f"Total files: {len(manifest_entries)}")


if __name__ == "__main__":
    main()
