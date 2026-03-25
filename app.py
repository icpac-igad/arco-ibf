"""
FastAPI backend for the CRMA dashboard.

Reads EM-DAT parquet files directly and serves three endpoints:
  /api/emdat-monthly-risk?type=drought|flood
  /api/emdat-month-regions/{event_key}
  /api/emdat-event-markdown/{event_key}
"""

import math
import os

import pandas as pd
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
PARQUET_DIR = os.environ.get(
    "PARQUET_DIR",
    os.path.join(os.path.dirname(__file__), "data"),
)

app = FastAPI(title="CRMA Dashboard API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Load parquet frames once
# ---------------------------------------------------------------------------
_frames: dict[str, pd.DataFrame] = {}


def _get_df(disaster_type: str) -> pd.DataFrame:
    key = disaster_type.lower()
    if key not in _frames:
        path = os.path.join(PARQUET_DIR, f"emdat_{key}_adm1.parquet")
        df = pd.read_parquet(path)
        # Normalise NaN months to 1
        if "Start Month" in df.columns:
            df["Start Month"] = df["Start Month"].fillna(1).astype(int)
        if "End Month" in df.columns:
            df["End Month"] = df["End Month"].fillna(12).astype(int)
        if "Start Year" in df.columns:
            df["Start Year"] = df["Start Year"].fillna(0).astype(int)
        _frames[key] = df
    return _frames[key]


def _safe(v):
    """Convert NaN / inf to None for JSON."""
    if v is None:
        return None
    if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
        return None
    return v


# ---------------------------------------------------------------------------
# Endpoint 1: monthly calendar data
# ---------------------------------------------------------------------------
@app.get("/api/emdat-monthly-risk")
async def emdat_monthly_risk(type: str = Query(..., alias="type")):
    df = _get_df(type)

    grouped = (
        df.groupby("Dis No")
        .agg(
            year=("Start Year", "first"),
            month=("Start Month", "first"),
            regions_affected=("admin1_code", "nunique"),
            countries_affected=("Country", "nunique"),
            total_deaths=("Total Deaths", "first"),
            total_affected=("Total Affected", "first"),
            location=("Location", "first"),
        )
        .reset_index()
    )

    data = []
    for _, row in grouped.iterrows():
        regions = int(row["regions_affected"])
        # severity bucket 0-5 based on regions affected
        level = min(5, regions // 2)
        data.append(
            {
                "event_key": row["Dis No"],
                "year": int(row["year"]),
                "month": int(row["month"]),
                "event_count": regions,
                "total_deaths": _safe(row["total_deaths"]),
                "total_affected": _safe(row["total_affected"]),
                "regions_affected": regions,
                "countries_affected": int(row["countries_affected"]),
                "level": level,
            }
        )

    return {"data": data}


# ---------------------------------------------------------------------------
# Endpoint 2: Admin1 regions for a given event
# ---------------------------------------------------------------------------
@app.get("/api/emdat-month-regions/{event_key:path}")
async def emdat_month_regions(event_key: str):
    # Try both frames
    for dtype in ("drought", "flood"):
        try:
            df = _get_df(dtype)
        except FileNotFoundError:
            continue
        rows = df[df["Dis No"] == event_key]
        if len(rows) > 0:
            break
    else:
        return {"regions": []}

    regions = []
    for admin1_code, grp in rows.groupby("admin1_code"):
        first = grp.iloc[0]
        regions.append(
            {
                "shapeID": admin1_code,
                "shapeName": str(admin1_code).split(".")[-1] if "." in str(admin1_code) else str(admin1_code),
                "shapeGroup": str(first.get("Country", "")),
                "frequency": len(grp),
                "events": [],
            }
        )

    return {"regions": regions}


# ---------------------------------------------------------------------------
# Endpoint 3: auto-generated event markdown
# ---------------------------------------------------------------------------
@app.get("/api/emdat-event-markdown/{event_key:path}")
async def emdat_event_markdown(event_key: str):
    # Try both frames
    row = None
    for dtype in ("drought", "flood"):
        try:
            df = _get_df(dtype)
        except FileNotFoundError:
            continue
        rows = df[df["Dis No"] == event_key]
        if len(rows) > 0:
            row = rows.iloc[0]
            admin1_codes = rows["admin1_code"].unique().tolist()
            break

    if row is None:
        return JSONResponse({"error": "Event not found"}, status_code=404)

    # Build markdown
    country = row.get("Country", "Unknown")
    disaster_type = row.get("Disaster Type", row.get("disaster_type", "Unknown"))
    disaster_subtype = row.get("Disaster Subtype", "")
    location = row.get("Location", "")
    start_y = _safe(row.get("Start Year"))
    start_m = _safe(row.get("Start Month"))
    end_y = _safe(row.get("End Year"))
    end_m = _safe(row.get("End Month"))
    deaths = _safe(row.get("Total Deaths"))
    affected = _safe(row.get("Total Affected"))
    injured = _safe(row.get("No. Injured"))
    homeless = _safe(row.get("No. Homeless"))
    event_name = row.get("Event Name", None)

    period_start = f"{int(start_y)}" if start_y else "?"
    if start_m:
        period_start = f"{int(start_m):02d}/{period_start}"
    period_end = f"{int(end_y)}" if end_y else "?"
    if end_m:
        period_end = f"{int(end_m):02d}/{period_end}"

    title = f"{disaster_type}: {country}"
    if event_name and str(event_name) != "None":
        title = f"{event_name} — {country}"

    md = f"# {title}\n\n"
    md += f"**Event ID:** `{event_key}`\n\n"
    if disaster_subtype and str(disaster_subtype) != "None" and disaster_subtype != disaster_type:
        md += f"**Type:** {disaster_type} — {disaster_subtype}\n\n"
    md += f"**Period:** {period_start} to {period_end}\n\n"
    if location and str(location) != "None":
        md += f"**Location:** {location}\n\n"

    md += "## Impact\n\n"
    md += "| Metric | Value |\n|--------|-------|\n"
    if deaths is not None:
        md += f"| Deaths | {int(deaths):,} |\n"
    if affected is not None:
        md += f"| Total Affected | {int(affected):,} |\n"
    if injured is not None:
        md += f"| Injured | {int(injured):,} |\n"
    if homeless is not None:
        md += f"| Homeless | {int(homeless):,} |\n"
    md += f"| Admin1 Regions | {len(admin1_codes)} |\n"

    md += "\n## Affected Admin1 Regions\n\n"
    for code in sorted(admin1_codes):
        md += f"- `{code}`\n"

    return {"markdown": md, "event_key": event_key}


# ---------------------------------------------------------------------------
# Static files
# ---------------------------------------------------------------------------
@app.get("/icpac_adm1v3.json")
async def serve_topojson():
    return FileResponse("public/icpac_adm1v3.json", media_type="application/json")


# ---------------------------------------------------------------------------
# Root
# ---------------------------------------------------------------------------
@app.get("/")
async def root():
    return {
        "status": "ok",
        "message": "CRMA Dashboard API (local parquet)",
        "endpoints": [
            "/api/emdat-monthly-risk?type=drought|flood",
            "/api/emdat-month-regions/{event_key}",
            "/api/emdat-event-markdown/{event_key}",
            "/icpac_adm1v3.json",
        ],
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
