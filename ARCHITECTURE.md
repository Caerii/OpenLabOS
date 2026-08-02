# OpenLabOS Architecture

Use this page to locate responsibilities and contracts. For the narrative —
why these planes exist and what a run means — read
[docs/architecture/literate-architecture.md](docs/architecture/literate-architecture.md)
first. Service READMEs own setup and commands.

## Service boundaries

OpenLabOS separates the operator UI, the session API, model services, and
offline learning tools. They communicate through HTTP contracts and stored
artifacts.

```text
                ┌─────────────────────────────────────────────┐
   Presentation │  apps/web   apps/device-reference           │
                └─────────────────────────────────────────────┘
                         │ HTTP / WebSocket / WebRTC
                ┌─────────────────────────────────────────────┐
   Coordination │  services/api  (Express + Hono routes)       │
                │   • Session lifecycle                        │
                │   • Protocol registry                        │
                │   • Device adapter routing                   │
                │   • Artifact store (frames, events, judgments)│
                └─────────────────────────────────────────────┘
                         │ typed JSON / SSE
                ┌─────────────────────────────────────────────┐
   Reasoning    │  services/inference   services/perception   │
                │   • Step-check routing (cloud + local)       │
                │   • Frame analysis, judgment generation      │
                │   • Object detection, tracking, spatial summary │
                └─────────────────────────────────────────────┘
                         │ filesystem / object store
                ┌─────────────────────────────────────────────┐
   Learning     │  services/training   services/eval          │
                │   • SFT / DPO / GRPO / judgment LoRA         │
                │   • Dataset curation, freezing, metrics      │
                └─────────────────────────────────────────────┘
```

The web app does not call model providers directly. The API owns session state
and routes work but does not require a GPU. Inference and perception do not own
sessions. Training and evaluation stay out of the live request path.

## Design rules

Follow these rules when adding a service or moving code.

### 1. Keep the API focused on the live run

`services/api` owns:

- session lifecycle (start, append event, finalize)
- protocol registry (read-only after boot)
- device-adapter routing (forward to the right adapter; never speak the
  device's wire protocol itself)
- artifact storage (frames, events, judgments)

New model-provider integrations belong in `services/inference`, behind its
typed HTTP contract. Some provider code remains in the API from the earlier
monolith and should be treated as migration debt.

### 2. Keep hardware code in adapters

Put hardware-specific code in an adapter. The coordination contract is defined
in `services/api/src/core/adapters/types.ts`; device packages currently keep
compatible local types while that contract is consolidated. A `DeviceAdapter`
reports capabilities and health, then opens a `DeviceSession`. The session
owns preview and sensor streams, capability invocation, and cleanup. Read the
exported interfaces before implementing an adapter; this summary is not a
substitute for their method signatures.

The Android adapter is implemented. The webcam adapter is partial; ROS 2 and
serial adapters remain planned.

### 3. Treat demo protocols as examples, not special cases

Every protocol is a JSON document validated against `packages/protocol`. The
kitchen-tea document under `examples/protocols/` is the integration fixture.

- success criteria are extensible (registered by name with a Zod validator)
- protocols can declare expected `tools`, `reagents`, `containers`, `surfaces`
- protocol versioning is semver, with a forward-compat policy in
  [decision 0003](docs/decisions/0003-protocol-versioning.md)
- domain modules are planned; the current module code is not a published
  package interface

### 4. Define shared records once

`packages/protocol` exports Zod types and emitted JSON Schema. The training
service generates Python types from those schemas with
`scripts/regenerate-protocol-types.py`. Other Python services currently
maintain their runtime contract types directly.

### 5. Put reusable domain work in packages

Versioned domain packages are planned. Existing domain helpers in
`services/api` came from the monolith and are not stable extension points.

### 6. Record every training and evaluation input

Freeze dataset splits before training or evaluation. Record the protocol
version, base model, dataset hashes, and outputs in the run manifest. The
current tooling supports these artifacts, but reproducibility still depends on
using the documented commands and preserving the referenced inputs.

### 7. Test the boundary you change

- `packages/protocol`: Zod round-trip and golden-file JSON Schema tests
- `services/api`: Vitest and supertest, with no real models in CI
- `services/inference`: pytest with fixture replay
- `services/training`: pytest and smoke runs on a 64-frame slice
- `services/eval`: pytest with deterministic metric tests
- `apps/web`: Vitest for components and Playwright for the protocol-run flow

## Cross-cutting concerns

### Configuration

Prefer one validated settings module per service. The current API still has
configuration spread across legacy and newer modules.

### Telemetry

OpenTelemetry integration is planned. Current health, run, and artifact data
provide the available cross-service diagnostics.

### Storage

The API defaults to filesystem-backed sessions and local artifacts. SQLite is
still used by judgment and evaluation workflows. Postgres and S3-compatible
storage are not implemented deployment options.

### Auth

Compose binds the API to loopback by default. Experimental remote deployments
can require a bearer token with `OPENLABOS_AUTH_REQUIRED=true`; they still need
TLS at the reverse proxy. Multi-user identity and service credentials remain
roadmap work.

## What's explicitly out of scope (for now)

- Multi-tenant SaaS hosting.
- Custom hardware design.
- Closed-weights bundling. Local model weights are user-supplied.

## Decisions

Record cross-service choices in `docs/decisions/`. Start with:

- [0001: Monorepo tooling](docs/decisions/0001-monorepo-tooling.md)
- [0002: Schema as source of truth](docs/decisions/0002-schema-source-of-truth.md)
- [0003: Protocol versioning](docs/decisions/0003-protocol-versioning.md)
- [0004: Device adapter interface](docs/decisions/0004-device-adapter-interface.md)
- [0005: Reasoning gateway contract](docs/decisions/0005-reasoning-gateway-contract.md)
