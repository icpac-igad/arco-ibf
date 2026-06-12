"""
FastAPI backend for the CRMA dashboard.

Reads EM-DAT parquet files directly and serves three endpoints:
  /api/emdat-monthly-risk?type=drought|flood
  /api/emdat-month-regions/{event_key}
  /api/emdat-event-markdown/{event_key}
"""

import json
import math
import os

import pandas as pd
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse
from pydantic import BaseModel

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
PARQUET_DIR = os.environ.get(
    "PARQUET_DIR",
    os.path.join(os.path.dirname(__file__), "data"),
)

SCENARIOS_DIR = os.environ.get(
    "SCENARIOS_DIR",
    os.path.join(os.path.dirname(__file__), "data", "scenarios"),
)

# Scenario chat assistant (Act II explanatory LLM)
# Provider: "anthropic", "ollama", or "auto" (anthropic if credentials are set,
# otherwise a local Ollama server — useful for offline/keyless local dev).
LLM_PROVIDER = os.environ.get("SCENARIO_LLM_PROVIDER", "auto")
CHAT_MODEL = os.environ.get("SCENARIO_CHAT_MODEL", "claude-opus-4-8")
OLLAMA_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "llama3.2:3b")


def _resolve_provider() -> str:
    if LLM_PROVIDER != "auto":
        return LLM_PROVIDER
    if os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN"):
        return "anthropic"
    return "ollama"

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
# MDX local dev endpoints
# Mirrors the production crma-api GCS-backed endpoints so local dev works
# without GCS access. Reads from app/content/events/{tab}/{filename}.
# ---------------------------------------------------------------------------
_CONTENT_DIR = os.path.join(os.path.dirname(__file__), "app", "content", "events")


@app.get("/api/mdx/manifest")
async def mdx_manifest():
    """Return a minimal manifest so the frontend cache check doesn't hard-fail."""
    import hashlib, glob
    files = {}
    for path in glob.glob(os.path.join(_CONTENT_DIR, "**", "*.mdx"), recursive=True):
        rel = os.path.relpath(path, _CONTENT_DIR).replace("\\", "/")
        h = hashlib.md5(open(path, "rb").read()).hexdigest()
        files[rel] = {"hash": h, "size": os.path.getsize(path)}
    return {"files": files}


@app.get("/api/mdx/raw/{tab}/{filename:path}")
async def mdx_raw(tab: str, filename: str):
    """Serve raw MDX text from the local content/events directory."""
    path = os.path.join(_CONTENT_DIR, tab, filename)
    if not os.path.isfile(path):
        return JSONResponse({"error": f"Not found: {tab}/{filename}"}, status_code=404)
    return PlainTextResponse(open(path).read(), media_type="text/plain")


@app.get("/api/mdx/media/{path:path}")
async def mdx_media(path: str):
    """Serve media assets from public/bn-ibf/ during local dev."""
    asset_path = os.path.join(os.path.dirname(__file__), "public", "bn-ibf", path)
    if not os.path.isfile(asset_path):
        return JSONResponse({"error": f"Media not found: {path}"}, status_code=404)
    return FileResponse(asset_path)


# ---------------------------------------------------------------------------
# Scenario simulation: definitions + LLM chat assistant
# ---------------------------------------------------------------------------
_scenarios: dict[str, dict] = {}


def _load_scenarios() -> dict[str, dict]:
    if not _scenarios and os.path.isdir(SCENARIOS_DIR):
        import glob

        for path in glob.glob(os.path.join(SCENARIOS_DIR, "*.json")):
            try:
                with open(path) as f:
                    sc = json.load(f)
                _scenarios[sc["event_id"]] = sc
            except (json.JSONDecodeError, KeyError):
                continue
    return _scenarios


# Fields that reveal the historical outcome — withheld until debrief
_OUTCOME_FIELDS = ("peak", "debrief", "counterfactual")


@app.get("/api/scenarios")
async def list_scenarios():
    items = [
        {
            "event_id": sc["event_id"],
            "title": sc.get("title", sc["event_id"]),
            "hazard": sc.get("hazard"),
            "country": sc.get("country"),
            "forecastability": sc.get("forecastability"),
        }
        for sc in _load_scenarios().values()
    ]
    items.sort(key=lambda s: (s["hazard"] or "", s["country"] or ""))
    return {"scenarios": items}


@app.get("/api/scenarios/{event_id}")
async def get_scenario(event_id: str, debrief: bool = Query(False)):
    sc = _load_scenarios().get(event_id)
    if sc is None:
        return JSONResponse({"error": f"Unknown scenario: {event_id}"}, status_code=404)
    if debrief:
        return sc
    # Forward-mode view: strip outcome fields so the UI cannot leak them
    return {k: v for k, v in sc.items() if k not in _OUTCOME_FIELDS}


class ChatMessage(BaseModel):
    role: str  # "user" | "assistant"
    content: str


class ScenarioChatRequest(BaseModel):
    scenario_id: str
    round: int = 1
    debrief: bool = False
    message: str
    history: list[ChatMessage] = []
    bn_state: dict | None = None  # optional posterior snapshot from the DAG panel


def _evidence_value_at(card: dict, cursor_date: str) -> str | None:
    """Most recent value at or before the cursor date."""
    values = card.get("value_by_date", {})
    dated = sorted((d, v) for d, v in values.items() if d <= cursor_date)
    return dated[-1][1] if dated else None


def _build_chat_system_prompt(sc: dict, round_num: int, debrief: bool, bn_state: dict | None) -> str:
    rounds = sc.get("rounds", [])
    round_num = max(1, min(round_num, len(rounds)))
    current = rounds[round_num - 1]
    cursor = current.get("cursor_date", "")

    revealed_ids: list[str] = []
    for r in rounds[:round_num]:
        revealed_ids.extend(r.get("reveal_evidence", []))
    cards = {c["id"]: c for c in sc.get("evidence_cards", [])}

    evidence_lines = []
    for eid in revealed_ids:
        card = cards.get(eid)
        if not card:
            continue
        value = _evidence_value_at(card, cursor)
        line = f"- {card.get('label', eid)} (BN node: {card.get('bn_node', '?')}, type: {card.get('evidence_type', '?')})"
        if value:
            line += f" — current value: {value}"
        if card.get("teaching_note"):
            line += f"\n  Teaching note (weave in when relevant, do not read verbatim): {card['teaching_note']}"
        evidence_lines.append(line)

    decision = sc.get("decision", {})
    ladder = " → ".join(decision.get("ladder", []))

    prompt = f"""You are the facilitation assistant for an interactive Disaster Operations Centre (DOC) simulation \
run by ICPAC for East Africa. Participants are DOC analysts working through a historical {sc.get('hazard', '')} \
scenario using a Bayesian Network (BN) for transparent belief updating.

SCENARIO: {sc.get('title', sc.get('event_id'))}
COUNTRY/REGION: {sc.get('country', '?')} — {sc.get('admin1', '')}
BRIEF: {sc.get('brief_outcome_free', '')}

SIMULATION TIME: the cursor is at {cursor} (round {round_num} of {len(rounds)}: "{current.get('title', '')}").
ENGINE STATE: {current.get('engine_state', '')}

EVIDENCE REVEALED SO FAR (participants can only see these):
{chr(10).join(evidence_lines) if evidence_lines else '- none yet'}

DECISION LADDER: {ladder}
CHECKPOINT PROMPT (when participants ask about decisions): {decision.get('checkpoint_prompt', '')}

EVIDENCE TYPOLOGY you teach:
- hard evidence: directly observed, sets a BN node state with certainty
- soft evidence: uncertain observation, enters the BN as a likelihood over node states
- virtual evidence: indicator not modelled as a BN parent (e.g. CDI); updates the risk posterior multiplicatively (Pearl virtual evidence)

YOUR ROLE:
- Explain evidence cards, BN structure, belief updating, uncertainty, and the hard/soft/virtual distinction in plain language.
- Be Socratic about decisions: never tell participants which DOC level to choose. Ask what the evidence and posterior support, what additional evidence would change their mind, and what no-regret actions the lead time allows.
- Keep answers short (2-5 sentences unless asked to elaborate) and grounded in the revealed evidence only.
- The simulation clock is at {cursor}. Treat anything after this date as unknown."""

    if debrief:
        peak = sc.get("peak", {})
        counterfactual = sc.get("counterfactual", {})
        prompt += f"""

DEBRIEF MODE: the exercise has ended and the historical outcome may now be discussed.
- Recorded peak: {peak.get('date', '?')} — {peak.get('description', '')}
- Counterfactual to explore: {counterfactual.get('prompt', '')} {counterfactual.get('narrative', '')}
Guide forensic reconstruction: which signals preceded the event, whether action came early enough, and the value of lead time."""
    else:
        prompt += """

STRICT RULE: this is a forward-looking exercise. You know this is a historical event, but you must NOT reveal \
the outcome, the peak date, losses, damages, or anything from after the simulation cursor. If asked, say the \
outcome is revealed at the debrief and redirect to interpreting the current evidence."""

    if bn_state:
        prompt += f"\n\nCURRENT BN POSTERIOR SNAPSHOT (from the participant's DAG panel):\n{json.dumps(bn_state, sort_keys=True)}"

    return prompt


def _chat_anthropic(system: str, messages: list[dict]) -> tuple[dict | None, JSONResponse | None]:
    try:
        import anthropic
    except ImportError:
        return None, JSONResponse({"error": "anthropic package not installed on the API server"}, status_code=503)

    try:
        client = anthropic.Anthropic()
        response = client.messages.create(
            model=CHAT_MODEL,
            max_tokens=1024,
            system=system,
            messages=messages,
        )
    except (anthropic.AuthenticationError, TypeError):
        # TypeError: SDK raises it when no credentials are configured at all
        return None, JSONResponse(
            {"error": "ANTHROPIC_API_KEY is missing or invalid on the API server"},
            status_code=503,
        )
    except anthropic.APIStatusError as e:
        return None, JSONResponse({"error": f"LLM API error ({e.status_code})"}, status_code=502)
    except anthropic.APIConnectionError:
        return None, JSONResponse({"error": "Could not reach the LLM API"}, status_code=502)

    if response.stop_reason == "refusal":
        reply = "I can't help with that — let's get back to the scenario evidence."
    else:
        reply = "".join(b.text for b in response.content if b.type == "text")
    return {"reply": reply, "model": response.model, "provider": "anthropic"}, None


def _chat_ollama(system: str, messages: list[dict]) -> tuple[dict | None, JSONResponse | None]:
    import httpx

    payload = {
        "model": OLLAMA_MODEL,
        "messages": [{"role": "system", "content": system}, *messages],
        "stream": False,
        "options": {"num_predict": 1024},
    }
    try:
        r = httpx.post(f"{OLLAMA_BASE_URL}/api/chat", json=payload, timeout=120.0)
    except httpx.ConnectError:
        return None, JSONResponse(
            {"error": f"Ollama server not reachable at {OLLAMA_BASE_URL} — run `ollama serve`"},
            status_code=503,
        )
    if r.status_code == 404:
        return None, JSONResponse(
            {"error": f"Model {OLLAMA_MODEL!r} not found in Ollama — run `ollama pull {OLLAMA_MODEL}`"},
            status_code=503,
        )
    if r.status_code != 200:
        return None, JSONResponse({"error": f"Ollama error ({r.status_code}): {r.text[:200]}"}, status_code=502)

    data = r.json()
    reply = data.get("message", {}).get("content", "")
    return {"reply": reply, "model": OLLAMA_MODEL, "provider": "ollama"}, None


@app.post("/api/scenario-chat")
async def scenario_chat(req: ScenarioChatRequest):
    sc = _load_scenarios().get(req.scenario_id)
    if sc is None:
        return JSONResponse({"error": f"Unknown scenario: {req.scenario_id}"}, status_code=404)

    system = _build_chat_system_prompt(sc, req.round, req.debrief, req.bn_state)

    messages = [
        {"role": m.role, "content": m.content}
        for m in req.history[-20:]  # cap history; the API is stateless
        if m.role in ("user", "assistant") and m.content.strip()
    ]
    messages.append({"role": "user", "content": req.message})

    provider = _resolve_provider()
    if provider == "ollama":
        result, error = _chat_ollama(system, messages)
    else:
        result, error = _chat_anthropic(system, messages)
    return error if error is not None else result


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
            "/api/scenarios",
            "/api/scenarios/{event_id}",
            "POST /api/scenario-chat",
            "/api/mdx/manifest",
            "/api/mdx/raw/{tab}/{filename}",
            "/api/mdx/media/{path}",
            "/icpac_adm1v3.json",
        ],
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
