# LabOS Device Editions

This directory organizes parallel LabOS device implementations for measured comparison.
The current production implementation remains the Java/Android multi-APK stack at the
top of `device/` until the demo-critical path is stable.

## Editions

| Edition | Status | Source | Purpose |
| --- | --- | --- | --- |
| Java | Production baseline | `device/core-*`, `device/camera`, `device/dashboard-device`, `device/devtools` | Current device-owner, camera, preview, recording, and on-device API stack. |
| Flutter | Scaffold | `device/editions/flutter` | Higher-quality device UI/control surface while still delegating hardware-critical paths to Android platform channels. |
| Go | Experimental scaffold | `device/editions/go` | Low-overhead service/control-plane candidate for HTTP, state, telemetry, and streaming experiments. |
| Rust | Experimental scaffold | `device/editions/rust` | Lowest-overhead native candidate for streaming, ring buffers, frame processing, and sensor ingestion. |

## Contract

Every edition must implement the same observable contract before it can be benchmarked:

- Device status and module health.
- Preview start/stop/health.
- Current JPEG frame endpoint.
- Native recording start/stop/status.
- Deterministic event logging with timestamps.
- Version metadata for installed/build comparison.
- Diagnostics and capability reporting.

The canonical contract is documented in `contracts/labos_device_api.md`.

## Benchmarking

Use the shared benchmark harness from the repo root:

```powershell
.\scripts\device-edition-benchmark.ps1 -Edition java -BaseUrl http://127.0.0.1:3847 -DurationSeconds 15
```

The harness writes JSON results under `device/editions/benchmarks/runs/`.
Each edition should be tested with the same glasses, WiFi, resolution, and recording settings.
The Go and Rust editions currently run as loopback contract simulators; they are useful for
API semantics and service overhead but do not yet exercise the real Mentra camera.

## Why Java Was Not Moved

The dashboard, deploy routes, and flashing scripts currently reference APK outputs such as
`device/camera/build/outputs/apk/debug/camera-debug.apk`. Moving the Java modules would
force a broad path migration and could break the active glasses demo. The safer sequence is:

1. Keep Java paths stable for the demo.
2. Add edition descriptors and benchmarks.
3. Build candidate Flutter/Go/Rust implementations behind the same API contract.
4. Move Java into `editions/java` only after deploy/build scripts are updated and tested.
