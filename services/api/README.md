# services/api

The API owns session state. It records which protocol is active, which step is
current, and which events and artifacts belong to the session. The current
runtime is Express with mounted Hono routes; the migration is tracked in
`docs/decisions/0016-api-runtime.md`.

It owns:

- session lifecycle: start, append events, finalize, and persist to the
  filesystem by default
- protocol registry: read-only after boot, with startup validation
- device-adapter routing: forward requests without speaking the device wire
  protocol
- artifact storage: frames, events, judgments, and `RunManifest` records
- workflow and agent scaffolding under `src/ai/agents` and `src/ai/workflows`

New coordination routes must not add:

- model-provider calls; new judgment providers belong in `services/inference`
- device wire protocols; those belong in adapter packages under `adapters/`
- session state outside the configured session store

Legacy routes still contain model-provider orchestration from the earlier
monolith. Treat that code, including `src/ai/providers/`, as migration debt
rather than the pattern for new routes.

## Layout

```text
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
  storage/                  artifact paths and repository helpers
  core/sessions/            Hono session stores, integrity, and manifests
  tests/                    Vitest suites; see docs/test-catalog.md
```

## Running

```bash
pnpm --filter @openlabos/api dev
```

Environment variables documented in `src/config/features.ts` and the runtime
config module. None are required for the offline test path.

## Session model

Sessions are event-sourced. Starting, capturing, judging, completing, and
finalizing all append typed `SessionEvent` records; the current state is a
fold over that log (`src/core/sessions/store.ts`).

**Determinism boundary.** Replaying events in append order reconstructs
session state exactly. Judgments are recorded observations: re-running the
model named in a judgment's `source` against the same frame does not, in
general, reproduce the same verdict. The `RunManifest` preserves what was
judged and by whom, not a recomputable function.

**Timestamps.** Each event's `at` field is a producer-supplied wall-clock
time with no cross-device sync guarantee. Authoritative order is append order
in `events.jsonl`, not lexicographic order of `at`. Do not compute latencies
from `at` alone.

The default `FilesystemSessionStore` (ADR 0014) writes one directory per
session under the data root:

```text
data/sessions/<session_id>/
  session.json     # Session record: protocol, adapter, status, timestamps
  events.jsonl     # append-only event log, one JSON object per line
  manifest.json    # RunManifest written on finalize or export
data/sessions/index.json   # regenerated run index
```

Set `OPENLABOS_STORAGE_TIER=memory` to use the in-memory store for ephemeral
tests. `OPENLABOS_DATA_DIR` moves the data root.

## HTTP reference (Hono routes)

All routes live under `/api`. When `OPENLABOS_AUTH_REQUIRED=true`, every
`/api/*` request must carry the token from `OPENLABOS_API_TOKEN` as
`Authorization: Bearer <token>` or `x-openlabos-token`. Session and judgment
routes are rate-limited.

### Health

| Route | Returns |
|---|---|
| `GET /api/healthz` | `ok`, service name, uptime, adapter and module counts. Process liveness only. |
| `GET /api/readyz` | `ready` plus per-dependency checks. Probes inference at `OPENLABOS_INFERENCE_URL` and, when segmentation mode is `sidecar`, the perception `/health`. Returns 503 until both pass. |

### Sessions

| Route | Body | Behavior |
|---|---|---|
| `POST /api/sessions` | `protocol_id`, `protocol_version`, `device_adapter_id`, optional `operator_id`, `tags` | Creates an `active` session; returns it with a generated UUID (201). |
| `POST /api/sessions/:id/events` | One `SessionEvent` | Appends after schema validation; 202 on accept, 404 for unknown sessions. Send an `Idempotency-Key` header to make retries safe: a replayed key returns 202 with `replayed: true`; the same key with a different event returns 409. |
| `GET /api/sessions/:id` | — | Folded view: session record, `activeStepId`, `lastCompletedStepId`, event counts. |
| `POST /api/sessions/:id/resume` | — | Returns the view if the session is still `active`; 409 with the actual status otherwise. |
| `POST /api/sessions/:id/finalize` | `status`: `completed` \| `abandoned` \| `errored` | Sets `ended_at`, appends `session_finalized`, writes `manifest.json`. |
| `GET /api/sessions` | — | All sessions. |

Valid event kinds (`packages/protocol/src/session.ts`): `step_started`,
`frame_captured`, `judgment_emitted`, `step_completed`, `operator_note`,
`measurement_recorded`, `session_finalized`.

`measurement_recorded` carries `quantity`, `value`, `unit` (canonical
vocabulary), `method` (`instrument` | `display_readout` |
`operator_attested` | `visual_estimate`), and an optional `instrument_id`.
Use it when a numeric reading should live in the append-only log rather than
only inside a judgment rationale.

### Judgments

`POST /api/judgments` forwards the request to the inference service and, on
success, appends a `judgment_emitted` event to the session. If the inference
service is unreachable the route returns 502 with `error: "inference
unreachable"`; upstream provider failures pass through with their status.
This route validates only the forwarding shape — the inference service owns
the judgment contract.

Judgment `source` should identify the producer with enough provenance for
later eval (e.g. `ollama:llama3.2-vision-11b-q4_K_M:temp=0`,
`human:<user-id>`, `mock:deterministic`). Criterion evidence may include
`method`, `measured_value`, and `measured_unit`. Object `confidence` values
are uncalibrated producer self-reports, not probabilities.

### Runs

| Route | Behavior |
|---|---|
| `GET /api/runs` | Run index; filter with `protocol_id`, `status`, or free-text `q`. |
| `GET /api/runs/:id/timeline` | Events as `{at, kind, summary}` rows. |
| `GET /api/runs/:id/metrics` | Duration, steps completed, frames, judgments, notes. |
| `POST /api/runs/:id/export` | Writes `manifest.json` and a gzipped bundle under the session's `export/` directory; returns both paths. |
| `POST /api/runs/import` | Recreates a session from a manifest's `session` and `events`. The import gets a new `session_id`. |
| `DELETE /api/runs/:id` | Removes the session directory. Irreversible. |
| `GET /api/runs/latest/active` | Most recent `active` session, or `null`. |

### Protocols and devices

`GET /api/protocols` lists the `*.protocol.json` documents in
`examples/protocols/` (filter with `?q=`); `GET /api/protocols/:id` returns
one document. `/api/adapters`, `/api/modules`, and `/api/device/*` cover
adapter registration and the device proxy; the proxy injects the token from
`OPENLABOS_DEVICE_TOKEN` so browsers never hold device credentials.
