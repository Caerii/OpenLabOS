# Testing in OpenLabOS

OpenLabOS treats testing as a *literate artefact* — each test names the
behaviour it pins, in prose any reader can follow, then proves it with a small
example. The goal is for someone reading `tests/` alone to learn what the
system does and why.

## The three rings

We organise tests in three concentric rings. Costs grow outward; coverage
expectations shrink.

```
   ┌────────────────────────────────────────────────────┐
   │  Ring 3 — End-to-end                                │
   │  Real device adapter, real model, real storage.     │
   │  A handful of golden-path scenarios per protocol.   │
   │  Run nightly + on release.                          │
   │  ┌─────────────────────────────────────────────┐    │
   │  │  Ring 2 — Service contract                   │    │
   │  │  Each service against typed clients,         │    │
   │  │  with mocked downstreams. ~40-80 per service.│    │
   │  │  Run on every PR.                            │    │
   │  │  ┌───────────────────────────────────────┐   │    │
   │  │  │  Ring 1 — Pure unit                    │   │    │
   │  │  │  Schema, parsers, pure functions.      │   │    │
   │  │  │  Hundreds. Run on every save.          │   │    │
   │  │  └───────────────────────────────────────┘   │    │
   │  └─────────────────────────────────────────────┘    │
   └────────────────────────────────────────────────────┘
```

A test belongs in the innermost ring that can pin its behaviour. Promote tests
outward only when the behaviour genuinely depends on the next ring.

## Conventions

- **One file per behaviour group.** `protocol.test.ts`, not `tests-2.ts`.
- **Each `describe` is a contract sentence.** *"ProtocolSchema accepts the
  canonical kitchen-tea example"* reads like a spec line.
- **Every Ring 1 test is hermetic.** No network, no clock, no filesystem
  outside the test's own `tmp` dir.
- **Every Ring 2 test pins a single contract.** Either request → response
  shape, or an event sequence emitted from a known input.
- **Fixtures are committed.** `__fixtures__/` lives next to the test that owns
  it. Fixture files are minified with intent: a fixture is a specification.
- **Goldens are regenerated, never hand-edited.** Each golden has an `update`
  command in the test file's docstring.

## Per-package matrix

| Package / service        | Framework        | Where        | Notable kinds of test                                |
| ------------------------ | ---------------- | ------------ | ---------------------------------------------------- |
| `packages/protocol`      | Vitest           | `tests/`     | Round-trip, golden JSON Schema, negative parse cases |
| `packages/sdk-ts`        | Vitest           | `tests/`     | Generated-client contract, replay against fixtures   |
| `packages/ui`            | Vitest + jsdom   | `tests/`     | Component render, accessibility (axe)                |
| `packages/modules/*`     | Vitest           | `tests/`     | Prompt golden, vocabulary additions valid            |
| `services/api`           | Vitest+supertest | `tests/`    | Route contracts, storage round-trip, replay fidelity |
| `services/inference`     | pytest + VCR     | `tests/`     | Provider routing, prompt rendering, retry policy     |
| `services/perception`    | pytest           | `tests/`     | Model adapter contract, frame I/O                    |
| `services/training`      | pytest           | `tests/`     | Dataset construction, loss-step sanity, smoke runs   |
| `services/eval`          | pytest           | `tests/`     | Metric correctness, hybrid validator decision tables |
| `apps/web`               | Vitest + Playwright | `tests/` and `e2e/` | Component + protocol-run flow                |

## How to run

```bash
# Everything fast (Ring 1 + Ring 2 across the workspace):
pnpm test

# A single TS package:
pnpm --filter @openlabos/protocol test

# A Python service:
cd services/eval && uv run pytest -q

# End-to-end (Ring 3) — opt-in, requires Docker:
pnpm test:e2e
```

## Coverage targets

- Ring 1: 90% line coverage, 100% branch coverage on parsers and validators.
- Ring 2: every public route + every published event variant.
- Ring 3: every protocol in `examples/protocols/` runs to a final `succeeded`
  manifest under the deterministic-replay device adapter.

## Replay-as-test

The most powerful test we ship is *replay*. A bug-causing run is captured as a
`RunManifest` (frames, events, judgments). We commit it to
`tests/replay/<bug-id>/`, and a tiny harness re-runs the API service against
the manifest, asserting the new code produces an equivalent — or strictly
better — outcome. Every regression we fix gets a replay test; the suite grows
into a living spec of "things that used to be broken".
