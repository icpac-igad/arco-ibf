#!/usr/bin/env python3
"""
Convert media files under gs://crma-mdx-store/media/ to web-friendly formats.

Image conversions (Pillow):
  .png .jpg .jpeg  →  .webp (lossless when source is .png, q=85 otherwise)

Animation / video conversions (ffmpeg, libvpx-vp9):
  .gif  →  .webm
  .mp4  →  .webm  (audio stripped, single-pass CRF 30)

Idempotent — skips conversion when the target object exists in the bucket
and its updated timestamp is at or after the source's.

GIF/MP4 sibling collision: if both .gif and .mp4 exist with the same stem,
list_blobs alphabetical order processes .gif first → .webm. The .mp4 then
sees the target exists and skips, keeping the WebM produced from the
higher-fidelity .gif.

Tools required (already present in micromamba env `zarrv3`):
  - Pillow with WebP support
  - ffmpeg with libvpx-vp9

Usage:
  micromamba run -n zarrv3 python3 scripts/convert_media_to_webm.py \\
      [--prefix rm/fl-rm-2026-04-08/] [--bucket crma-mdx-store] \\
      [--dry-run] [--remove-originals]

ADC must be configured (e.g. via
  gcloud auth activate-service-account \\
      --key-file=cno-e4drr/coiled/coiled-data-e4drr.json
).
"""

from __future__ import annotations

import argparse
import base64
import binascii
import json
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image
from google.cloud import storage as gcs

BUCKET_DEFAULT = "crma-mdx-store"
MEDIA_PREFIX = "media/"

IMAGE_EXTS = {".png", ".jpg", ".jpeg"}
VIDEO_EXTS = {".gif", ".mp4"}


def ensure_tools(use_ffmpeg: bool) -> str | None:
    """Confirm Pillow's WebP support + locate ffmpeg if videos are in scope."""
    try:
        from PIL import features  # noqa: WPS433 (inline import to keep top-level minimal)

        if not features.check("webp"):
            sys.exit("ERROR: Pillow WebP support missing. Install: pip install -U 'Pillow[webp]'")
    except ImportError:
        sys.exit("ERROR: Pillow not installed. Install: pip install -U Pillow")

    if not use_ffmpeg:
        return None
    ffmpeg = shutil.which("ffmpeg")
    if ffmpeg:
        return ffmpeg
    # Fallback: well-known micromamba env path
    fallback = "/srv/micromamba/envs/zarrv3/bin/ffmpeg"
    if Path(fallback).exists():
        return fallback
    sys.exit(
        "ERROR: ffmpeg not on PATH and not at the zarrv3 fallback. Run via "
        "`micromamba run -n zarrv3 ...` or install ffmpeg system-wide."
    )


def convert_image_to_webp(src: Path, dst: Path) -> None:
    img = Image.open(src)
    # Use lossless for PNG sources (line graphics, maps); lossy q=85 otherwise.
    if src.suffix.lower() == ".png":
        img.save(dst, "WEBP", lossless=True, method=6)
    else:
        img.save(dst, "WEBP", quality=85, method=6)


def convert_video_to_webm(src: Path, dst: Path, ffmpeg: str, crf: int = 30) -> None:
    subprocess.run(
        [
            ffmpeg,
            "-y", "-i", str(src),
            "-c:v", "libvpx-vp9",
            "-crf", str(crf), "-b:v", "0",
            "-an",  # strip audio (none of our sources have meaningful audio)
            "-pix_fmt", "yuv420p",
            "-row-mt", "1",
            str(dst),
        ],
        check=True,
        capture_output=True,
    )


def target_name(blob_name: str, ext_in: str) -> str:
    suffix = ".webp" if ext_in in IMAGE_EXTS else ".webm"
    return str(Path(blob_name).with_suffix(suffix)).replace("\\", "/")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--bucket", default=BUCKET_DEFAULT, help="GCS bucket name")
    parser.add_argument(
        "--prefix", default="",
        help="Prefix under media/ to scan, e.g. 'rm/fl-rm-2026-04-08/'. Empty = all media",
    )
    parser.add_argument("--dry-run", action="store_true", help="Plan only, do not convert or upload")
    parser.add_argument("--remove-originals", action="store_true",
                        help="Delete source blob after successful conversion + upload")
    parser.add_argument("--force", action="store_true",
                        help="Re-convert even if target already exists and is newer")
    args = parser.parse_args()

    full_prefix = MEDIA_PREFIX + args.prefix.lstrip("/")
    print(f"Scanning gs://{args.bucket}/{full_prefix}*")

    client = gcs.Client()
    bucket = client.bucket(args.bucket)

    # Pull the listing first so we know whether we need ffmpeg before checking tools.
    candidates: list[tuple[gcs.Blob, str]] = []
    for blob in bucket.list_blobs(prefix=full_prefix):
        ext = Path(blob.name).suffix.lower()
        if ext in IMAGE_EXTS or ext in VIDEO_EXTS:
            candidates.append((blob, ext))

    if not candidates:
        print("  (nothing to convert)")
        return

    needs_video = any(ext in VIDEO_EXTS for _, ext in candidates)
    ffmpeg = ensure_tools(use_ffmpeg=needs_video)

    converted = 0
    skipped = 0
    failed = 0

    for blob, ext in candidates:
        tname = target_name(blob.name, ext)
        target_blob = bucket.blob(tname)

        if not args.force and target_blob.exists():
            target_blob.reload()
            blob.reload()
            if target_blob.updated and blob.updated and target_blob.updated >= blob.updated:
                print(f"  [skip] {tname} already up-to-date")
                skipped += 1
                continue

        if args.dry_run:
            print(f"  [dry-run] {blob.name} ({blob.size or 0} B) → {tname}")
            continue

        print(f"  converting {blob.name} ({blob.size or 0:,} B) → {tname}", flush=True)
        try:
            with tempfile.TemporaryDirectory() as tmp:
                tmp_dir = Path(tmp)
                src = tmp_dir / Path(blob.name).name
                dst = tmp_dir / Path(tname).name

                blob.download_to_filename(str(src))

                if ext in IMAGE_EXTS:
                    convert_image_to_webp(src, dst)
                else:
                    convert_video_to_webm(src, dst, ffmpeg=ffmpeg)

                new_size = dst.stat().st_size
                target_blob.upload_from_filename(str(dst))
                src_size = blob.size or 1
                print(f"    → {new_size:,} B ({100 * new_size / src_size:.1f}% of source)")

                if args.remove_originals:
                    blob.delete()
                    print(f"    removed source gs://{args.bucket}/{blob.name}")

            converted += 1
        except subprocess.CalledProcessError as e:
            print(f"    FAILED: ffmpeg exit {e.returncode}: {e.stderr.decode()[:400]}")
            failed += 1
        except Exception as e:  # noqa: BLE001
            print(f"    FAILED: {type(e).__name__}: {e}")
            failed += 1

    print(f"\nConverted: {converted}, Skipped: {skipped}, Failed: {failed}")

    if converted > 0 and not args.dry_run:
        refresh_manifest(bucket)

    if failed:
        sys.exit(1)


def refresh_manifest(bucket: gcs.Bucket) -> None:
    """Merge new media entries into manifest.json (same shape upload_to_gcs.py writes)."""
    print("\nRefreshing manifest.json …")
    blob = bucket.blob("manifest.json")
    existing: dict = {}
    if blob.exists():
        try:
            existing = json.loads(blob.download_as_text()).get("files", {}) or {}
        except Exception as e:  # noqa: BLE001
            print(f"  [warn] could not read existing manifest, starting fresh: {e}")

    refreshed = 0
    for media_blob in bucket.list_blobs(prefix=MEDIA_PREFIX):
        ext = Path(media_blob.name).suffix.lower()
        if ext not in {*IMAGE_EXTS, *VIDEO_EXTS, ".webp", ".webm"}:
            continue
        media_blob.reload()
        existing[media_blob.name] = {
            "hash": _b64_to_hex(media_blob.md5_hash),
            "updated": media_blob.updated.isoformat() if media_blob.updated else "",
            "size": media_blob.size or 0,
        }
        refreshed += 1

    out = {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "files": existing,
    }
    blob.upload_from_string(json.dumps(out, indent=2), content_type="application/json")
    print(f"  manifest.json updated — {len(existing)} entries total, {refreshed} media entries refreshed")


def _b64_to_hex(b64: str | None) -> str:
    if not b64:
        return ""
    try:
        return binascii.hexlify(base64.b64decode(b64)).decode()
    except (binascii.Error, ValueError):
        return ""


if __name__ == "__main__":
    main()
