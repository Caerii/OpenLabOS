# 0001 — Monorepo tooling

- Status: accepted
- Scope: repository

## Context

OpenLabOS is polyglot by necessity. The web surface, coordination API, and
shared schemas are TypeScript. The reasoning, training, and evaluation
services are Python. The reference device app is Android (Java/Kotlin via
Gradle). A change that crosses these — adding a field to the protocol schema,
say — must land atomically or it will rot.

## Decision

A single repository, three coordinated workspaces.

- **pnpm** for the JavaScript/TypeScript half, with workspace globs for
  `apps/*`, `services/api`, `packages/*`, `packages/modules/*`, `adapters/*`.
- **uv** for each Python project (one `pyproject.toml` per service, no shared
  superproject). Each service pins Python 3.12.
- **Gradle** for the Android reference app under `apps/device-reference/`,
  invoked through `./gradlew`.
- **turbo** at the root coordinates TypeScript builds and caches their
  outputs; Python and Gradle have their own incremental layers.

A wrapper `pnpm test` and per-service `uv run pytest` together exercise the
suite. CI matrices over Linux, macOS, and Windows.

## Consequences

- A schema change ships in one PR across all consumers.
- Each Python service can pin its ML stack independently — no superproject
  resolver fights.
- Newcomers install three tools (`pnpm`, `uv`, `gradle` via wrapper) before
  they can build everything; we ship a `scripts/bootstrap.sh` that does this.
- Cross-language imports are not allowed. Sharing happens through generated
  artifacts (JSON Schema → Pydantic, OpenAPI → typed clients) committed to
  the repo.

## Alternatives considered

- **Many small repos.** Atomic schema changes become coordinated multi-PR
  dances. Rejected.
- **Bazel everywhere.** Strong but heavy; the polyglot story is solved by
  three good native tools without it.
- **One Python superproject (`uv workspace`).** Forces shared resolver across
  unrelated ML deps; rejected after seeing PEFT vs vLLM dep churn.
