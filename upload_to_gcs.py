"""
Upload MDX files and parquet data to GCS bucket, then regenerate manifest.json.

Bucket layout (gs://crma-mdx-store):
  /rk/*.mdx                           — Risk Knowledge MDX files
  /rm/*.mdx                           — Risk Monitoring MDX files
  /rd/*.mdx                           — Risk Decisions MDX files
  /parquet/*.parquet                  — EM-DAT parquet data files
  /media/{tab}/{dis-no}/{file}        — binary assets referenced from MDX
  /manifest.json                      — hash index for change detection by the frontend

Usage:
  python upload_to_gcs.py                         # upload everything
  python upload_to_gcs.py --mdx-only              # MDX files only
  python upload_to_gcs.py --parquet-only          # parquet files only
  python upload_to_gcs.py --media-only            # media files only
  python upload_to_gcs.py --media-src /data/data-nodelete/crma-mdx-store/media
  python upload_to_gcs.py --bucket my-other-bucket

Requires:
  pip install google-cloud-storage
  gcloud auth application-default login   # or use a service account key
"""

import argparse
import base64
import json
import mimetypes
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
# Default media source is the local mirror, which tracks the bucket layout 1:1.
DEFAULT_MEDIA_SRC = Path("/data/data-nodelete/crma-mdx-store/media")
MEDIA_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".mp4", ".webm"}

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


def upload_media(bucket: gcs.Bucket, src_dir: Path, dry_run: bool = False) -> dict:
    """
    Upload media assets from {src_dir}/** → gs://{bucket}/media/{rel_path}.
    src_dir is expected to already mirror the bucket layout, e.g.
      /data/data-nodelete/crma-mdx-store/media/rm/fl-rm-2026-04-08/peak.png
    Returns manifest entries.
    """
    manifest_entries = {}
    if not src_dir.exists():
        print(f"  [skip] media source {src_dir} does not exist")
        return manifest_entries

    total = 0
    skipped = 0
    for local_path in sorted(src_dir.rglob("*")):
        if not local_path.is_file():
            continue
        if local_path.suffix.lower() not in MEDIA_EXTENSIONS:
            skipped += 1
            continue
        rel = local_path.relative_to(src_dir).as_posix()
        gcs_path = f"media/{rel}"
        content_type, _ = mimetypes.guess_type(local_path.name)
        size_kb = local_path.stat().st_size // 1024
        print(f"  {gcs_path} ({size_kb}KB, {content_type or 'binary'})")

        if not dry_run:
            blob = bucket.blob(gcs_path)
            blob.upload_from_filename(
                str(local_path),
                content_type=content_type or "application/octet-stream",
            )
            blob.reload()
            manifest_entries[gcs_path] = {
                "hash": _b64_to_hex(blob.md5_hash),
                "updated": blob.updated.isoformat(),
                "size": blob.size,
            }
        else:
            manifest_entries[gcs_path] = {"hash": "dry-run", "updated": "", "size": 0}
        total += 1

    print(f"  uploaded {total} media files ({skipped} skipped — unsupported extension)")
    return manifest_entries


def write_manifest(bucket: gcs.Bucket, entries: dict, merge: bool = True, dry_run: bool = False):
    """
    Write manifest.json in the bucket root. When merge=True, existing entries
    are preserved and only the provided entries are overwritten — this lets
    partial runs (--mdx-only, --media-only, ...) update the manifest without
    wiping unrelated sections.
    """
    final_entries = {}
    if merge:
        blob = bucket.blob("manifest.json")
        if blob.exists():
            try:
                existing = json.loads(blob.download_as_text())
                final_entries = dict(existing.get("files", {}))
            except Exception as e:
                print(f"  [warn] could not read existing manifest, starting fresh: {e}")
    final_entries.update(entries)

    manifest = {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "files": final_entries,
    }
    content = json.dumps(manifest, indent=2)

    if dry_run:
        print(f"\n[dry-run] manifest.json would contain {len(final_entries)} entries")
        return

    blob = bucket.blob("manifest.json")
    blob.upload_from_string(content, content_type="application/json")
    print(f"\n  manifest.json written — {len(final_entries)} entries ({len(entries)} updated)")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(description="Upload CRMA data to GCS bucket")
    parser.add_argument("--bucket", default=DEFAULT_BUCKET, help="GCS bucket name")
    parser.add_argument("--mdx-only", action="store_true", help="Upload MDX files only")
    parser.add_argument("--parquet-only", action="store_true", help="Upload parquet files only")
    parser.add_argument("--media-only", action="store_true", help="Upload media files only")
    parser.add_argument(
        "--media-src",
        default=str(DEFAULT_MEDIA_SRC),
        help=f"Local media source directory (default: {DEFAULT_MEDIA_SRC})",
    )
    parser.add_argument("--dry-run", action="store_true", help="Print what would be uploaded, no actual upload")
    args = parser.parse_args()

    # Mutually exclusive "only" flags — picking one disables the others.
    any_only = args.mdx_only or args.parquet_only or args.media_only
    do_mdx = args.mdx_only or not any_only
    do_parquet = args.parquet_only or not any_only
    do_media = args.media_only or not any_only

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

    if do_media:
        print("\nMedia files:")
        manifest_entries.update(upload_media(bucket, Path(args.media_src), dry_run=args.dry_run))

    print("\nManifest:")
    # Merge by default so partial runs don't wipe unrelated sections.
    write_manifest(bucket, manifest_entries, merge=any_only, dry_run=args.dry_run)

    print("\nDone.")
    if not args.dry_run:
        print(f"Bucket URL: gs://{args.bucket}")
        print(f"Total files: {len(manifest_entries)}")


if __name__ == "__main__":
    main()
