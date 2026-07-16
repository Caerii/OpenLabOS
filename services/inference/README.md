# services/inference — OpenLabOS inference / model gateway

## Role

Protocol-aware reasoning service for OpenLabOS. This is the **sole owner of
vendor SDK calls** (LM Studio, Ollama, OpenAI, Anthropic, Google GenAI,
Together, RunPod, ...). The TypeScript coordination API in `services/api`
talks to this service over HTTP for every model-driven judgment; nothing
outside `services/inference` should import a vendor SDK.

## Module layout

```
openlabos_inference/
  api/
    routes/        FastAPI routers: health, protocols, sessions, media, judgments
    deps.py        Dependency providers (registry, db, data root)
  services/        Application services: protocol registry/loader, ffmpeg,
                   media processing, frame selection, prompt building,
                   judgment parsing, LM Studio client.
  models/          Pydantic models: protocol JSON, session DTOs, media DTOs,
                   judgment DTOs.
  persistence/     stdlib sqlite3 repositories + schema bootstrap.
  storage/         Filesystem path conventions and safe path resolution.
  providers/       Vendor adapters (OpenAI, Anthropic, Google GenAI, Together,
                   RunPod, LM Studio, Ollama). Owns all vendor SDK imports.
  config.py        Env overrides and default paths (pathlib only).
  main.py          FastAPI app, lifespan, CORS, router wiring.
scripts/           Dev tooling: smoke_api.py, process_capture.py.
```

## Bootstrap

```bash
cd services/inference
uv sync --python 3.12
uv run openlabos-inference
```

Or with reload during development:

```bash
uv run uvicorn openlabos_inference.main:app --reload --host 127.0.0.1 --port 8000
```

## Defaults

- **Port:** 8000 (bound to `127.0.0.1`).
- **CORS:** local-first, **permissive in dev** (`allow_origins=["*"]`,
  `allow_methods=["*"]`, `allow_headers=["*"]`). Tighten before any non-local
  deployment.
- **Env overrides:** `LABOS_PROTOCOL_PATH`, `LABOS_SQLITE_PATH`,
  `LABOS_DATA_ROOT`, `LABOS_LMSTUDIO_BASE_URL`, `LABOS_LMSTUDIO_MODEL`,
  `LABOS_LMSTUDIO_TIMEOUT_S`, `LABOS_JUDGMENT_MAX_FRAMES`,
  `LABOS_JUDGMENT_STORE_DEBUG`.

## Contract with `services/api`

`services/api` (the TypeScript coordination API) calls this service with a
request shaped like:

```json
{
  "step":   { "step_id": "...", "title": "...", "expected_action": ..., ... },
  "frame":  { "clip_id": "...", "frame_paths": ["..."] },
  "context":{ "session_id": "...", "protocol_id": "...", "protocol_version": "1" }
}
```

…and receives back a `Judgment` matching
`openlabos_inference.models.judgment.JudgmentResponse` (which embeds a
schema-validated `JudgmentResult`: `objects_seen`, `action_detected`,
`step_complete`, `possible_issue`, `confidence`, `reason`).

The current MVP exposes `POST /judgments` taking `{clip_id, step_id?}` and
resolving frames and protocol context internally; the `{step, frame, context}`
shape above is the canonical contract that the router layer normalizes
incoming requests to before dispatching to a Provider.

## Adding a new provider

1. Create `openlabos_inference/providers/<vendor>.py`.
2. Define `class <Vendor>Provider` exposing
   `async def render_judgment(self, request: JudgmentRequest) -> Judgment`.
3. Keep all vendor SDK imports inside that module — nothing outside
   `providers/` should `import openai`/`import anthropic`/etc.
4. Register the class in the provider router (lookup by vendor key from the
   incoming request or environment).
5. Add config knobs (API key env var, base URL, model id) to `config.py` if
   they need defaults.

## Failure modes

- Missing or invalid protocol file at startup → process exits with a clear
  message including the path.
- Unknown `protocol_id` on `POST /sessions` → 422 with
  `Unknown protocol_id: '...'`.
- Unknown `session_id`/`clip_id` → 404.
- Vendor unreachable / non-JSON / schema-invalid response → 502 with the
  parser's error attached.
