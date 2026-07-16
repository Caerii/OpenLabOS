# Device Edition Benchmarks

Benchmark artifacts are written to `runs/` by `scripts/device-edition-benchmark.ps1`.
The `runs/` directory is ignored by git because each run is environment-specific.

## Single Edition

```powershell
.\scripts\device-edition-benchmark.ps1 -Edition go -BaseUrl http://127.0.0.1:8091 -DurationSeconds 5
```

## Go + Rust Loopback Suite

```powershell
.\scripts\run-device-edition-benchmarks.ps1 -Edition all -DurationSeconds 5
```

## Interpreting Results

- Go and Rust currently benchmark synthetic loopback servers, not the Mentra camera.
- Java benchmarks should be run against the dashboard backend while the glasses are connected.
- Flutter is UI scaffold only until Flutter SDK and the Android shell are installed.
- The first request in a run can include process warmup and PowerShell client overhead, so p95
  is less meaningful than repeated longer runs.

