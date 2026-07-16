# OpenLabOS Architecture

This document explains *why* the system is shaped the way it is. For *how to
use it*, see the per-service READMEs.

## The four planes

OpenLabOS separates concerns into four horizontal planes. Each plane talks to
the next through a small, documented contract — never by reaching across.

```
                ┌─────────────────────────────────────────────┐
   Presentation │  apps/web   apps/device-reference           │
                └─────────────────────────────────────────────┘
                         │ HTTP / WebSocket / WebRTC
                ┌─────────────────────────────────────────────┐
   Coordination │  services/api  (Hono, OpenAPI-typed)         │
                │   • Session lifecycle                        │
                │   • Protocol registry                        │
                │   • Device adapter routing                   │
                │   • Artifact store (frames, events, judgments)│
                └─────────────────────────────────────────────┘
                         │ gRPC-style typed JSON / SSE
                ┌─────────────────────────────────────────────┐
   Reasoning    │  services/inference   services/perception   │
                │   • LLM routing (cloud + local)              │
                │   • Frame analysis, judgment generation      │
                │   • Segmentation, tracking, spatial summary  │
                └─────────────────────────────────────────────┘
                         │ filesystem / object store
                ┌─────────────────────────────────────────────┐
   Learning     │  services/training   services/eval          │
                │   • SFT / DPO / GRPO / judgment LoRA         │
                │   • Dataset curation, freezing, metrics      │
                └─────────────────────────────────────────────┘
```

The presentation plane never calls a model provider directly. The coordination
plane never owns a GPU. The reasoning plane never owns session state. The
learning plane never runs in the request path. These constraints are the
entire point of the split.

## Design rules

These rules are load-bearing. They explain why the directory tree looks the
way it does and why certain things are *forbidden* in certain places.

### 1. The API server is a coordinator, not a kitchen sink

`services/api` does four things only:

- session lifecycle (start, append event, finalize)
- protocol registry (read-only after boot)
- device-adapter routing (forward to the right adapter; never speak the
  device's wire protocol itself)
- artifact storage (frames, events, judgments)

Vendor SDKs (`@google/genai`, `@ai-sdk/openai`, …) are forbidden in
`services/api`. That code lives in `services/inference` and is reachable only
through one typed HTTP contract. This makes the API trivially mockable,
re-implementable in any language, and possible to deploy without GPU
credentials.

### 2. Devices are adapters, not assumptions

Hardware never appears as a hardcoded path, package name, or feature flag in
core code. Devices are polymorphic:

```ts
interface DeviceAdapter {
  id: string;
  capabilities: Capability[];          // camera, imu, audio, shell, packages, …
  open(opts): Promise<DeviceSession>;
  preview(): AsyncIterable<Frame>;
  sensors(): AsyncIterable<SensorSample>;
  close(): Promise<void>;
}
```

The reference Android device-owner app is one adapter. A laptop webcam is
another. A ROS 2 robot station is another. The API doesn't know or care.

### 3. Protocols are first-class; demos are examples

There is no privileged protocol. Every protocol is a JSON document validated
against `packages/protocol`. The kitchen-tea document under
`examples/protocols/` is a smoke test, not a feature.

- success criteria are extensible (registered by name with a Zod validator)
- protocols can declare expected `tools`, `reagents`, `containers`, `surfaces`
- protocol versioning is semver, with a forward-compat policy in
  [decision 0003](docs/decisions/0003-protocol-versioning.md)
- domain modules contribute *prompt fragments* and *vocabulary* — not whole
  pipelines

### 4. One schema, generated everywhere

`packages/protocol` exports both Zod and JSON Schema. Python types are
*generated* from the JSON Schema during `uv sync` (via
`datamodel-code-generator`) into `services/*/openlabos_protocol/`. Drift
between TS and Python is a build error, not a runtime bug.

### 5. Modules are packages, not built-ins

Each domain module — biotech, chemistry, materials, field-bio, nanotech, … —
is its own package under `packages/modules/<name>`. Independently versionable,
optionally loaded. A lab can ship a private `@yourlab/openlabos-module-cryoEM`
without forking core.

### 6. Training and eval are reproducible by construction

Every `services/training` run takes a *frozen dataset hash* + a *protocol
version* + a *base model id* and emits a manifest. `services/eval` consumes
exactly that manifest. "Which checkpoint did the demo use" has a
one-hash answer.

### 7. Tests at every layer, no exceptions

- `packages/protocol` — Zod round-trip + golden-file JSON Schema tests
- `services/api` — Vitest + supertest, no real models in CI
- `services/inference` — pytest with VCR-style fixture replay
- `services/training` — pytest, smoke runs on a 64-frame slice
- `services/eval` — pytest, deterministic metric tests
- `apps/web` — Vitest for components, Playwright for the protocol-run flow

## Cross-cutting concerns

### Configuration

Each service owns a single `Settings` object (Pydantic for Python, Zod for
TS), populated from env vars. No `.env` lookups scattered through code.
Defaults work offline.

### Telemetry

OpenTelemetry SDK is wired up at process start in every service. Traces use a
shared `protocol_run_id` so a single run is one waterfall across web → api →
inference → perception.

### Storage

Default: SQLite + local filesystem (works on a laptop). Production: Postgres
+ S3-compatible object store, switched by config. The repository layer in
`services/api/src/storage/` is the only place that knows the difference.

### Auth

None by default — local-first. When deployed, the API speaks OIDC; the
inference service trusts only the API via mTLS. Documented in
`docs/runbooks/deployment.md`.

## What's explicitly out of scope (for now)

- Multi-tenant SaaS hosting. OpenLabOS is what you'd self-host or embed.
- Custom hardware design. We adapt to your hardware; we don't sell it.
- Closed-weights bundling. Local model weights are user-supplied.

## Decisions

The reasoning behind every cross-cutting choice lives in `docs/decisions/`.
Start with the index in `docs/decisions/README.md`. The keystone decisions
referenced from this document are:

- [0001 — Monorepo tooling](docs/decisions/0001-monorepo-tooling.md)
- [0002 — Schema as source of truth](docs/decisions/0002-schema-source-of-truth.md)
- [0003 — Protocol versioning](docs/decisions/0003-protocol-versioning.md)
- [0004 — Device adapter interface](docs/decisions/0004-device-adapter-interface.md)
- [0005 — Reasoning gateway contract](docs/decisions/0005-reasoning-gateway-contract.md)
