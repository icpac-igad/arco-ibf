#!/usr/bin/env python3
"""
Build curated storyline MDX files from
  /data/08-2023/working_notes_jupyter/ignore_nka_gitrepos/ea-impact-events/
    storylines/events/{folder}/summary.md
and matching images, then upload everything to gs://crma-mdx-store/.

For each of the 22 IBF case studies (11 flood + 11 drought) this script:

  1. reads {folder}/summary.md       (curated narrative + impacts + drivers)
  2. reads {folder}/image.jpg + .txt (optional figure + caption metadata)
  3. emits  arco-ibf/app/content/events/rk/{hp}-rk-{Dis No}.mdx
       — frontmatter matches the existing rk/ MDX schema with source flag
         "IBF storyline" so generate_event_mdx.py can be taught to skip them
       — body opens with the existing <CountryHeader> component
       — narrative is the summary.md content pasted verbatim
       — closes with <MediaGallery prefix="rk/{Dis No}/" /> when an image exists
  4. uploads image to gs://crma-mdx-store/media/rk/{Dis No}/image.jpg
  5. uploads MDX to gs://crma-mdx-store/rk/{hp}-rk-{Dis No}.mdx
  6. invokes convert_media_to_webm.refresh_manifest() at the end

Mapping (folder → Dis No) was derived from
  storylines/em-data-11events.md
and is hardcoded below so the script doesn't need to parse the table.

Usage:
  micromamba run -n zarrv3 python3 scripts/build_storylines_mdx.py \\
      [--dry-run] [--no-upload] [--folder NAME]
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import NamedTuple

from google.cloud import storage as gcs

STORYLINES_DIR = Path(
    "/data/08-2023/working_notes_jupyter/ignore_nka_gitrepos/"
    "ea-impact-events/storylines/events"
)
RK_OUT_DIR = Path(__file__).parent.parent / "app" / "content" / "events" / "rk"
BUCKET = "crma-mdx-store"


class EventMeta(NamedTuple):
    folder: str
    dis_no: str
    name: str
    iso: str
    country: str
    hazard: str           # "flood" or "drought"
    severity: str         # "moderate" | "high" | "severe" | "extreme" | "unknown"
    period: str           # "MM/YYYY — MM/YYYY" or "YYYY — MM/YYYY" etc.
    year: int
    month: int


EVENTS: list[EventMeta] = [
    # ── flood (folder prefix "{NN}_…") ─────────────────────────────────────
    EventMeta("01_burundi_flood_2024",         "2024-0232-BDI",  "Flood: Burundi 2024",                "BDI", "Burundi",     "flood", "high",     "04/2024 — 05/2024", 2024, 4),
    EventMeta("02_djibouti_flood_2019",        "2019-0579-DJI",  "Flood: Djibouti City 2019",          "DJI", "Djibouti",    "flood", "high",     "11/2019 — 11/2019", 2019, 11),
    EventMeta("03_eritrea_flood_2019",         "2019-IBF03-ERI", "Flood: Eritrea Highlands 2019",      "ERI", "Eritrea",     "flood", "unknown",  "08/2019 — 08/2019", 2019, 8),
    EventMeta("04_ethiopia_flood_2021",        "2021-0343-ETH",  "Flood: Addis / Akaki River 2021",    "ETH", "Ethiopia",    "flood", "moderate", "05/2021 — 05/2021", 2021, 5),
    EventMeta("05_kenya_flood_2024",           "2024-0247-KEN",  "Flood: Nairobi 2024",                "KEN", "Kenya",       "flood", "moderate", "04/2024 — 04/2024", 2024, 4),
    EventMeta("06_rwanda_flood_2023",          "2023-0267-RWA",  "Flood: Rwanda 2023",                 "RWA", "Rwanda",      "flood", "moderate", "05/2023 — 05/2023", 2023, 5),
    EventMeta("07_sudan_flood_2019",           "2019-0392-SDN",  "Flood: Khartoum 2019",               "SDN", "Sudan",       "flood", "high",     "07/2019 — 09/2019", 2019, 7),
    EventMeta("08_somalia_flood_2023",         "2023-0741-SOM",  "Flood: Somalia South 2023",          "SOM", "Somalia",     "flood", "severe",   "09/2023 — 11/2023", 2023, 9),
    EventMeta("09_south_sudan_flood_2019",     "2019-0486-SSD",  "Flood: South Sudan Upper Nile 2019", "SSD", "South Sudan", "flood", "high",     "10/2019 — 10/2019", 2019, 10),
    EventMeta("10_tanzania_flood_2024",        "2024-0203-TZA",  "Flood: Dar es Salaam 2024",          "TZA", "Tanzania",    "flood", "high",     "04/2024 — 05/2024", 2024, 4),
    EventMeta("11_uganda_flood_2019",          "2019-0254-UGA",  "Flood: Uganda 2019",                 "UGA", "Uganda",      "flood", "moderate", "05/2019 — 05/2019", 2019, 5),
    # ── drought (folder prefix "dr_{NN}_…") ────────────────────────────────
    EventMeta("dr_01_burundi_drought_2021",    "2021-IBF01-BDI", "Drought: Burundi 2021–2022",                  "BDI", "Burundi",     "drought", "unknown",  "01/2021 — 12/2022", 2021, 1),
    EventMeta("dr_02_djibouti_drought_2022",   "2022-9370-DJI",  "Drought: Djibouti 2022",                      "DJI", "Djibouti",    "drought", "high",     "06/2022 — 07/2022", 2022, 6),
    EventMeta("dr_03_eritrea_drought_2021",    "2021-IBF03-ERI", "Drought: Eritrea Central Highlands 2021–23",  "ERI", "Eritrea",     "drought", "unknown",  "01/2021 — 12/2023", 2021, 1),
    EventMeta("dr_04_ethiopia_drought_2021",   "2021-9546-ETH",  "Drought: Ethiopia Blue Nile Headwaters",      "ETH", "Ethiopia",    "drought", "extreme",  "05/2021 — 02/2022", 2021, 5),
    EventMeta("dr_05_kenya_drought_2020",      "2020-9609-KEN",  "Drought: Kenya Tana / ASAL 2020–2023",        "KEN", "Kenya",       "drought", "severe",   "12/2020 — 12/2022", 2020, 12),
    EventMeta("dr_06_rwanda_drought_2016",     "2016-IBF06-RWA", "Drought: Rwanda Akagera 2016–17",             "RWA", "Rwanda",      "drought", "high",     "01/2016 — 12/2017", 2016, 1),
    EventMeta("dr_07_somalia_drought_2020",    "2020-9609-SOM",  "Drought: Somalia South-Central 2020–23",      "SOM", "Somalia",     "drought", "extreme",  "03/2021 — 12/2022", 2020, 3),
    EventMeta("dr_08_south_sudan_drought_2021", "2021-9639-SSD", "Drought: South Sudan Upper Nile 2021–23",     "SSD", "South Sudan", "drought", "extreme",  "2021 — 11/2022",    2021, 1),
    EventMeta("dr_09_sudan_drought_2022",      "2022-9788-SDN",  "Drought: Sudan Eastern States 2022",          "SDN", "Sudan",       "drought", "extreme",  "2022 — 11/2022",    2022, 1),
    EventMeta("dr_10_tanzania_drought_2021",   "2021-9848-TZA",  "Drought: Tanzania Kagera 2021–22",            "TZA", "Tanzania",    "drought", "severe",   "11/2021 — 12/2022", 2021, 11),
    EventMeta("dr_11_uganda_drought_2022",     "2022-9436-UGA",  "Drought: Uganda Karamoja 2022",               "UGA", "Uganda",      "drought", "extreme",  "07/2022 — 12/2022", 2022, 7),
]


def hazard_prefix(hazard: str) -> str:
    return "fl" if hazard == "flood" else "dr"


def read_image_caption(folder_path: Path) -> str | None:
    """Parse Caption: / Title: from image.jpg.txt — first non-empty win."""
    txt = folder_path / "image.jpg.txt"
    if not txt.exists():
        return None
    for line in txt.read_text(encoding="utf-8").splitlines():
        if line.lower().startswith("caption:"):
            return line.split(":", 1)[1].strip()
    for line in txt.read_text(encoding="utf-8").splitlines():
        if line.lower().startswith("title:"):
            return line.split(":", 1)[1].strip()
    return None


def build_mdx(evt: EventMeta) -> tuple[str, Path | None]:
    """Return (mdx_text, image_path_or_None)."""
    folder = STORYLINES_DIR / evt.folder
    summary = folder / "summary.md"
    if not summary.exists():
        raise FileNotFoundError(f"Missing {summary}")
    body = summary.read_text(encoding="utf-8").strip()

    image_path = folder / "image.jpg"
    image_caption = read_image_caption(folder) if image_path.exists() else None
    has_image = image_path.exists()

    hp = hazard_prefix(evt.hazard)

    lines: list[str] = []
    lines.append("---")
    lines.append(f'id: "{evt.dis_no}"')
    lines.append(f'name: "{evt.name}"')
    lines.append(f'country: "{evt.country}"')
    lines.append(f'iso: "{evt.iso}"')
    lines.append(f'hazard: "{evt.hazard}"')
    lines.append(f'severity: "{evt.severity}"')
    lines.append(f'period: "{evt.period}"')
    lines.append(f"year: {evt.year}")
    lines.append(f"month: {evt.month}")
    lines.append('source: "IBF storyline (curated narrative)"')
    lines.append("---")
    lines.append("")
    lines.append("<CountryHeader")
    lines.append(f'  country="{evt.country}"')
    lines.append(f'  code="{evt.iso}"')
    lines.append(f'  emdat="{"—" if "IBF" in evt.dis_no else evt.dis_no}"')
    lines.append(f'  severity="{evt.severity}"')
    lines.append(f'  period="{evt.period}"')
    lines.append("/>")
    lines.append("")
    lines.append(body)
    lines.append("")
    if has_image:
        lines.append("---")
        lines.append("")
        lines.append("## Figures")
        lines.append("")
        if image_caption:
            lines.append(f"> {image_caption}")
            lines.append("")
        lines.append(f'<MediaGallery prefix="rk/{evt.dis_no}/" />')
        lines.append("")
    return "\n".join(lines), (image_path if has_image else None)


def upload_blob(bucket: gcs.Bucket, local: Path, remote: str, dry_run: bool) -> None:
    if dry_run:
        print(f"  [dry-run] {local} → gs://{bucket.name}/{remote}")
        return
    bucket.blob(remote).upload_from_filename(str(local))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dry-run", action="store_true", help="Plan only; do not write MDX or upload")
    parser.add_argument("--no-upload", action="store_true", help="Write MDX locally but skip GCS uploads")
    parser.add_argument("--folder", help="Restrict to a single source folder name")
    args = parser.parse_args()

    selected = [e for e in EVENTS if (args.folder is None or e.folder == args.folder)]
    if not selected:
        sys.exit(f"No events match --folder {args.folder!r}")

    bucket: gcs.Bucket | None = None
    if not args.no_upload and not args.dry_run:
        bucket = gcs.Client().bucket(BUCKET)
        # Sanity check (will raise if creds are missing or wrong)
        bucket.reload()

    RK_OUT_DIR.mkdir(parents=True, exist_ok=True)

    written = 0
    img_uploaded = 0
    mdx_uploaded = 0
    skipped_no_image = 0

    for evt in selected:
        hp = hazard_prefix(evt.hazard)
        mdx_text, image_path = build_mdx(evt)
        mdx_filename = f"{hp}-rk-{evt.dis_no}.mdx"
        out_path = RK_OUT_DIR / mdx_filename

        if args.dry_run:
            print(f"  [dry-run] {evt.folder:35} → {out_path.relative_to(RK_OUT_DIR.parents[3])}  ({len(mdx_text)} chars, image={'yes' if image_path else 'no'})")
            continue

        out_path.write_text(mdx_text, encoding="utf-8")
        written += 1
        print(f"  wrote {mdx_filename} ({len(mdx_text):,} chars)")

        if args.no_upload or bucket is None:
            continue

        # Upload MDX
        upload_blob(bucket, out_path, f"rk/{mdx_filename}", dry_run=False)
        mdx_uploaded += 1

        # Upload image (if any)
        if image_path is not None:
            remote_img = f"media/rk/{evt.dis_no}/image.jpg"
            upload_blob(bucket, image_path, remote_img, dry_run=False)
            img_uploaded += 1
        else:
            skipped_no_image += 1
            print(f"    (no image for this folder — skipping media upload)")

    if args.dry_run:
        return

    print(f"\nWrote {written} MDX, uploaded {mdx_uploaded} MDX + {img_uploaded} images.")
    print(f"  {skipped_no_image} events had no image — MediaGallery section is omitted in those MDX files.")

    if args.no_upload or bucket is None:
        return

    # Refresh manifest so the FE sees the new MDX + media
    print("\nRefreshing manifest …")
    try:
        sys.path.insert(0, str(Path(__file__).parent))
        from convert_media_to_webm import refresh_manifest  # noqa: WPS433
        refresh_manifest(bucket)
    except Exception as e:  # noqa: BLE001
        print(f"  [warn] manifest refresh failed: {type(e).__name__}: {e}")


if __name__ == "__main__":
    main()
