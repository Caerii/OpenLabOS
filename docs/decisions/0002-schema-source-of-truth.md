# 0002 — Schema as source of truth

- Status: accepted
- Scope: `packages/protocol`, every consumer

## Context

The same shapes — `Protocol`, `Step`, `Session`, `SessionEvent`, `Judgment`,
`RunManifest` — are read by TypeScript code in the web app and API, by
Python code in the inference and training services, and by the reference
Android client over the wire. If each consumer hand-types these, drift is
inevitable; the bug always shows up at a service boundary at the worst time.

## Decision

`packages/protocol` is canonical. Its TypeScript Zod schemas are the only
authored definition. A build step emits JSON Schema files into
`packages/protocol/schema/`. Python consumers regenerate Pydantic models
from those JSON Schemas during `uv sync` (via `datamodel-code-generator`)
into `services/<name>/openlabos_protocol/_generated/`. Generated files live
under `_generated/` and are gitignored.

CI fails if a regeneration produces a diff. Drift is therefore a build
failure, not a runtime failure.

## Consequences

- A schema change is one TypeScript edit; consumers regenerate on next sync.
- Tests in any language can construct fixtures from the canonical shapes.
- Reviewers can read one folder to know every wire-level invariant.
- The Android client must hand-roll its types in Kotlin/Java today
  (codegen story for the JVM is parked behind a future decision).

## Alternatives considered

- **Hand-rolled types per service.** Discarded; this is the common case
  that ages worst.
- **Protobuf as canonical.** Considered. We picked Zod because the bulk of
  authoring happens in TypeScript and Zod gives us free runtime validation
  for the API. Protobuf remains an option if streaming or polyglot codegen
  pressure grows.
