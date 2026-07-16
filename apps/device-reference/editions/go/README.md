# Go Edition

This edition is an experimental Go service scaffold that implements the LabOS device API
shape on a local HTTP server. It is useful for benchmarking control-plane overhead and API
semantics before adding Android packaging through `gomobile`.

## Run

```powershell
cd device\editions\go
go test ./...
go run ./cmd/labos-device
```

The server listens on `http://127.0.0.1:8091`.

Implemented prototype features:

- LabOS health, device status, module status, preview health, frame, and recording endpoints.
- Idempotent preview and recording transitions.
- Bounded event log at `/api/events`.
- Capability diagnostics at `/api/diagnostics`.
- Synthetic MJPEG stream at `/api/preview/stream`.

## Benchmark

```powershell
.\scripts\device-edition-benchmark.ps1 -Edition go -BaseUrl http://127.0.0.1:8091 -DurationSeconds 10
```

## Android Path

For a true device APK, this needs a thin Android entry point via `gomobile`. That should only
be added after the Java baseline benchmark is captured, because the Android packaging layer
can dominate startup and lifecycle behavior.
