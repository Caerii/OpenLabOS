# Kitchen AI Workflow

This folder owns protocol-guided physical workflow intelligence. The tea demo is
one preset protocol, not a special-case architecture.

## Core Concepts

- `protocol-types.ts` defines the pure protocol contract.
- `protocol-domain.ts` owns pure helpers for validating, summarizing, sorting, and navigating protocol objects.
- `protocols.ts` defines built-in protocol data and binds it to the protocol store.
- `protocol-store.ts` owns user protocol persistence and runtime lookup.
- `tracker.ts` owns active run state and deterministic step progression.
- `multiscale-validation.ts` is the public facade for validation planning and mode mapping.
- `multiscale-types.ts` defines the validation evidence graph contracts.
- `multiscale-policy.ts` owns default timing/policy constants and protocol-step heuristics.
- `multiscale-selection.ts` chooses checks that can run with available frame/chunk evidence.
- `multiscale-evidence.ts` converts model outputs into evidence and aggregates step decisions.
- `adherence-policy.ts` turns validation evidence into forgiving protocol-state decisions.
- `session-manifest.ts` turns a run into replayable/training-oriented data.
- `replay.ts` replays saved sessions as regression fixtures.

## Design Intent

The workflow loop should be understandable as:

1. Select a protocol.
2. Start a deterministic run state tree.
3. Collect camera/audio evidence.
4. Run validation at the smallest useful scale.
5. Aggregate evidence into an adherence decision.
6. Advance, wait, warn, or recover.
7. Persist enough artifacts to replay and debug the behavior later.

New protocols should be data. New perception methods should be validation checks.
New operator behavior should be represented in the adherence policy, not as UI-only
conditionals.
