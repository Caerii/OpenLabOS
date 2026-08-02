# OpenLabOS roadmap

OpenLabOS is pre-1.0 research software. Use this list to distinguish completed
work from the next engineering targets. Dates and release commitments are not
implied.

## Working now

- [x] Shared Zod protocol schema with emitted JSON Schema
- [x] Criterion evidence methods, canonical measurement units, and `measurement_recorded` events
- [x] Documented determinism boundary (events replay; judgments are observations)
- [x] Operator web console and engineering experience profile
- [x] Hybrid Express/Hono API with health and readiness probes
- [x] Android device adapter and reference Android application
- [x] Ollama and LM Studio step-check providers
- [x] Lightweight mock object detection for integration testing
- [x] Docker Compose stack for web, API, inference, and mock perception
- [x] Experimental Grounded SAM 2 GPU Compose overlay
- [x] Run evidence catalog, replay fixtures, and evaluation primitives
- [x] Persist sessions across API restarts
- [x] Automated end-to-end Compose protocol-run test
- [ ] Short operator-console demo and architecture screenshot

## Next

- [ ] Complete webcam/WebRTC adapter
- [ ] Define and implement serial and ROS 2 adapter conformance tests
- [ ] Stabilize run bundle and media storage contracts
- [ ] Add authentication before supporting non-loopback deployments
- [ ] Add OpenTelemetry traces after the service boundaries stabilize
- [ ] Validate the Grounded SAM 2 GPU overlay in CI or a documented GPU test
- [ ] Generate the TypeScript SDK from the published OpenAPI document
- [ ] Implement and publish the Python SDK
- [ ] Establish supported Windows, Linux, and macOS test matrices
- [ ] Eval reports: per-step metrics, n, bootstrap CIs, and known-failure fixtures
- [ ] Confidence calibration measurement for at least one judgment producer
- [ ] Wire instrument / display readings into `measurement_recorded` events on the live path

## Later

- [ ] Domain module packages with versioned vocabulary and prompt fragments
- [ ] Signed desktop releases with upgrade and rollback documentation
- [ ] Reproducible training/evaluation datasets with provenance manifests
- [ ] Hardware-adapter certification and compatibility matrix
- [ ] Versioned public API compatibility policy
- [ ] Security review and supported network deployment modes
- [ ] Sensor adapters that emit `measurement_recorded` without operator entry

## Release gates

OpenLabOS should not call itself beta until:

1. the Compose smoke test and one protocol-run test pass in CI;
2. sessions and evidence survive service restarts;
3. the public API and protocol schemas have compatibility policies;
4. authentication exists for any documented network-accessible deployment; and
5. installation and rollback are tested on every supported platform.
