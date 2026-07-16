# TASK-0007: lmstudio-inference

## Scope

Implement MVP local inference integration for protocol-conditioned step judgments:

- Thin LM Studio client (OpenAI-compatible `/v1/chat/completions`)
- Explicit prompt builder from protocol step fields
- Deterministic frame selection from clip frame directory
- Strict JSON parse + validation into a closed schema aligned with protocol vocab
- SQLite persistence for judgments
- Endpoints to trigger and list judgments

Out of scope: training, async workers, streaming tokens, full-video inputs.

## Files created / changed (key)

- `apps/api/labos_api/models/judgment.py`
- `apps/api/labos_api/services/lmstudio_client.py`
- `apps/api/labos_api/services/judgment_prompt.py`
- `apps/api/labos_api/services/judgment_parsing.py`
- `apps/api/labos_api/services/frame_selection.py`
- `apps/api/labos_api/persistence/judgment_repository.py`
- `apps/api/labos_api/api/routes/judgments.py`
- `apps/api/labos_api/persistence/sqlite.py` (new `judgments` table)
- `docs/runbooks/inference-loop.md`
- `docs/architecture/data-flow.md`
- `apps/api/README.md`
- `docs/journals/day-07.md`

## Endpoints

- `POST /judgments`
- `GET /sessions/{session_id}/judgments`

## How to run (manual)

1. Start LM Studio and load a multimodal model.
2. Set env:

```bash
set LABOS_LMSTUDIO_BASE_URL=http://127.0.0.1:1234
set LABOS_LMSTUDIO_MODEL=<your-model-id>
```

3. Start API and generate clips/frames (TASK-0006).
4. Associate a clip with a step (or pass `step_id` in the request).
5. Trigger a judgment:

```bash
curl -s -X POST http://127.0.0.1:8000/judgments \
  -H "Content-Type: application/json" \
  -d '{"clip_id":"<clip_id>"}'
```

6. List judgments:

```bash
curl -s http://127.0.0.1:8000/sessions/<session_id>/judgments
```

## Expected failure modes

- LM Studio not running → 502 with readable message
- missing frames → 422
- non-JSON or schema-invalid output → 502 with validation detail

