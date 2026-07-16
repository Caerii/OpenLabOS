# Device bring-up — Mentra Live (K900) end-to-end

This runbook is the verified path from a fresh pair of Mentra Live
glasses to a green smoke run against the OpenLabOS adapter.

## Prerequisites

- Mentra Live glasses on the same WiFi as your workstation
- ADB on PATH (`adb version`)
- JDK 17 for Gradle (`java -version`)
- Repo bootstrapped: `pnpm install` and `uv sync` per service

## Step 1 — Find the glasses' IP

The easiest path is the MentraOS phone app: pair the glasses, join WiFi,
read the IP from the network status panel.

If you already have ADB-over-WiFi configured:

```bash
adb devices
adb -s <serial> shell ip route | awk '{print $9}'
```

Note the IPv4 address — the harness needs it.

## Step 2 — Build and install the device app

From the repo root:

```bash
cd apps/device-reference
./gradlew assembleDebug
adb -s <serial> install -r dashboard-device/build/outputs/apk/debug/dashboard-device-debug.apk
adb -s <serial> install -r core-app/build/outputs/apk/debug/core-app-debug.apk
adb -s <serial> install -r camera/build/outputs/apk/debug/camera-debug.apk
adb -s <serial> install -r devtools/build/outputs/apk/debug/devtools-debug.apk
```

For the first install on a fresh device, follow the migration-helper
runbook to claim device-owner status (otherwise the dashboard server
won't have the privileges it needs).

## Step 3 — Verify the on-device server is up

```bash
adb -s <serial> shell pidof os.openlab.labos.dashboard
curl -s http://<glasses-ip>:8080/health
```

Expected:

```json
{"ok": true}
```

If `/health` returns a 404 or connection-refused, check `adb logcat | grep
DashboardService` and confirm the boot receiver started the service.

## Step 4 — Run the OpenLabOS adapter smoke harness

```bash
pnpm --filter @openlabos/device-android smoke <glasses-ip>
```

Read-only baseline (the default); every probe should be ✓ PASS or
explicitly · SKIP. Then re-run with write tests:

```bash
pnpm --filter @openlabos/device-android smoke <glasses-ip> --write
```

This exercises camera start/stop/photo and wifi scan.

## Step 5 — Wire the adapter into the API

Boot the API with the adapter pre-registered:

```bash
cd services/api
OPENLABOS_DEVICE_BASE_URL=http://<glasses-ip>:8080 pnpm dev:hono
```

Confirm the registry sees it:

```bash
curl -s http://localhost:3847/api/adapters | jq
```

You should see one adapter entry whose `id` resolves to your glasses'
host and whose `capabilities` list is non-empty.

## Step 6 — Run a session end-to-end

```bash
SESSION=$(curl -s -X POST -H "content-type: application/json" \
  -d '{"protocol_id":"kitchen-tea","protocol_version":"1.0.0","device_adapter_id":"android@<glasses-ip>:8080"}' \
  http://localhost:3847/api/sessions | jq -r .session_id)
echo "session=$SESSION"

curl -s -X POST -H "content-type: application/json" \
  -d "{\"kind\":\"step_started\",\"at\":\"$(date -u +%FT%TZ)\",\"step_id\":\"place-mug\"}" \
  http://localhost:3847/api/sessions/$SESSION/events

curl -s http://localhost:3847/api/sessions/$SESSION | jq
```

The view should report `activeStepId: "place-mug"`.

## Acceptance gate

The bring-up is *green* when:

1. `pnpm --filter @openlabos/device-android smoke <ip>` reports zero failures.
2. `pnpm --filter @openlabos/device-android smoke <ip> --write` reports zero failures.
3. `/api/adapters` lists the device with `camera`, `imu`, `audio`, and
   `preview` capabilities at minimum.
4. A start → step_started → finalize round trip succeeds against the
   coordination API with the adapter in place.

## Troubleshooting

- **`/health` returns 404.** The dashboard service isn't running. Check
  `pidof os.openlab.labos.dashboard` and the boot receiver.
- **`/api/auth/token` returns 401.** Token auth is enabled. Either
  generate a token via `adb shell` per the dashboard-device README, or
  pass `--token TOK` to the harness.
- **`/api/preview/frame` returns empty.** The camera service hasn't
  started a session. Run the harness with `--write` so the camera is
  initialised.
- **Adapter not discovered.** The API does not auto-discover adapters
  yet; register one explicitly per the example in the adapter README, or
  set `OPENLABOS_DEVICE_BASE_URL` and let the api entry register it.
