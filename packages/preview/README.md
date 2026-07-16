# @openlabos/preview

Open, transport-agnostic preview protocol for OpenLabOS.

This package is the **TypeScript source of truth** for:

- MJPEG wire format (`labos-frame-boundary`)
- Preview health + metrics schemas
- Encode modes (`software-jpeg`, `libjpeg-turbo`, `hardware-h264`)
- Transports (`mjpeg-http`, `h264-annexb-http`, `h264-fmp4-http`, `frame-poll-http`, `webrtc`)
- Named profiles (`balanced`, `lowLatency`, `highResolution`, …)
- Rolling frame buffer + FPS estimation + readiness diagnostics

## Usage

```ts
import {
  PREVIEW_PROFILES,
  normalizePreviewConfig,
  previewDiagnostic,
  tapPreviewStreamChunk,
} from "@openlabos/preview";
```

## Subpaths

| Import | Contents |
|--------|----------|
| `@openlabos/preview` | Full barrel export |
| `@openlabos/preview/wire` | MJPEG parser/tap |
| `@openlabos/preview/health` | Health schema + diagnostics |
| `@openlabos/preview/config` | Config schema + profiles |
| `@openlabos/preview/transport` | Transport + encode registries |

## Reference implementations

| Layer | Path |
|-------|------|
| Device encoder/server | `apps/device-reference/camera` |
| Host coordination | `services/api/src/preview` |
| Web client helper | `apps/web/src/lib/preview` |
| HTTP contract | `apps/device-reference/editions/contracts` |

## Profiles

All profiles are **config-only** — switch encode mode and transport without forking the protocol.

- `balanced` — MJPEG @ 480×360 (default, maximum compatibility)
- `lowLatency` — hardware H.264 Annex-B @ 720p30
- `highResolution` — MJPEG @ 720p12
- `turboJpeg` — libjpeg-turbo when NDK module is present
- `framePoll` — JPEG polling fallback
- `webrtc` — experimental gateway transport
