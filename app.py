"""
FastAPI proxy for the IBF Dashboard Cloud Run API.

Authenticates to the Cloud Run service using a service account key,
proxies all /api/* requests, and serves local static files.
"""

import calendar
import os
import time
from contextlib import asynccontextmanager

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse, Response
from google.auth.transport.requests import Request as GoogleAuthRequest
from google.oauth2.service_account import IDTokenCredentials

load_dotenv()

CLOUDRUN_SERVICE_URL = os.environ["CLOUDRUN_SERVICE_URL"]
CLOUDRUN_SA_KEY_FILE = os.environ["CLOUDRUN_SA_KEY_FILE"]

# ---------------------------------------------------------------------------
# ID-token management
# ---------------------------------------------------------------------------
_credentials: IDTokenCredentials | None = None
_token: str | None = None
_token_expiry: float = 0


def _get_id_token() -> str:
    """Return a valid ID token, refreshing if expired."""
    global _credentials, _token, _token_expiry

    # Refresh if token expires in less than 60 seconds
    if _token and time.time() < _token_expiry - 60:
        return _token

    if _credentials is None:
        _credentials = IDTokenCredentials.from_service_account_file(
            CLOUDRUN_SA_KEY_FILE,
            target_audience=CLOUDRUN_SERVICE_URL,
        )

    _credentials.refresh(GoogleAuthRequest())
    _token = _credentials.token
    # expiry is a naive UTC datetime — use calendar.timegm to convert correctly
    _token_expiry = calendar.timegm(_credentials.expiry.timetuple()) if _credentials.expiry else time.time() + 3600
    print(f"[PROXY] ID token refreshed, expires in {int(_token_expiry - time.time())}s")
    return _token


# ---------------------------------------------------------------------------
# Lifespan: manage httpx client and pre-warm token
# ---------------------------------------------------------------------------
_client: httpx.AsyncClient | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _client
    _client = httpx.AsyncClient(timeout=30.0)
    try:
        _get_id_token()
        print(f"[PROXY] Connected to {CLOUDRUN_SERVICE_URL}")
    except Exception as e:
        print(f"[PROXY] Warning: could not pre-warm token: {e}")
    yield
    await _client.aclose()


app = FastAPI(title="IBF Dashboard Proxy", lifespan=lifespan)


# ---------------------------------------------------------------------------
# Local static file routes
# ---------------------------------------------------------------------------
@app.get("/icpac_adm1v3.json")
async def serve_topojson():
    return FileResponse("icpac_adm1v3.topojson", media_type="application/json")


@app.get("/ea_adm2.topojson")
async def serve_admin2_topojson():
    return FileResponse("ea_adm2.topojson", media_type="application/json")


# ---------------------------------------------------------------------------
# Proxy all /api/* requests to Cloud Run
# ---------------------------------------------------------------------------
@app.api_route("/api/{path:path}", methods=["GET", "POST", "PUT", "DELETE"])
async def proxy_api(request: Request, path: str):
    """Forward the request to the Cloud Run API with an ID token."""
    token = _get_id_token()
    target_url = f"{CLOUDRUN_SERVICE_URL}/api/{path}"

    # Forward query string
    if request.url.query:
        target_url += f"?{request.url.query}"

    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json",
    }

    try:
        upstream = await _client.request(
            method=request.method,
            url=target_url,
            headers=headers,
            content=await request.body() if request.method in ("POST", "PUT") else None,
        )

        return Response(
            content=upstream.content,
            status_code=upstream.status_code,
            media_type=upstream.headers.get("content-type", "application/json"),
        )
    except httpx.TimeoutException:
        return JSONResponse({"error": "Upstream timeout"}, status_code=504)
    except httpx.ConnectError as e:
        return JSONResponse({"error": f"Cannot reach Cloud Run: {e}"}, status_code=502)


# ---------------------------------------------------------------------------
# Root info endpoint
# ---------------------------------------------------------------------------
@app.get("/")
async def root():
    return {
        "status": "ok",
        "message": "IBF Dashboard Proxy",
        "upstream": CLOUDRUN_SERVICE_URL,
        "endpoints": [
            "/api/available-months",
            "/api/monthly-risk-data",
            "/api/monthly-region-data/{month}",
            "/api/forecast-markdown/{forecast_key}",
            "/api/data-source-status",
            "/icpac_adm1v3.json",
            "/ea_adm2.topojson",
        ],
    }


# ---------------------------------------------------------------------------
# Run with uvicorn
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
