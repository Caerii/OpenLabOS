#!/usr/bin/env bash
# End-to-end smoke: drive a kitchen-tea session through the OpenLabOS API
# against a live device adapter. Boots the API in the background with the
# device pre-registered, walks each protocol step as session events, then
# fetches the folded view + raw event log.
#
# Required env: OPENLABOS_DEVICE_BASE_URL, OPENLABOS_DEVICE_TOKEN
# Optional:     OPENLABOS_API_PORT (default 3849)

set -uo pipefail

PORT="${OPENLABOS_API_PORT:-3849}"
BASE="http://localhost:$PORT"
DEVICE="${OPENLABOS_DEVICE_BASE_URL:?OPENLABOS_DEVICE_BASE_URL must be set}"
TOKEN="${OPENLABOS_DEVICE_TOKEN:?OPENLABOS_DEVICE_TOKEN must be set}"
PROTOCOL_FILE="$(dirname "$0")/../examples/protocols/kitchen-tea.protocol.json"

# Boot the API in the background.
echo "→ booting API on :$PORT, device adapter at $DEVICE"
(
  cd "$(dirname "$0")/../services/api" && \
    OPENLABOS_API_PORT="$PORT" \
    OPENLABOS_DEVICE_BASE_URL="$DEVICE" \
    OPENLABOS_DEVICE_TOKEN="$TOKEN" \
    pnpm dev:hono
) >/tmp/openlabos-kitchen-api.log 2>&1 &
API_PID=$!

cleanup() {
  kill "$API_PID" 2>/dev/null || true
  pkill -f "src/hono/main.ts" 2>/dev/null || true
}
trap cleanup EXIT

# Wait for /api/healthz to come up.
for _ in {1..30}; do
  sleep 1
  if curl -sSf "$BASE/api/healthz" >/dev/null 2>&1; then break; fi
done

if ! curl -sSf "$BASE/api/healthz" >/dev/null 2>&1; then
  echo "✗ API didn't come up; tail of log:" >&2
  tail -30 /tmp/openlabos-kitchen-api.log >&2
  exit 1
fi

echo "→ /api/healthz ok"
HEALTH=$(curl -s "$BASE/api/healthz")
echo "  $HEALTH"

ADAPTERS=$(curl -s "$BASE/api/adapters")
ADAPTER_COUNT=$(echo "$ADAPTERS" | grep -o '"id"' | wc -l)
echo "→ adapters registered: $ADAPTER_COUNT"
[ "$ADAPTER_COUNT" -lt 1 ] && { echo "✗ no adapters"; exit 1; }

ADAPTER_ID="android@${DEVICE#http://}"
echo "→ targeting adapter: $ADAPTER_ID"

# Start a session.
echo
echo "→ POST /api/sessions"
SESSION_PAYLOAD=$(cat <<EOF
{
  "protocol_id": "kitchen-tea",
  "protocol_version": "1.0.0",
  "device_adapter_id": "$ADAPTER_ID",
  "operator_id": "smoke-runner",
  "tags": ["e2e-smoke", "live-device"]
}
EOF
)
SESSION=$(curl -s -X POST -H "content-type: application/json" \
  -d "$SESSION_PAYLOAD" "$BASE/api/sessions")
SESSION_ID=$(echo "$SESSION" | python -c "import sys,json;print(json.load(sys.stdin)['session_id'])")
echo "  session_id = $SESSION_ID"

# Walk every step in the protocol document, emitting started / frame / completed.
STEP_IDS=$(python -c "
import json, sys
with open(r'$PROTOCOL_FILE') as f: p = json.load(f)
print(' '.join(s['step_id'] for s in p['steps']))
")

NOW() { date -u +%FT%T.000Z; }

i=0
for step in $STEP_IDS; do
  i=$((i+1))
  echo
  echo "→ step $i: $step"

  curl -s -o /dev/null -X POST -H "content-type: application/json" \
    -d "{\"kind\":\"step_started\",\"at\":\"$(NOW)\",\"step_id\":\"$step\"}" \
    "$BASE/api/sessions/$SESSION_ID/events"
  echo "  · step_started"

  # Capture a frame from the live device by hitting its preview endpoint.
  FRAME_OUT="/tmp/openlabos-frame-$step.jpg"
  HTTP_CODE=$(curl -s -o "$FRAME_OUT" -w "%{http_code}" \
    -H "x-labos-token: $TOKEN" "$DEVICE/api/preview/frame")
  if [ "$HTTP_CODE" = "200" ]; then
    SIZE=$(wc -c < "$FRAME_OUT")
    echo "  · frame captured ($SIZE bytes → $FRAME_OUT)"
    curl -s -o /dev/null -X POST -H "content-type: application/json" \
      -d "{\"kind\":\"frame_captured\",\"at\":\"$(NOW)\",\"step_id\":\"$step\",\"frame_uri\":\"file://$FRAME_OUT\"}" \
      "$BASE/api/sessions/$SESSION_ID/events"
  else
    echo "  · frame skipped (HTTP $HTTP_CODE — preview not active is expected)"
  fi

  curl -s -o /dev/null -X POST -H "content-type: application/json" \
    -d "{\"kind\":\"step_completed\",\"at\":\"$(NOW)\",\"step_id\":\"$step\",\"succeeded\":true}" \
    "$BASE/api/sessions/$SESSION_ID/events"
  echo "  · step_completed"
done

echo
echo "→ POST /api/sessions/$SESSION_ID/finalize"
curl -s -X POST -H "content-type: application/json" \
  -d '{"status":"completed"}' \
  "$BASE/api/sessions/$SESSION_ID/finalize" | head -c 400
echo

echo
echo "→ GET /api/sessions/$SESSION_ID  (folded view)"
curl -s "$BASE/api/sessions/$SESSION_ID" | python -c "import sys,json;print(json.dumps(json.load(sys.stdin), indent=2))"

echo
echo "✓ kitchen-tea session run end-to-end"
