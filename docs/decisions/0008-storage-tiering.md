# 0008 — Storage tiering

- Status: accepted
- Scope: `services/api`, `services/inference`, `services/training`, `services/eval`

## Context

A single laptop should be enough to run a useful demo. A research lab with
a hundred operators should be able to scale the same code without rewrites.
These two requirements pull on storage in opposite directions if we let
them.

## Decision

Two tiers, switched by a single config flag per service.

- **Tier 1 (default, "laptop"):** SQLite for relational data, local
  filesystem under `data/` for media and manifests. Zero external
  dependencies. Good for ~100k events and ~10k frames per session before
  it starts feeling slow.
- **Tier 2 ("deployed"):** PostgreSQL for relational data, S3-compatible
  object store for media and manifests. Same schema, same code paths.

The repository layer (`services/<name>/.../storage/`) is the only place
that knows the difference. Routes and domain logic see one interface.

## Consequences

- A demo never needs Docker.
- A production deploy never needs an architectural change — only config.
- Writing the storage layer twice (once per tier) is a one-time cost we
  accept up front.
- Tests run against Tier 1; an opt-in `tier=deployed` test job hits a
  containerised Postgres + MinIO in CI.

## Alternatives considered

- **Postgres-only.** Demos require Docker; bar to entry rises.
- **One database wrapping both.** Tried in early scaffolds; the abstraction
  always leaks. Two implementations of one interface is honest.
