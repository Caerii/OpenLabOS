# 0011 — Closed-world protocols

- Status: accepted
- Scope: `packages/protocol`, `packages/modules/*`

## Context

A vision-language model can describe a scene in any way you let it. That
freedom is exactly the wrong thing for a step that should either pass or
fail against named criteria. If the model can write "the operator did
something good," eval becomes a literature review.

## Decision

A `Protocol` is a *closed world*. Step success is checked against typed,
enumerated criteria the schema knows: `object_on_surface`,
`liquid_in_object`, `component_added`, `action_performed`,
`measurement_in_range`, plus criteria registered by domain modules.
Free-text rationales are allowed and stored, but they are *evidence for*
a typed verdict, never a substitute for one.

A `Judgment` therefore carries:

- a `verdict` from a closed enum,
- a `criteria` array of `{criterion_index, satisfied, evidence}`,
- an optional structured `failure` attribution.

The model can write whatever it wants in `rationale`, but the system
acts on the structured fields. This is what makes adherence policies,
hybrid validators, and replay tests possible.

## Consequences

- Scoring is deterministic given the structured fields.
- Domain modules extend the world by registering new criterion kinds
  with verifiers, not by widening the schema for everyone.
- Protocol authoring is more work than free-form prompts; this is a
  feature.

## Alternatives considered

- **Free-form rationale + LLM-as-judge.** Useful at the prototype stage;
  not adequate when datasets and operator trust are at stake.
- **Hand-coded criteria per protocol.** Doesn't generalise across labs;
  closes off third-party module growth.
