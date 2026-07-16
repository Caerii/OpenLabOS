# 0018 — Apache-2.0 code, CC0 documentation

- Status: accepted
- Date: 2026-06
- Scope: repository-wide licensing

## Context

The repository launched with CC0 everywhere. That maximizes reuse but gives
no explicit patent grant — a concern for vendors integrating device adapters,
desktop shells, and services. Documentation (ADRs, runbooks, architecture
notes) benefits from remaining maximally remixable without license friction.

## Decision

Split licensing by artefact type:

- **Code** (everything outside `docs/`): [Apache-2.0](../../LICENSE).
  Applies to apps, services, packages, adapters, desktop, scripts, examples,
  and CI configuration.
- **Documentation** (`docs/` tree): [CC0 1.0](../LICENSE). Applies to
  ADRs, architecture notes, runbooks, journals, and verification write-ups.

Contributions follow the license of the tree they land in. New source files
do not require per-file headers on day one; SPDX headers may be added later
for clarity.

## Consequences

- Corporate and hardware integrators get a familiar, patent-aware code license.
- Docs can be copied into lab wikis, papers, and vendor manuals without
  negotiation.
- README and CONTRIBUTING must state the split so contributors know which
  license applies to their change.
- GPL/AGPL is explicitly out of scope — copyleft would conflict with the
  vendor-neutral adapter strategy (ADR 0004).

## Alternatives considered

- **CC0 everywhere.** Simplest, but no patent grant; kept for docs only.
- **Apache-2.0 everywhere.** Fine for code; unnecessarily heavy for prose.
- **GPL-3.0.** Strong copyleft; would discourage adapter and embedded adoption.
  Discarded.
