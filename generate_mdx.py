#!/usr/bin/env python3
"""
Generate date-based MDX files for all three CRMA tabs.

RK (Risk Knowledge): EM-DAT events aggregated by month (from parquet)
RM (Risk Monitoring): Standalone date placeholders (NOT from EM-DAT)
    - Drought: monthly YYYY-MM from 1981-01 to 2026-12
    - Flood: daily YYYY-MM-DD from 2022-01-01 to 2026-12-31
RD (Risk Decisions): 10 sample dates each for dr/fl (2026-01-01 to 2026-03-25)

Naming: {hazard_prefix}-{tab}-{date}.mdx
  dr-rk-2021-05.mdx, fl-rm-2023-11-15.mdx, dr-rd-2026-02-10.mdx
"""

import calendar
import math
import os
import shutil
from datetime import date, timedelta

import pandas as pd

PARQUET_DIR = os.path.join(os.path.dirname(__file__), "data")
OUTPUT_BASE = os.path.join(os.path.dirname(__file__), "app", "content", "events")

HAZARD_PREFIX = {"drought": "dr", "flood": "fl"}


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


def load_df(hazard):
    path = os.path.join(PARQUET_DIR, f"emdat_{hazard}_adm1.parquet")
    df = pd.read_parquet(path)
    df["Start Month"] = df["Start Month"].fillna(1).astype(int)
    df["Start Year"] = df["Start Year"].fillna(0).astype(int)
    df["ym"] = df["Start Year"].astype(str) + "-" + df["Start Month"].astype(str).str.zfill(2)
    return df


# ─────────────────────────────────────────────
# RK: EM-DAT events aggregated by month
# ─────────────────────────────────────────────
def generate_rk_mdx(month_key, events_df, hazard):
    hp = HAZARD_PREFIX[hazard]
    event_groups = events_df.groupby("Dis No")
    total_deaths = safe_val(events_df["Total Deaths"].sum())
    total_affected = safe_val(events_df["Total Affected"].sum())
    total_events = events_df["Dis No"].nunique()
    countries = sorted(events_df["Country"].unique().tolist())
    admin1_codes = sorted(events_df["admin1_code"].unique().tolist())
    sev = severity_label(total_affected, total_deaths)

    lines = []
    lines.append("---")
    lines.append(f'id: "{hp}-rk-{month_key}"')
    lines.append(f'name: "{hazard.title()} Events — {month_key}"')
    lines.append(f'hazard: "{hazard}"')
    lines.append(f'tab: "rk"')
    lines.append(f'period: "{month_key}"')
    lines.append(f'severity: "{sev}"')
    lines.append(f"events: {total_events}")
    lines.append(f"countries: {len(countries)}")
    lines.append(f"regions: {len(admin1_codes)}")
    lines.append("---")
    lines.append("")

    lines.append("<CountryHeader")
    lines.append(f'  country="{", ".join(countries[:3])}{"..." if len(countries) > 3 else ""}"')
    lines.append(f'  code="{hp.upper()}"')
    lines.append(f'  severity="{sev}"')
    lines.append(f'  period="{month_key}"')
    lines.append("/>")
    lines.append("")

    impact_parts = []
    if total_affected:
        impact_parts.append(f'affected="{fmt_number(total_affected)}"')
    if total_deaths:
        impact_parts.append(f'deaths="{fmt_number(total_deaths)}"')
    if impact_parts:
        lines.append(f"<ImpactStats {' '.join(impact_parts)} />")
        lines.append("")

    lines.append(f"## {total_events} Events in {month_key}")
    lines.append("")

    for dis_no, grp in event_groups:
        first = grp.iloc[0]
        country = str(first.get("Country", "Unknown"))
        location = safe_val(first.get("Location"))
        deaths = safe_val(first.get("Total Deaths"))
        affected = safe_val(first.get("Total Affected"))
        n_regions = grp["admin1_code"].nunique()

        lines.append(f"### {dis_no} — {country}")
        if location and str(location) != "None":
            lines.append(f"**Location:** {location}")
        detail = []
        if affected:
            detail.append(f"Affected: {int(affected):,}")
        if deaths:
            detail.append(f"Deaths: {int(deaths):,}")
        detail.append(f"Regions: {n_regions}")
        lines.append(f"  {' · '.join(detail)}")
        lines.append("")

    lines.append(f"## Affected Admin1 Regions ({len(admin1_codes)})")
    lines.append("")
    for code in admin1_codes[:30]:
        lines.append(f"- `{code}`")
    if len(admin1_codes) > 30:
        lines.append(f"- ... and {len(admin1_codes) - 30} more")
    lines.append("")
    return "\n".join(lines)


def build_rk(out_dir):
    """Risk Knowledge: EM-DAT monthly aggregation."""
    os.makedirs(out_dir, exist_ok=True)
    count = 0
    for hazard in ("drought", "flood"):
        hp = HAZARD_PREFIX[hazard]
        df = load_df(hazard)
        df = df[(df["Start Year"] >= 1990) & (df["Start Year"] <= 2025)]
        for ym, grp in df.groupby("ym"):
            mdx = generate_rk_mdx(ym, grp, hazard)
            with open(os.path.join(out_dir, f"{hp}-rk-{ym}.mdx"), "w") as f:
                f.write(mdx)
            count += 1
    return count


# ─────────────────────────────────────────────
# RM: Standalone date placeholders (NOT EM-DAT)
# ─────────────────────────────────────────────
def generate_rm_mdx(date_key, hazard, mode):
    hp = HAZARD_PREFIX[hazard]
    hazard_title = hazard.title()
    resolution = "Daily" if mode == "daily" else "Monthly"

    lines = []
    lines.append("---")
    lines.append(f'id: "{hp}-rm-{date_key}"')
    lines.append(f'name: "{hazard_title} Monitoring — {date_key}"')
    lines.append(f'hazard: "{hazard}"')
    lines.append(f'tab: "rm"')
    lines.append(f'period: "{date_key}"')
    lines.append(f'severity: "moderate"')
    lines.append("---")
    lines.append("")
    lines.append(f"<CountryHeader")
    lines.append(f'  country="East Africa"')
    lines.append(f'  code="{hp.upper()}"')
    lines.append(f'  severity="moderate"')
    lines.append(f'  period="{date_key}"')
    lines.append("/>")
    lines.append("")
    lines.append(f"## {hazard_title} Risk Monitoring — {date_key}")
    lines.append("")
    lines.append(f"**Resolution:** {resolution}")
    lines.append("")
    lines.append(f"Monitoring summary for **{date_key}** across the Greater Horn of Africa.")
    lines.append("")
    lines.append("### Observations")
    lines.append(f"- {resolution} {hazard} monitoring for {date_key}")
    lines.append("- Ensemble forecast analysis pending")
    lines.append("- Threshold exceedance check pending")
    lines.append("")
    lines.append("### Status")
    lines.append("- Situational awareness: **Active**")
    lines.append("- Data sources: CHIRPS, GFS, ECMWF")
    lines.append("")
    return "\n".join(lines)


def build_rm(out_dir):
    """Risk Monitoring: standalone date placeholders."""
    os.makedirs(out_dir, exist_ok=True)
    count = 0

    # Drought: monthly 1981-01 to 2026-12
    for year in range(1981, 2027):
        for month in range(1, 13):
            ym = f"{year}-{month:02d}"
            mdx = generate_rm_mdx(ym, "drought", "monthly")
            with open(os.path.join(out_dir, f"dr-rm-{ym}.mdx"), "w") as f:
                f.write(mdx)
            count += 1

    # Flood: daily 2022-01-01 to 2026-12-31
    start = date(2022, 1, 1)
    end = date(2026, 12, 31)
    d = start
    while d <= end:
        dk = d.isoformat()
        mdx = generate_rm_mdx(dk, "flood", "daily")
        with open(os.path.join(out_dir, f"fl-rm-{dk}.mdx"), "w") as f:
            f.write(mdx)
        count += 1
        d += timedelta(days=1)

    return count


# ─────────────────────────────────────────────
# RD: 10 sample dates for dr + fl (Jan 1 – Mar 25 2026)
# ─────────────────────────────────────────────
def generate_rd_mdx(date_key, hazard):
    hp = HAZARD_PREFIX[hazard]
    hazard_title = hazard.title()

    lines = []
    lines.append("---")
    lines.append(f'id: "{hp}-rd-{date_key}"')
    lines.append(f'name: "{hazard_title} Decision Support — {date_key}"')
    lines.append(f'hazard: "{hazard}"')
    lines.append(f'tab: "rd"')
    lines.append(f'period: "{date_key}"')
    lines.append(f'severity: "high"')
    lines.append("---")
    lines.append("")
    lines.append(f"<CountryHeader")
    lines.append(f'  country="East Africa"')
    lines.append(f'  code="{hp.upper()}"')
    lines.append(f'  severity="high"')
    lines.append(f'  period="{date_key}"')
    lines.append("/>")
    lines.append("")
    lines.append(f"## {hazard_title} Risk Decision — {date_key}")
    lines.append("")
    lines.append(f"Impact-based forecast and risk evaluation for **{date_key}**.")
    lines.append("")
    lines.append("### Risk Evaluation")
    lines.append(f"- {hazard_title} risk level: **Elevated**")
    lines.append("- Confidence: Medium")
    lines.append("- Lead time: 5-10 days")
    lines.append("")
    lines.append("### Recommended Actions")
    lines.append("- Monitor forecast updates")
    lines.append("- Pre-position relief supplies")
    lines.append("- Activate early warning protocols")
    lines.append("")
    return "\n".join(lines)


def build_rd(out_dir):
    """Risk Decisions: 10 sample dates each for dr/fl."""
    os.makedirs(out_dir, exist_ok=True)
    count = 0

    # 10 dates spread from 2026-01-01 to 2026-03-25
    sample_dates = [
        "2026-01-05", "2026-01-15", "2026-01-28",
        "2026-02-03", "2026-02-12", "2026-02-21",
        "2026-03-01", "2026-03-10", "2026-03-18", "2026-03-25",
    ]

    for hazard in ("drought", "flood"):
        hp = HAZARD_PREFIX[hazard]
        for dk in sample_dates:
            mdx = generate_rd_mdx(dk, hazard)
            with open(os.path.join(out_dir, f"{hp}-rd-{dk}.mdx"), "w") as f:
                f.write(mdx)
            count += 1

    return count


def main():
    # Clean old
    for d in ["drought", "flood", "rk", "rm", "rd"]:
        p = os.path.join(OUTPUT_BASE, d)
        if os.path.exists(p):
            shutil.rmtree(p)
            print(f"  Removed {p}")

    print("\n=== RK (Risk Knowledge — EM-DAT monthly) ===")
    n = build_rk(os.path.join(OUTPUT_BASE, "rk"))
    print(f"  {n} files")

    print("\n=== RM (Risk Monitoring — standalone dates) ===")
    n = build_rm(os.path.join(OUTPUT_BASE, "rm"))
    print(f"  {n} files")

    print("\n=== RD (Risk Decisions — 10 sample dates) ===")
    n = build_rd(os.path.join(OUTPUT_BASE, "rd"))
    print(f"  {n} files")


if __name__ == "__main__":
    print("=== Generating CRMA MDX files ===")
    main()
    print("\n=== Done ===")
