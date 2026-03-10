# Quick Start Guide

## One-Line Startup

```bash
./start_dev_servers.sh start
```

## Manual Startup

```bash
# Terminal 1: Start Proxy
micromamba run -n zarrv3 uvicorn app:app --host 0.0.0.0 --port 8000

# Terminal 2: Start Frontend  
cd svelte-app && npm run dev
```

## Access Points

| Service | URL |
|---------|-----|
| **Frontend** | http://localhost:5000 |
| **Events Tab** | http://localhost:5000/?stage=events&hazard=drought |
| **Proxy API** | http://localhost:8000 |
| **Cloud Run** | https://ibf-dashboard-api-462481537368.us-central1.run.app |

## Common Commands

```bash
# Start servers
./start_dev_servers.sh start

# Check status
./start_dev_servers.sh status

# View logs
./start_dev_servers.sh logs

# Stop servers
./start_dev_servers.sh stop

# Restart servers
./start_dev_servers.sh restart
```

## Test Endpoints

```bash
# Test proxy health
curl http://localhost:8000/

# Test EM-DAT calendar data
curl http://localhost:8000/api/emdat-monthly-risk?type=drought | head -20

# Test specific event (known 500 error - schema mismatch)
curl http://localhost:8000/api/emdat-month-regions/2011-01_drought
```

## Troubleshooting

### Proxy won't start
```bash
# Check .env file exists
cat .env

# Check service account key
ls -l /path/to/cloudrun-deployer-key.json

# Check Python deps
micromamba run -n zarrv3 python -c "import fastapi, httpx, google.auth"
```

### 500 Errors on event click
**Expected behavior (2026-02-17):** Backend schema mismatch - frontend shows error banner gracefully

**Fix:** Redeploy Cloud Run service

### Frontend not loading
```bash
# Check if servers are running
./start_dev_servers.sh status

# Test proxy
curl http://localhost:8000/

# Test frontend
curl http://localhost:5000/
```

## Full Documentation

See `PROXY_SETUP_GUIDE.md` for complete documentation.
