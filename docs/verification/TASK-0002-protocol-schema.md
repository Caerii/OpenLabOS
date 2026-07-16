# TASK-0002: protocol-schema

## Scope

- Implement `packages/protocol-schema` with TypeScript and Zod for the closed-world kitchen tea **shape** (not a universal ontology).
- Canonical example JSON, parse helpers, mandatory validation script, package README, prose protocol doc, decision 0011 update, day-02 journal entry.
- **Out of scope:** FastAPI, React, LM Studio, JSON Schema export (skipped as non-trivial add).

## Files changed

- [`packages/protocol-schema/package.json`](../../packages/protocol-schema/package.json) — `zod`, `tsx`, scripts `build`, `validate-example`
- [`packages/protocol-schema/src/vocabulary.ts`](../../packages/protocol-schema/src/vocabulary.ts) — enums + label maps
- [`packages/protocol-schema/src/protocol.ts`](../../packages/protocol-schema/src/protocol.ts) — protocol graph, simple criteria/failures
- [`packages/protocol-schema/src/session.ts`](../../packages/protocol-schema/src/session.ts) — `StepStatus`, `SessionStepState` by `step_id`
- [`packages/protocol-schema/src/judgment.ts`](../../packages/protocol-schema/src/judgment.ts) — `JudgmentResult`
- [`packages/protocol-schema/src/parse.ts`](../../packages/protocol-schema/src/parse.ts) — JSON parsers
- [`packages/protocol-schema/src/index.ts`](../../packages/protocol-schema/src/index.ts) — public exports
- [`packages/protocol-schema/scripts/validate-example.ts`](../../packages/protocol-schema/scripts/validate-example.ts)
- [`packages/protocol-schema/examples/kitchen-tea-v1.json`](../../packages/protocol-schema/examples/kitchen-tea-v1.json)
- [`packages/protocol-schema/README.md`](../../packages/protocol-schema/README.md)
- [`docs/protocols/kitchen-tea-v1.md`](../protocols/kitchen-tea-v1.md)
- [`docs/decisions/0011-closed-world-protocols.md`](../adr/decision 0011)
- [`docs/journals/day-02.md`](../journals/day-02.md)
- Removed placeholder `docs/protocols/.gitkeep` (replaced by `kitchen-tea-v1.md`)

## Implementation summary

The package validates protocol documents with generic `protocol_id` / `protocol_version` strings, stable per-step `step_id`, optional `order`, a tiny **surface** enum, and simple criterion/failure records without a rule engine. `JudgmentResult` ties judgments to `step_id` and keeps `reason` as human-only narrative. Example JSON is checked on every `validate-example` run.

## How to run

From repository root:

```bash
pnpm install
pnpm --filter @labos/protocol-schema run build
pnpm --filter @labos/protocol-schema run validate-example
```

## Manual verification steps

1. Run `validate-example`; expect `validate-example: OK` and exit code 0.
2. Deliberately corrupt `examples/kitchen-tea-v1.json` (e.g. wrong `object_id`); run `validate-example`; expect exit code 1 and a Zod error message.
3. Read `docs/protocols/kitchen-tea-v1.md` and confirm step ids match the JSON file.

## Open questions

- Whether the API should codegen from Zod, hand-write Pydantic to match, or only load pre-validated JSON files in early prompts.

## Notes

- No `docs/architecture/local-dev.md` yet (Prompt 4).
- JSON Schema artifact omitted to avoid extra tooling scope.
