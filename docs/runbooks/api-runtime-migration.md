# API runtime migration — Express → Hono

A living checklist of what has moved off the legacy Express tree (in
`services/api/src/index.ts` + `src/routes/*`) onto the new Hono shell
(`services/api/src/hono/*`). Both runtimes coexist during the migration
window. See decision 0016 for the rationale.

## Status snapshot

- Hono shell, in-memory dependencies, plain Hono + `@hono/zod-validator`.
- OpenAPI document emitted at `packages/sdk-ts/openapi.json` from the
  `pnpm --filter @openlabos/api openapi:emit` script.
- Vitest suite under `services/api/tests/core/` covers the new core
  (`AdapterRegistry`, `ModuleRegistry`, `InMemorySessionStore`).

## Migration ladder

Each row moves from Express to Hono, gets a Vitest acceptance suite, and
gets an entry in the OpenAPI document. The Hono row is *complete* only
when all three columns are checked.

| Resource              | Hono | Vitest | OpenAPI |
| --------------------- | :--: | :----: | :-----: |
| `/api/healthz`        |  ✅  |   🚧   |   ✅    |
| `/api/readyz`         |  ✅  |   🚧   |   ✅    |
| `/api/sessions`       |  ✅  |   ✅   |   ✅    |
| `/api/sessions/:id/events`     | ✅ | 🚧 | ✅ |
| `/api/sessions/:id/finalize`   | ✅ | 🚧 | ✅ |
| `/api/adapters`       |  ✅  |   🚧   |   ✅    |
| `/api/modules`        |  ✅  |   🚧   |   ✅    |
| `/api/protocols`      |  🚧  |   🚧   |   🚧    |
| `/api/files`          |  🚧  |   🚧   |   🚧    |
| `/api/preview/*`      |  🚧  |   🚧   |   🚧    |
| `/api/agents`         |  🚧  |   🚧   |   🚧    |
| `/api/workflows`      |  🚧  |   🚧   |   🚧    |
| `/api/live-coach/*`   |  🚧  |   🚧   |   🚧    |
| `/api/perception/*`   |  🚧  |   🚧   |   🚧    |
| `/api/runpod/*`       |  🚧  |   🚧   |   🚧    |
| `/api/ai/*` (judge)   |  🚧  |   🚧   |   🚧    |
| `/api/ota/*`          |  🚧  |   🚧   |   🚧    |
| `/api/labos/*`        |  🚧  |   🚧   |   🚧    |
| `/api/labclaw/*`      |  🚧  |   🚧   |   🚧    |
| `/api/kitchen/*`      |  🚧  |   🚧   |   🚧    |

## Process for migrating a resource

1. **Read the legacy handler** under `services/api/src/routes/<name>.ts`.
   Note the request/response shape and any side effects.
2. **Add Zod schemas to `packages/protocol`** if the resource speaks
   first-class shapes. Otherwise inline a route-local `z.object(...)`.
3. **Write a Vitest test first** under
   `services/api/tests/core/<name>.test.ts` against an in-memory store or
   a fake adapter. The test pins request → response shape and side
   effects.
4. **Implement in Hono** under `src/hono/routes/<name>.ts`. Wire it into
   `src/hono/app.ts`.
5. **Add the path entry** to `src/hono/emit-openapi.ts` so the document
   reflects reality.
6. **Mark the row above** with a ✅ for each completed column.
7. **Delete the legacy handler** when no consumer references it. Until
   then, keep them in lockstep.

## Acceptance gate for "migration done"

- Every row above is fully ✅.
- `services/api/src/index.ts` (Express entry) is removed.
- The replay corpus passes against the Hono entry.
- `packages/sdk-ts` is regenerated from the published OpenAPI document
  and consumes the new surface end-to-end.

## Known issues

- `@hono/zod-openapi` is incompatible with Zod 4 schema introspection at
  the time of this migration; we therefore emit OpenAPI from
  `packages/protocol/schema/*.json` plus the route manifest in
  `src/hono/emit-openapi.ts`. Revisit once the plugin catches up.
