# Test Catalog

A forward-looking inventory of the test surface OpenLabOS commits to. This is
the spec the test suite grows into — every entry is either implemented and
passing, or explicitly marked *planned*. Together they form an executable
description of the system.

The catalog is grouped by what each test pins, not by file. A few entries
collapse multiple files into one richer test on purpose; that is the goal of a
catalog over a manifest.

## Legend

- ✅ **Implemented and passing.**
- 🚧 **Planned — milestone-scoped.**
- 🔬 **Replay-as-test** — backed by a captured `RunManifest` fixture.

## Schema and domain logic — `packages/protocol`

| What it pins                                                              | Test                                                  | Status |
| ------------------------------------------------------------------------- | ----------------------------------------------------- | ------ |
| The canonical `kitchen-tea` example parses cleanly                        | `tests/protocol.test.ts`                              | ✅     |
| `Protocol` round-trips through JSON without semantic drift                | `tests/protocol.test.ts`                              | ✅     |
| `protocol_version` rejects anything that isn't semver                     | `tests/protocol.test.ts`                              | ✅     |
| Each core success-criterion variant accepts a valid example               | `tests/protocol.test.ts`                              | ✅     |
| Namespaced ids (`object:`, `surface:`, …) reject unnamespaced strings     | `tests/protocol.test.ts`                              | ✅     |
| Every `SessionEvent` variant validates in isolation                       | `tests/session.test.ts`                               | ✅     |
| Session event logs round-trip preserving order                            | `tests/session.test.ts`                               | ✅     |
| `Judgment.verdict` is closed; non-listed verdicts rejected                | `tests/judgment.test.ts`                              | ✅     |
| Observed-object confidence is clamped to `[0, 1]`                         | `tests/judgment.test.ts`                              | ✅     |
| Criterion evidence indexes back to the step's `success_criteria`          | `tests/judgment.test.ts`                              | ✅     |
| `RunManifest` is a closed snapshot: protocol-hash + events + judgments    | `tests/run.test.ts`                                   | 🚧     |
| Emitted JSON Schema is byte-stable across builds (golden file)            | `tests/json-schema.golden.test.ts`                    | 🚧     |

## Coordination plane — `services/api`

| What it pins                                                              | Test                                                  | Status |
| ------------------------------------------------------------------------- | ----------------------------------------------------- | ------ |
| `/healthz` and `/readyz` reflect dependency status, not just process up   | `tests/health.test.ts`                                | 🚧     |
| Protocol registry rejects malformed protocols at boot (fail fast)          | `tests/protocol-registry.test.ts`                    | 🚧     |
| `POST /sessions` creates an active session keyed by uuid                  | `tests/sessions.routes.test.ts`                       | 🚧     |
| Session events are append-only; a replay rebuilds final state             | `tests/replay-recovery.test.ts`                       | 🚧     |
| Run-manifest builder emits a deterministic byte-equal manifest            | `tests/run-manifest-builder.test.ts`                  | 🚧     |
| Artifact store stores frames + retrieves by content hash                  | `tests/artifact-store.test.ts`                        | 🚧     |
| Step-segment derivation is idempotent over duplicate events               | `tests/step-segments.test.ts`                         | 🚧     |
| File-route parsing rejects directory traversal                            | `tests/files.routes.test.ts`                          | 🚧     |
| Adherence policy: "skip step" requires explicit operator action           | `tests/adherence-policy.test.ts`                      | 🚧     |
| Recording state machine: `idle → arming → recording → flushing → idle`    | `tests/recording.service.test.ts`                     | 🚧     |
| Workflow presets validate against the supervision contract                | `tests/workflows.test.ts`                             | 🚧     |
| Agents endpoint returns deterministic role specs                          | `tests/agents.routes.test.ts`                         | 🚧     |
| Configuration: feature flags + runtime config resolve in priority order   | `tests/config.test.ts`                                | 🚧     |
| Static analysis: vendor SDKs are not imported anywhere in `services/api`  | `tests/no-vendor-imports.test.ts`                     | 🚧     |
| End-to-end contract: web SDK can drive a session start → finalize         | `tests/contract.test.ts`                              | 🚧     |

## Reasoning plane — `services/inference` and `services/perception`

| What it pins                                                              | Test                                                  | Status |
| ------------------------------------------------------------------------- | ----------------------------------------------------- | ------ |
| Provider router picks the right provider per capability + cost ceiling    | `inference/tests/test_router.py`                      | 🚧     |
| Together provider request shape matches its API surface (VCR replay)      | `inference/tests/test_provider_together.py`           | 🚧     |
| RunPod provider obeys the cost guard before issuing a job                 | `inference/tests/test_provider_runpod.py`             | 🚧     |
| Async pipeline: per-step analysis runs concurrently and joins in order    | `inference/tests/test_async_pipeline.py`              | 🚧     |
| Multi-scale evidence selection prefers higher-resolution when available   | `inference/tests/test_multiscale.py`                  | 🚧     |
| Spatial summary is stable under small camera jitter                       | `inference/tests/test_spatial_summary.py`             | 🚧     |
| Spatial-reasoner bbox geometry is correct under the documented coords    | `inference/tests/test_spatial_reasoner.py`            | 🚧     |
| Entity segmentation adapter conforms to the runtime contract              | `perception/tests/test_segmentation.py`               | 🚧     |
| Capture-readiness signal is monotone within a step                        | `perception/tests/test_capture_readiness.py`          | 🚧     |
| Perception runtime: model load → warm → infer → unload is leak-free      | `perception/tests/test_runtime.py`                    | 🚧     |

## Voice plane — `services/voice`

| What it pins                                                              | Test                                                  | Status |
| ------------------------------------------------------------------------- | ----------------------------------------------------- | ------ |
| Voice-asset bundle resolves per protocol step                             | `tests/test_voice_assets.py`                          | 🚧     |
| LiveKit session brokerage: token mint → room join → cleanup               | `tests/test_livekit_session.py`                       | 🚧     |
| Protocol context is rendered into the voice agent's system prompt         | `tests/test_protocol_context.py`                      | 🚧     |
| Recording lifecycle aligned with the API's recording state machine        | `tests/test_recordings.py`                            | 🚧     |
| WebRTC negotiation produces the documented SDP shape                      | `tests/test_webrtc.py`                                | 🚧     |
| Step-audio cues fire on `step_started`, suppressed on operator-mute       | `tests/test_step_audio.py`                            | 🚧     |

## Learning plane — `services/training` and `services/eval`

| What it pins                                                              | Test                                                  | Status |
| ------------------------------------------------------------------------- | ----------------------------------------------------- | ------ |
| Dataset freeze: same inputs → same hash, byte-stable across OS            | `training/tests/test_dataset_freeze.py`               | 🚧     |
| SFT smoke: 64-frame slice trains for one step without NaN loss            | `training/tests/test_train_sft.py`                    | 🚧     |
| GRPO trainer wires up reward function and step counter                    | `training/tests/test_train_grpo.py`                   | 🚧     |
| Isaac Lab export emits a deterministic asset bundle                       | `training/tests/test_isaac_export.py`                 | 🚧     |
| Hybrid validator decision table matches the published spec                | `eval/tests/test_hybrid_validator.py`                 | 🚧     |
| Run metrics: per-step accuracy + adherence aggregate correctly            | `eval/tests/test_run_metrics.py`                      | 🚧     |
| Saved-run analysis reproduces baseline numbers on a frozen manifest       | `eval/tests/test_saved_run_analysis.py`               | 🔬     |

## Adapters

| What it pins                                                              | Test                                                  | Status |
| ------------------------------------------------------------------------- | ----------------------------------------------------- | ------ |
| `device-android` proxy preserves request headers + status codes           | `adapters/device-android/tests/proxy.test.ts`         | 🚧     |
| `device-android` smoke against a real device (skipped without `DEVICE_IP`)| `apps/device-reference/tests/smoke.device.test.ts`    | 🚧     |
| `device-webcam` produces frames at the requested cadence (±10%)           | `adapters/device-webcam/tests/cadence.test.ts`        | 🚧     |
| `device-ros2` topic bridge emits `frame_captured` per `image_raw` msg     | `adapters/device-ros2/tests/bridge.test.ts`           | 🚧     |

## Frontend — `apps/web`

| What it pins                                                              | Test                                                  | Status |
| ------------------------------------------------------------------------- | ----------------------------------------------------- | ------ |
| Generated SDK paths match the API's OpenAPI document                      | `packages/sdk-ts/tests/paths.test.ts`                 | 🚧     |
| `<ProtocolRun>` advances on `step_completed: succeeded`                   | `apps/web/tests/protocol-run.test.tsx`                | 🚧     |
| Run library lists, filters, and opens a run manifest                      | `apps/web/tests/run-library.test.tsx`                 | 🚧     |
| Voice-asset preview component plays cue per step                          | `apps/web/tests/voice-assets.test.tsx`                | 🚧     |
| End-to-end (Playwright): start a session → finalize succeeded             | `apps/web/e2e/protocol-run.spec.ts`                   | 🚧     |

## Replay-as-test

The most powerful test we ship is *replay*. A captured `RunManifest` (frames,
events, judgments) is committed to `services/api/tests/replay/<scenario>/`.
A small harness re-runs the API against the manifest and asserts the new code
produces an equivalent — or strictly better — outcome.

Initial replay scenarios:

| Scenario                                              | Status |
| ----------------------------------------------------- | ------ |
| `kitchen-tea/golden-path.run.json`                    | 🚧     |
| `kitchen-tea/spilled-water-recovery.run.json`         | 🚧     |
| `kitchen-tea/missed-stir-count.run.json`              | 🚧     |

Every regression we fix gets a replay scenario. The suite grows into a living
spec of "things that used to be broken".

## Acceptance gate

The OpenLabOS *suite gate* is green when:

1. Every catalog entry above is ✅.
2. Replay scenarios pass byte-for-byte against the committed manifests.
3. `pnpm test` and `uv run pytest` (in each Python service) pass on
   Linux + macOS + Windows runners.
