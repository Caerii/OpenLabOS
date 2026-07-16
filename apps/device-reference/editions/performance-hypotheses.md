# Performance Hypotheses

These are hypotheses to test, not conclusions.

## Java Baseline

Expected to win on real hardware integration. Camera startup and recording latency are dominated
by Android Camera2/MediaRecorder and hardware pipeline behavior, so language differences should
matter less than lifecycle correctness.

## Flutter Edition

Expected to win on UI quality and iteration speed. It should not own hot camera paths unless
measurements show platform channel overhead is negligible for the workload.

## Go Edition

Expected to be excellent for local loopback HTTP and CLI tooling. On-device Android packaging and
camera integration are likely its weak points.

## Rust Edition

Expected to be best for native frame processing, ring buffers, binary telemetry, and deterministic
memory behavior. Pure Rust Android app ownership is likely not worth the lifecycle/device-owner
friction; JNI under Java/Kotlin is the practical path.

## Required Real Measurements

- Java on-glasses preview start latency.
- Java on-glasses first frame latency.
- Java on-glasses native recording start/stop latency.
- Sustained 10-minute recording reliability.
- Frame pull p50/p95 while Gemini supervisor is active.
- Battery delta over 10-minute preview+recording.
- CPU/memory under preview-only vs preview+recording.

