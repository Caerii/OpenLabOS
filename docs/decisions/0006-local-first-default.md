# 0006 — Local-first by default

- Status: accepted
- Scope: every service and app

## Context

Lab work happens in places with bad networks, controlled-data policies,
and budgets that don't tolerate per-request fees. A system that *requires*
the cloud to be useful is not the right substrate for it.

## Decision

Every default code path runs offline. Specifically:

- `services/api` works against SQLite + local filesystem out of the box.
- `services/inference` runs against a local model runtime (Ollama, LM
  Studio, vLLM) by default. Cloud providers are opt-in via a config flag
  per provider.
- `apps/web` ships a static bundle that talks to a local API on `0.0.0.0`.
- Telemetry is local-first: traces print to stdout unless an OTLP endpoint
  is configured.

Cloud is a *capability* the operator turns on, never an assumption the
code makes.

## Consequences

- Every service has to be deployable on a single laptop. We test for this.
- Tests must not require network access (a `LIVE` env gate makes the rare
  exception explicit).
- Documentation gives the local commands first, the cloud commands second.

## Alternatives considered

- **Cloud-first with a local fallback.** Inverts the centre of gravity;
  the fallback rots. Discarded.
