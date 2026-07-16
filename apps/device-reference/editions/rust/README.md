# Rust Edition

This edition is an experimental Rust service scaffold implementing the LabOS device API
shape on a local HTTP server with no external crates. It is intended for measuring the native
service path before adding Android packaging through `cargo-apk`, `android-activity`, or a
Java/Rust JNI wrapper.

## Run

```powershell
cd device\editions\rust
cargo test
cargo run
```

The server listens on `http://127.0.0.1:8092`.

Implemented prototype features:

- LabOS health, device status, module status, preview health, frame, and recording endpoints.
- Idempotent preview and recording transitions.
- Bounded event log at `/api/events`.
- Capability diagnostics at `/api/diagnostics`.
- Synthetic MJPEG stream at `/api/preview/stream`.
- No external crates, which keeps the native baseline small and easy to port.

## Benchmark

```powershell
.\scripts\device-edition-benchmark.ps1 -Edition rust -BaseUrl http://127.0.0.1:8092 -DurationSeconds 10
```

## Android Path

The practical Android route is likely a small Java/Kotlin bootstrap plus Rust native library
for frame rings, encode/decode, telemetry, and low-latency control. A pure Rust NativeActivity
can be evaluated later, but it is higher risk for device-owner integration.
