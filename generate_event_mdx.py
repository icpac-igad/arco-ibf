#!/usr/bin/env python3
"""
Generate per-event MDX files from EM-DAT parquet data.

One MDX file per EM-DAT event (one row per "Dis No" in the parquet), using
<CountryHeader>, <ImpactStats>, and region lists — rendered by
next-mdx-remote on the frontend.

Output:
  app/content/events/rk/{dr|fl}-rk-{dis_no_sanitised}.mdx

(rk/ is the Risk Knowledge tab — same directory `upload_to_gcs.py` already
 uploads to `gs://crma-mdx-store/rk/`. The FE's `load-event-mdx.ts` looks
 up the file as `rk/{hp}-rk-{event_key}.mdx` when stage === 'risk-knowledge',
 and applies the same sanitiser as `safe_name()` below so the lookup
 matches the file on disk.)
"""

import math
import os
import re

import pandas as pd

PARQUET_DIR = "/data/08-2023/working_notes_jupyter/ignore_nka_gitrepos/ea-impact-events/Output"
OUTPUT_BASE = os.path.join(os.path.dirname(__file__), "app", "content", "events")

# Severity heuristic based on total affected
def severity_label(affected, deaths):
    if deaths and deaths > 1000:
        return "extreme"
    if affected and affected > 5_000_000:
        return "extreme"
    if affected and affected > 1_000_000:
        return "severe"
    if affected and affected > 100_000:
        return "high"
    return "moderate"


def safe_val(v):
    if v is None or (isinstance(v, float) and math.isnan(v)):
        return None
    return v


def fmt_number(v):
    if v is None:
        return None
    v = int(v)
    if v >= 1_000_000:
        return f"{v / 1_000_000:.1f}M"
    if v >= 1_000:
        return f"{v / 1_000:.0f}K"
    return str(v)


def generate_mdx(dis_no, group_df, disaster_type):
    first = group_df.iloc[0]
    country = str(first.get("Country", "Unknown"))
    location = safe_val(first.get("Location"))
    subtype = safe_val(first.get("Disaster Subtype"))
    event_name = safe_val(first.get("Event Name"))
    start_y = safe_val(first.get("Start Year"))
    start_m = safe_val(first.get("Start Month"))
    end_y = safe_val(first.get("End Year"))
    end_m = safe_val(first.get("End Month"))
    deaths = safe_val(first.get("Total Deaths"))
    affected = safe_val(first.get("Total Affected"))
    injured = safe_val(first.get("No. Injured"))
    homeless = safe_val(first.get("No. Homeless"))
    iso = str(first.get("ISO", ""))

    admin1_codes = sorted(group_df["admin1_code"].unique().tolist())
    countries = sorted(group_df["Country"].unique().tolist())

    # Period string
    period_parts = []
    if start_m and not math.isnan(start_m):
        period_parts.append(f"{int(start_m):02d}/{int(start_y)}")
    elif start_y:
        period_parts.append(str(int(start_y)))
    if end_m and not math.isnan(end_m):
        period_parts.append(f"{int(end_m):02d}/{int(end_y)}")
    elif end_y:
        period_parts.append(str(int(end_y)))
    period = " — ".join(period_parts) if period_parts else "Unknown"

    sev = severity_label(affected, deaths)
    title = event_name if event_name and str(event_name) != "None" else f"{disaster_type}: {country}"

    # Build MDX
    lines = []
    lines.append("---")
    lines.append(f'id: "{dis_no}"')
    lines.append(f'name: "{title}"')
    lines.append(f'country: "{country}"')
    lines.append(f'iso: "{iso}"')
    lines.append(f'hazard: "{disaster_type.lower()}"')
    lines.append(f'severity: "{sev}"')
    lines.append(f'period: "{period}"')
    if start_y:
        lines.append(f"year: {int(start_y)}")
    if start_m and not math.isnan(start_m):
        lines.append(f"month: {int(start_m)}")
    lines.append("---")
    lines.append("")

    # CountryHeader
    lines.append("<CountryHeader")
    lines.append(f'  country="{country}"')
    lines.append(f'  code="{iso}"')
    lines.append(f'  emdat="{dis_no}"')
    lines.append(f'  severity="{sev}"')
    lines.append(f'  period="{period}"')
    lines.append("/>")
    lines.append("")

    # Description
    if location and str(location) != "None":
        lines.append(f"**Location:** {location}")
        lines.append("")
    if subtype and str(subtype) != "None" and str(subtype) != disaster_type:
        lines.append(f"**Type:** {disaster_type} — {subtype}")
        lines.append("")

    # ImpactStats
    impact_parts = []
    if affected:
        impact_parts.append(f'affected="{fmt_number(affected)}"')
    if deaths:
        impact_parts.append(f'deaths="{fmt_number(deaths)}"')
    if homeless:
        impact_parts.append(f'displaced="{fmt_number(homeless)}"')
    if impact_parts:
        lines.append(f"<ImpactStats {' '.join(impact_parts)} />")
        lines.append("")

    # Impact table
    lines.append("## Impact Summary")
    lines.append("")
    lines.append("| Metric | Value |")
    lines.append("|--------|-------|")
    if deaths:
        lines.append(f"| Deaths | {int(deaths):,} |")
    if affected:
        lines.append(f"| Total Affected | {int(affected):,} |")
    if injured:
        lines.append(f"| Injured | {int(injured):,} |")
    if homeless:
        lines.append(f"| Homeless | {int(homeless):,} |")
    lines.append(f"| Admin1 Regions | {len(admin1_codes)} |")
    if len(countries) > 1:
        lines.append(f"| Countries | {', '.join(countries)} |")
    lines.append("")

    # Affected regions
    lines.append("## Affected Admin1 Regions")
    lines.append("")
    for code in admin1_codes:
        # Extract readable name from code like "ETH.5_1" → "5"
        name_part = str(code).split(".")[-1].replace("_1", "") if "." in str(code) else str(code)
        lines.append(f"- `{code}`")
    lines.append("")

    return "\n".join(lines)


HAZARD_PREFIX = {"drought": "dr", "flood": "fl"}


def main():
    # Write everything into the rk/ tab — upload_to_gcs.py already uploads
    # this directory to gs://crma-mdx-store/rk/.
    out_dir = os.path.join(OUTPUT_BASE, "rk")
    os.makedirs(out_dir, exist_ok=True)

    for dtype in ("drought", "flood"):
        path = os.path.join(PARQUET_DIR, f"emdat_{dtype}_adm1.parquet")
        df = pd.read_parquet(path)
        hp = HAZARD_PREFIX[dtype]

        count = 0
        for dis_no, group in df.groupby("Dis No"):
            mdx = generate_mdx(dis_no, group, dtype.capitalize())
            # Sanitise filename — must match buildMdxKey() / sanitiseKey()
            # in arco-ibf/app/lib/load-event-mdx.ts.
            safe_name = re.sub(r"[^a-zA-Z0-9_\-]", "_", str(dis_no))
            filepath = os.path.join(out_dir, f"{hp}-rk-{safe_name}.mdx")
            with open(filepath, "w") as f:
                f.write(mdx)
            count += 1

        print(f"{dtype}: generated {count} MDX files as {hp}-rk-*.mdx in {out_dir}")


if __name__ == "__main__":
    main()
