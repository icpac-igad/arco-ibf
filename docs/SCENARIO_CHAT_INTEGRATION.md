# Scenario LLM Chat — Integration Guide

LLM explanatory assistant for the scenario simulation (Act II of the
"From Forecast to Action" exercise). Participants chat with an assistant that
has round-gated scenario context: it sees only the evidence revealed up to the
current round, never reveals the historical outcome before debrief, and stays
Socratic about DOC decisions.

## What this branch adds

| Piece | Path | Notes |
|---|---|---|
| Chat endpoint | `app.py` → `POST /api/scenario-chat` | Builds the system prompt from the scenario JSON, calls the LLM |
| Scenario endpoints | `app.py` → `GET /api/scenarios`, `GET /api/scenarios/{event_id}` | Forward view strips `peak`/`debrief`/`counterfactual` so the outcome cannot leak to the browser |
| Scenario data | `data/scenarios/*.json` | Copied from `cmra/scenario-sim/scenarios/` — drop newer/extra scenario JSONs (e.g. the 11 flood events) in here, no code change needed |
| Chat UI | `app/components/scenario/ScenarioChat.tsx` | Self-contained client component — **this is the piece to integrate into the real ScenarioRunner** |
| Next route handlers | `app/api/scenario-chat/`, `app/api/scenarios/` | Proxy to crma-api with the existing `apiFetch` identity-token pattern |
| Dev stand-in pages | `app/scenario/page.tsx`, `app/scenario/[eventId]/page.tsx` | **Placeholder only.** Built because the deployed ScenarioRunner source is not in this branch. Replace/merge with the real ScenarioRunner; keep only `ScenarioChat` |

## Integrating ScenarioChat into the real ScenarioRunner

```tsx
import { ScenarioChat } from 'app/components/scenario/ScenarioChat';

<ScenarioChat
  scenarioId={scenario.event_id}  // e.g. "kenya_asal_drought_2020"
  round={currentRound}            // 1-based round number — gates which evidence the LLM sees
  debrief={isDebrief}             // true after the exercise → unlocks outcome + counterfactual
  bnState={posterior}             // OPTIONAL: BN posterior snapshot from the DAG panel,
                                  // injected into the prompt so the LLM can discuss it
/>
```

The component manages its own message history and POSTs to `/api/scenario-chat`
with `{scenario_id, round, debrief, message, history, bn_state}`. The backend
is stateless — all context is rebuilt per request from the scenario JSON.

## LLM provider — no API key required, but supported

The backend auto-selects (`SCENARIO_LLM_PROVIDER=auto`, the default):

- `ANTHROPIC_API_KEY` set → **Anthropic API** (`claude-opus-4-8`,
  override with `SCENARIO_CHAT_MODEL`). Recommended for the conference
  session and the public site — set the key via GCP Secret Manager on the
  crma-api Cloud Run service.
- No key → **local Ollama** (`OLLAMA_BASE_URL`, default `http://localhost:11434`;
  `OLLAMA_MODEL`, default `llama3.2:3b`). Useful for offline workshops and
  keyless local dev. Small models (≤3B) plumb fine but garble Bayesian
  concepts — use ≥7B (e.g. `qwen2.5:7b`) or the API for real sessions.

Force a provider with `SCENARIO_LLM_PROVIDER=anthropic|ollama`.

## Local dev

```bash
# Backend (needs: pip install fastapi uvicorn pandas pyarrow anthropic)
uvicorn app:app --port 8000          # any port; match NEXT_PUBLIC_API_BASE_URL

# Optional local LLM
ollama serve & ollama pull llama3.2:3b

# Frontend
yarn install && yarn dev
# open http://localhost:3000/scenario
```

## Deploy checklist (crma-api)

1. Add `anthropic` to the API image requirements.
2. Include `data/scenarios/` in the image (or set `SCENARIOS_DIR`).
3. Set `ANTHROPIC_API_KEY` from Secret Manager (or `OLLAMA_*` if self-hosting a model).
4. Frontend ships via the normal `_build_fe.sh` — route handlers reuse `apiFetch`.

## Prompt behaviour (enforced server-side, see `_build_chat_system_prompt`)

- Only evidence from rounds ≤ current round, values at the simulation cursor.
- Hard / soft / virtual evidence typology + teaching notes woven in.
- Forward rounds: outcome, peak, losses strictly withheld.
- Debrief: outcome + counterfactual unlocked, forensic-reconstruction guidance.
- Never prescribes a DOC level — asks what the evidence and posterior support.
