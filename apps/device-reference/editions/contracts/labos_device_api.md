# LabOS Device API Contract

All device editions must expose equivalent behavior for these capabilities. The current Java
baseline exposes them through the dashboard backend at `http://127.0.0.1:3847`.
Future editions may expose the same paths directly on device or through an adapter.

## Required Endpoints

| Method | Path | Required behavior |
| --- | --- | --- |
| `GET` | `/api/health` | Return service health and version metadata. |
| `GET` | `/api/device/status` | Return device connection state, serial/IP, and transport. |
| `GET` | `/api/labos/status` | Return module install/running/version state when available. |
| `POST` | `/api/preview/start` | Start camera preview streaming. Must be idempotent. |
| `POST` | `/api/preview/stop` | Stop camera preview streaming. Must be idempotent. |
| `GET` | `/api/preview/health` | Return preview state, FPS, frame count, frame reachability, recording state, and recording paths when available. |
| `GET` | `/api/preview/frame` | Return the latest JPEG frame with `image/jpeg` content type. |
| `GET` | `/api/preview/stream` | Return MJPEG frames with `multipart/x-mixed-replace` content type when the edition supports streaming. |
| `POST` | `/api/preview/recording/start` | Start native device recording. Must not toggle recording off if already active. |
| `POST` | `/api/preview/recording/stop` | Stop native device recording. Must not start recording if already inactive. |
| `GET` | `/api/preview/recording/status` | Return recording state, active path, last path, and source of truth. |
| `GET` | `/api/events` | Return recent timestamped device events for debugging and benchmark traceability. |
| `GET` | `/api/diagnostics` | Return edition capabilities, uptime, and implementation-specific debug counters. |
| `GET` | `/api/metrics` | Return request counters, frame counters, and lightweight runtime metrics. |
| `POST` | `/api/control/reset` | Reset transient prototype state before benchmark runs. Production editions may omit this. |

## Required Preview Health Shape

```json
{
  "streaming": true,
  "fps": 12.4,
  "frameCount": 123,
  "frameReachable": true,
  "frameBytes": 45201,
  "recording": false,
  "activeVideoPath": null,
  "lastVideoPath": "/sdcard/Movies/LabOS/session.mp4"
}
```

## Required Event Semantics

Each edition should emit timestamped events for:

- `preview_started`
- `preview_stopped`
- `recording_started`
- `recording_stopped`
- `frame_served`
- `camera_error`
- `module_version_reported`
- `diagnostics_requested`

Timestamps should be ISO-8601 UTC where possible. Latency-sensitive logs may also include
monotonic milliseconds.

## Benchmark Metrics

The shared benchmark harness records:

- Health endpoint latency p50 and p95.
- Preview start latency.
- Time to first reachable frame.
- Polled frame throughput over a fixed duration.
- Average JPEG frame size.
- Recording start/stop latency when enabled.
- Module version/update status when available.
- Event log availability and transition coverage.
- Diagnostics capability list.
