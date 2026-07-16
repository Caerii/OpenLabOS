# 0015 — Replay-as-test

- Status: accepted
- Scope: `services/api`, `services/inference`, `services/eval`

## Context

The most useful test we can write is one that catches a regression we have
seen before. Mocked unit tests catch mistakes at the seam they cover;
end-to-end tests catch entire-flow regressions but are expensive and slow.
A `RunManifest` already contains everything needed to deterministically
re-run a session. We should use that.

## Decision

Every captured `RunManifest` is a candidate test fixture. We commit
representative manifests to `services/<svc>/tests/replay/<scenario>/` and
write a small harness that:

1. Spins up the service against an in-memory store.
2. Drives it with the events from the manifest.
3. Asserts the resulting state and judgments equal — or strictly improve
   on — the recorded outcome.

When a regression is fixed, its triggering manifest joins the corpus. The
suite grows into a living spec of "things that used to be broken."

## Consequences

- Bug reports become test fixtures by default.
- The cost of "is this fix safe" drops to running the replay corpus.
- Manifests must be small enough to commit; large media stays as URIs the
  harness can mock or hash-pin.

## Alternatives considered

- **End-to-end browser tests for everything.** Useful at the boundaries;
  too heavy for the long tail of behaviours.
- **Synthesised fixtures.** Real manifests catch quirks synthetic ones
  never produce.
