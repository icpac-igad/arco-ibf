#!/bin/bash
# CRMA Dashboard — Start both dev servers
# Usage: ./start_dev_servers.sh

set -e

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

echo "=== CRMA Dashboard — Starting dev servers ==="
echo ""

# Kill any existing processes on these ports
lsof -ti:8000 2>/dev/null | xargs kill 2>/dev/null || true
lsof -ti:3000 2>/dev/null | xargs kill 2>/dev/null || true
sleep 1

# Start FastAPI backend
echo "[1/2] Starting FastAPI backend on port 8000..."
uvicorn app:app --host 0.0.0.0 --port 8000 --reload &
FASTAPI_PID=$!

# Wait for FastAPI to be ready
for i in $(seq 1 10); do
  if curl -s http://localhost:8000/ > /dev/null 2>&1; then
    echo "      FastAPI ready ✓"
    break
  fi
  sleep 1
done

# Quick API test
echo ""
echo "--- API Health Check ---"
curl -s "http://localhost:8000/api/emdat-monthly-risk?type=drought" | \
  python3 -c "import sys,json; d=json.load(sys.stdin)['data']; print(f'  Drought: {len(d)} events')" 2>/dev/null || echo "  WARNING: drought API failed"
curl -s "http://localhost:8000/api/emdat-monthly-risk?type=flood" | \
  python3 -c "import sys,json; d=json.load(sys.stdin)['data']; print(f'  Flood:   {len(d)} events')" 2>/dev/null || echo "  WARNING: flood API failed"
echo "------------------------"
echo ""

# Start Next.js frontend
echo "[2/2] Starting Next.js frontend on port 3000..."
npx next dev --port 3000 &
NEXT_PID=$!

echo ""
echo "=== Both servers starting ==="
echo "  FastAPI: http://localhost:8000  (PID $FASTAPI_PID)"
echo "  Next.js: http://localhost:3000  (PID $NEXT_PID)"
echo ""
echo "  Open: http://localhost:3000/?hazard=drought&stage=events"
echo ""
echo "  Press Ctrl+C to stop both servers"

# Trap Ctrl+C to kill both
trap "echo ''; echo 'Stopping servers...'; kill $FASTAPI_PID $NEXT_PID 2>/dev/null; exit 0" INT TERM

# Wait for either to exit
wait
