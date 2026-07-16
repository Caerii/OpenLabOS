# services/api

The coordination plane. Express + TypeScript today; OpenAPI-typed Hono is the
target (see `docs/decisions/0016-api-runtime.md`). What this service owns:

- session lifecycle — start, append events, finalize
- protocol registry — read-only after boot, fail-fast on malformed protocols
- device-adapter routing — forward requests to the addressed adapter without
  speaking the device's wire protocol itself
- artifact storage — frames, events, judgments, run manifests
- workflow + agent orchestration scaffolding (under `src/ai/agents`,
  `src/ai/workflows`)

What this service must not own:

- direct calls to model providers (Gemini, OpenAI, Anthropic, Together,
  RunPod). Those move into `services/inference` behind one typed contract.
- device wire protocols. Those live in adapter packages under `adapters/`.
- session state outside the canonical store.

The current source tree was carried over from the prior monolith and is being
progressively factored into those boundaries; until then, treat any vendor SDK
import outside `src/ai/providers/` as tech debt and a candidate to extract.

## Layout

```
src/
  index.ts                  process entry, wires routes, opens stores
  routes/                   HTTP handlers (one file per resource)
  ai/                       reasoning helpers (slated to move to services/inference)
    agents/                 agent role specs and orchestrator
    kitchen/                step-by-step run engine and judgment store
    modules/                domain prompt modules (biotech, chemistry, …)
    perception/             perception runtime selectors
    workflows/              workflow presets and supervision contract
  labclaw/                  skill-fit + workspace scaffolding
  live-coach/               LiveKit + WebRTC live-coaching session brokerage
  preview/                  device preview stream tap and metrics
  power/                    power profiler
  lib/                      small utilities (jpeg, http, audio cues, settings)
  config/                   feature flags
  storage/                  artifact + session repository (ported in next pass)
  tests/                    Vitest suites — see docs/test-catalog.md
```

## Running

```bash
pnpm --filter @openlabos/api dev
```

Environment variables documented in `src/config/features.ts` and the runtime
config module. None are required for the offline test path.
