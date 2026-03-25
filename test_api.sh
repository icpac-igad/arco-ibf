#!/bin/bash
# Quick smoke test for CRMA dashboard APIs
# Usage: ./test_api.sh
# Requires: FastAPI on :8000, Next.js on :3000

RED='\033[0;31m'; GREEN='\033[0;32m'; NC='\033[0m'
PASS=0; FAIL=0

check() {
  if [ $1 -eq 0 ]; then
    echo -e "  ${GREEN}✓${NC} $2"
    ((PASS++))
  else
    echo -e "  ${RED}✗${NC} $2"
    ((FAIL++))
  fi
}

echo "=== FastAPI (port 8000) ==="

curl -sf http://localhost:8000/ > /dev/null 2>&1
check $? "Health check"

curl -sf "http://localhost:8000/api/emdat-monthly-risk?type=drought" | python3 -c "import sys,json; d=json.load(sys.stdin)['data']; assert len(d)>0; print(f'    {len(d)} drought events, {min(x[\"year\"] for x in d)}-{max(x[\"year\"] for x in d)}')" 2>/dev/null
check $? "Drought calendar data"

curl -sf "http://localhost:8000/api/emdat-monthly-risk?type=flood" | python3 -c "import sys,json; d=json.load(sys.stdin)['data']; assert len(d)>0; print(f'    {len(d)} flood events, {min(x[\"year\"] for x in d)}-{max(x[\"year\"] for x in d)}')" 2>/dev/null
check $? "Flood calendar data"

curl -sf "http://localhost:8000/api/emdat-month-regions/2021-9546-ETH" | python3 -c "import sys,json; r=json.load(sys.stdin)['regions']; assert len(r)>0; print(f'    {len(r)} admin1 regions')" 2>/dev/null
check $? "Region data (2021-9546-ETH)"

curl -sf "http://localhost:8000/api/emdat-event-markdown/2021-9546-ETH" | python3 -c "import sys,json; d=json.load(sys.stdin); assert 'markdown' in d; print(f'    {len(d[\"markdown\"])} chars')" 2>/dev/null
check $? "Event markdown (2021-9546-ETH)"

curl -sf "http://localhost:8000/icpac_adm1v3.json" | python3 -c "import sys,json; t=json.load(sys.stdin); print(f'    {len(t[\"objects\"][\"icpac_adm1v3\"][\"geometries\"])} geometries')" 2>/dev/null
check $? "TopoJSON Admin1 boundaries"

echo ""
echo "=== Next.js (port 3000) ==="

curl -sf -o /dev/null "http://localhost:3000/?hazard=drought&stage=events"
check $? "Page loads (drought)"

curl -sf -o /dev/null "http://localhost:3000/?hazard=flood&stage=events"
check $? "Page loads (flood)"

curl -sf "http://localhost:3000/api/event-mdx?hazard=drought&event=2021-9546-ETH" | python3 -c "import sys,json; d=json.load(sys.stdin); assert 'mdxSource' in d; print(f'    {d[\"meta\"][\"name\"]} | {d[\"meta\"][\"severity\"]}')" 2>/dev/null
check $? "MDX serialize (drought)"

curl -sf "http://localhost:3000/api/event-mdx?hazard=flood&event=2020-0164-KEN" | python3 -c "import sys,json; d=json.load(sys.stdin); assert 'mdxSource' in d; print(f'    {d[\"meta\"][\"name\"]} | {d[\"meta\"][\"severity\"]}')" 2>/dev/null
check $? "MDX serialize (flood)"

echo ""
echo "=== MDX Files ==="
DR=$(ls app/content/events/drought/*.mdx 2>/dev/null | wc -l)
FL=$(ls app/content/events/flood/*.mdx 2>/dev/null | wc -l)
[ "$DR" -gt 0 ] && check 0 "Drought MDX: $DR files" || check 1 "Drought MDX: missing"
[ "$FL" -gt 0 ] && check 0 "Flood MDX: $FL files" || check 1 "Flood MDX: missing"

echo ""
echo "=== Results: ${PASS} passed, ${FAIL} failed ==="
[ "$FAIL" -eq 0 ] && echo -e "${GREEN}All tests passed.${NC}" || echo -e "${RED}Some tests failed.${NC}"
exit $FAIL
