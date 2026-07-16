# Verification — End-to-end device run

**Date:** 2026-05-04
**Hardware:** Mentra Live (K900), Android 11, MTK6761, dashboard server v0.3.0
**Network:** 192.168.50.0/24, glasses at 192.168.50.122

This note records the first full end-to-end run of OpenLabOS against
real Mentra Live hardware.

## Discovery

The legacy `dashboard/src/server/adb.ts` scans port 5555 across
`192.168.0/1/50.x` and the host's own /24. Reproducing in shell:

```bash
for sub in 192.168.50 192.168.1 192.168.0; do
  for i in $(seq 1 254); do
    (timeout 1 bash -c "echo > /dev/tcp/$sub.$i/5555" 2>/dev/null \
      && echo "$sub.$i:5555 OPEN") &
  done
done
wait
```

Returned `192.168.50.122:5555 OPEN`.

```bash
adb connect 192.168.50.122:5555
```

## Auth token recovery

The dashboard server requires an `X-LabOS-Token` header. The token is
persisted in shared prefs:

```bash
adb shell 'run-as com.augmentiv.labos.dashboard cat \
  /data/data/com.augmentiv.labos.dashboard/shared_prefs/labos_dashboard_auth.xml'
# → <string name="api_token">…</string>
```

## Smoke harness (read-only)

```bash
pnpm --filter @openlabos/device-android smoke 192.168.50.122 \
  --token <TOKEN>
```

Result: **18 pass / 0 fail / 4 skip** (skips are write-mode-only probes).

## Smoke harness (write mode)

```bash
pnpm --filter @openlabos/device-android smoke 192.168.50.122 \
  --token <TOKEN> --write
```

Result: **22 pass / 0 fail / 0 skip** — including `camera.start`,
`camera.photo`, `camera.stop`, `wifi.scan` against the live device.

## End-to-end session run

```bash
OPENLABOS_DEVICE_BASE_URL=http://192.168.50.122:8080 \
OPENLABOS_DEVICE_TOKEN=<TOKEN> \
bash scripts/run-kitchen-tea.sh
```

The script boots the API with the device adapter pre-registered, walks
the five kitchen-tea steps as session events, then finalizes. Result:

```json
{
  "session": {
    "session_id": "f57d514d-2ac4-40ae-91dc-9fa85513fee3",
    "protocol_id": "kitchen-tea",
    "protocol_version": "1.0.0",
    "device_adapter_id": "android@192.168.50.122:8080",
    "operator_id": "smoke-runner",
    "started_at": "2026-05-04T21:17:09.011Z",
    "ended_at":   "2026-05-04T21:17:18.994Z",
    "status": "completed",
    "tags": ["e2e-smoke", "live-device"]
  },
  "lastCompletedStepId": "place-on-tray",
  "counts": {
    "framesCaptured": 0,
    "judgmentsEmitted": 0,
    "stepsCompleted": 5,
    "operatorNotes": 0
  }
}
```

## Findings — recorded as deltas, not surprises

### Auth header is `X-LabOS-Token`

The on-device server checks `X-LabOS-Token`, not `Authorization: Bearer`.
The adapter client sends the header in lower case (`x-labos-token`)
which the server accepts case-insensitively. Captured in
`adapters/device-android/src/client.ts`.

### NanoHTTPD requires `Connection: close` from Node fetch

The on-device server is NanoHTTPD. Node's default HTTP/1.1 keep-alive
behaviour leaves bytes from a previous response unread, and the next
request line gets parsed with body bytes prepended ("HTTP verb {}POST
unhandled"). Sending `Connection: close` per request avoids the issue.
Captured in the client's request builder.

### `devShell` body field is `command`, not `cmd`

The legacy AugmentivLabOS dashboard had drift between client and server
on this name. Server is canonical. Captured.

### Camera response shape is `{success, action}`

Not `{accepted}` as initial typings assumed. Updated.

### `mcuConnected` drift between top-level and `coreStatus`

`/api/status` returns `mcuConnected: false` at the top level while
`coreStatus.mcuConnected` is `true` in the same payload. This is a
real on-device bug, not an adapter issue. Logged for the device-side
fix; the OpenLabOS adapter surfaces both fields verbatim.

### Preview MJPEG socket not bound on this firmware

Calling `/api/camera/start` returns `success:true` and broadcasts
`ACTION_START_PREVIEW`, but the camera APK on this build doesn't bind
its `127.0.0.1:8089` MJPEG server. `/api/preview/frame` therefore
returns `HTTP 500 — Failed to connect to /127.0.0.1:8089`. The kitchen
tea script handles this gracefully ("frame skipped"). Fix needs to land
in the camera module — out of scope for the adapter.

## Next regressions to guard against

- The 22-probe smoke run is now a fixture corpus (decision 0015,
  replay-as-test). Any device firmware change that breaks a probe
  fails the parity gate.
- The session lifecycle — start → events × 5 → finalize → folded view
  — is now an integration test fixture in
  `services/api/tests/replay/`.
