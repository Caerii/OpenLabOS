# Architecture of a recorded run

This document follows one protocol run through the repository: why operator
guidance, session state, model judgments, and offline learning are separate,
and which parts of that design are implemented today.

For the project’s purpose and non-goals, read
[why-openlabos.md](why-openlabos.md) first. For ownership tables and adapter
rules, use [ARCHITECTURE.md](../../ARCHITECTURE.md).

## 1. The unit of work

A laboratory protocol is a sequence of observable actions: place a vessel,
add a reagent, wait, measure, record. Displaying those instructions is not
enough. After the run, the software should still answer:

- Which protocol version did the operator follow?
- Which step was active when a frame or clip was captured?
- Why did the run advance, wait, or stop?
- Which producer returned each judgment, and how was any numeric claim obtained?

OpenLabOS represents one execution of one protocol as a `Session`. Session
events drive the live run. A `RunManifest` is the intended cross-stage record
for review, state replay, evaluation, and experimental training. Consolidation
from the legacy kitchen record into that contract is still in progress.

## 2. Why the code is in one repository

The web console and API are TypeScript. Model services and training utilities
are Python. Device integration uses the language and runtime required by the
hardware. Keeping these projects in one repository allows a contract change
to update its TypeScript definition, generated schema, Python consumer, tests,
and documentation in the same review.

We use **pnpm** for the JavaScript/TypeScript workspace and **uv** for each
Python project. Turbo coordinates TypeScript workspace tasks. Each Python
service keeps its own environment so inference, perception, and training can
pin different ML dependencies.

## 3. Shared schemas connect the stages

`packages/protocol` owns the public protocol and run wire formats.

A `Protocol` contains ordered `Step` records. A `Session` identifies one
attempt to execute a protocol and accumulates append-only `SessionEvent`
records. A `Judgment` records a provider's verdict on one step. A
`RunManifest` references the protocol, session history, judgments, and stored
artifacts needed for later review.

**What is reproducible.** Replaying session events in append order
reconstructs the folded session state exactly. Judgments are not reproducible
computations: they are observations stamped with a `source` string that must
name the producer (model id and parameters, human id, or hybrid recipe)
precisely enough to interpret them later. Event `at` timestamps are
wall-clock hints; append order is authoritative.

**What a criterion claims.** A `measurement_in_range` criterion declares an
acceptance band. It becomes a measurement only when criterion evidence (or a
`measurement_recorded` event) carries a value with `method` of `instrument`
or `display_readout`. Visual estimates and omitted methods are estimates.
Object `confidence` scores are uncalibrated self-reports until a producer is
calibrated against labeled data.

The TypeScript source emits JSON Schema. The training package contains
generated Python protocol models and a regeneration script. CI checks schema
generation and committed outputs; this path is still being consolidated, so
service READMEs remain the authority for their accepted request shapes.

## 4. Responsibility boundaries

**Presentation** runs on the operator's device. It shows the next
step, captures frames, and streams them outward. It does not know how
judgments are produced — only how to display them. The web app is a React +
Vite + TypeScript single-page app. The reference device app is a small
Android client; other devices are adapters.

**Coordination** runs as `services/api`. The current runtime is Express with
mounted Hono routes during an active migration. It owns session lifecycle,
protocol registration, device routing, and artifact storage. It forwards model
work to inference and hardware work to adapters rather than embedding either
implementation.

**Reasoning** runs as `services/inference` and `services/perception`. Inference
accepts a step and available frame evidence, selects a registered provider,
and returns a `Judgment`. The active endpoint supports Ollama, LM Studio, and
a deterministic mock. Perception exposes normalized object observations from
either a mock backend or an experimental Grounded SAM 2 setup.

**Learning** runs as `services/training` and `services/eval`. These packages
contain dataset preparation, SFT / DPO / GRPO utilities, replay fixtures, and
validators. They are experimental and run offline; neither service is required
to execute a live protocol.

## 5. The device is an adapter

Device-specific operations belong behind adapter contracts so protocols and
sessions do not depend on a hardware brand. The implemented Android adapter
supports the reference device path. A webcam adapter scaffold is present; ROS
2 and serial adapters remain planned. As the adapter contract stabilizes, new
device families should be added under `adapters/` without changing protocol
documents.

## 6. Domain modules are migration-era scaffolding

The API source contains domain modules for biotech, chemistry, materials,
field biology, nanotechnology, and the kitchen demonstration. They currently
contribute prompt and vocabulary data inside the legacy API tree. They are not
yet independent, versioned packages, and the public extension contract remains
planned.

## 7. Observability is incomplete

The API contains OpenTelemetry initialization and trace helpers. End-to-end
context propagation across the web, API, inference, and perception services is
not complete. Until that work lands, session IDs, structured events, health
endpoints, and persisted artifacts are the primary debugging record.

## 8. Replay is the path toward reproducibility

The repository includes replay fixtures, frozen evaluation data, manifest
readers, and dataset preparation utilities. Together they establish the
intended lineage from a recorded session to an evaluation or training input.
Not every training path yet enforces a frozen dataset hash and complete
provenance, so reproducibility is a target being tested rather than a finished
guarantee.

## 9. Deployment boundary

The repository is built for self-hosted experiments. Local providers are the
default direction; hosted provider integrations require explicit credentials.
The project does not provide user accounts, role-based access control, or a
managed service. Compose binds to loopback, and remote experiments require the
optional API token plus a reviewed TLS reverse proxy.

## 10. How to read the rest of the docs

Architecture lives here in `docs/architecture/`. Decisions live in
`docs/decisions/`. Operations live in `docs/runbooks/`. Per-service contracts live
next to their services in `services/<name>/README.md`. Tests are described in
`docs/TESTING.md` and the catalog is in `docs/test-catalog.md`.

For current maturity and planned work, use
[`roadmap.md`](roadmap.md). Architecture documents explain boundaries; they do
not override service READMEs or verified runtime behavior.
