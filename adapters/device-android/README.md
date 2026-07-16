# @openlabos/device-android

`DeviceAdapter` implementation for the Android device-owner reference app
(`apps/device-reference`). Speaks the on-device dashboard server's HTTP
API on port 8080. The wire shapes are byte-compatible with the legacy
upstream, so an unmodified Mentra Live image accepts these calls.

## Usage

```ts
import { AndroidDeviceAdapter } from "@openlabos/device-android";
import { globalAdapterRegistry } from "@openlabos/api/core/adapters/registry";

const glasses = new AndroidDeviceAdapter({ baseUrl: "http://192.168.1.42:8080" });
await globalAdapterRegistry.register(glasses);
```

## Smoke harness

Once the device is on the network and the dashboard server is running,
exercise every endpoint:

```bash
pnpm --filter @openlabos/device-android smoke 192.168.1.42
```

Add `--write` to also exercise camera start/stop/photo and wifi scan.
Add `--token TOK` if you've enabled token auth.

The harness emits one line per probe:

```
✓ PASS health                       {"ok":true}
✓ PASS auth.token                   {"token":"…"}
✓ PASS status                       {"battery":{"percent":92,…
…
# 18 pass  0 fail  4 skip
```

## Endpoints exercised

The smoke harness covers everything the on-device dashboard server
exposes:

- `/health`, `/api/auth/token`, `/api/status`, `/api/system/info`
- `/api/battery/*`, `/api/wifi/*`, `/api/mcu/*`, `/api/settings`
- `/api/camera/*`, `/api/preview/*`
- `/api/audio/*`
- `/api/dev/{shell,logcat,files,packages,props,crashes}`
- `/api/live-coach/audio/*`
- `/api/events` (SSE; URL only)

If a route is added on the device side, this adapter must be updated to
match.
