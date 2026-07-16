# Runbook: Inference loop (LM Studio judgments)

This runbook describes the MVP “judge the current step” loop using **sampled frames only** and a local LM Studio server.

## What this is (and is not)

- **Is:** clip frames + explicit protocol step prompt → LM Studio → strict JSON → stored judgment.
- **Is not:** training, async workers, token streaming, full-video reasoning, or cloud inference.

## Prereqs

- LM Studio running with an OpenAI-compatible API enabled.
- A multimodal model loaded in LM Studio (model id/name known).
- A processed clip with extracted frames exists on disk:
  - `data/processed/<session_id>/frames/<clip_id>/frame-000001.jpg`

## Environment variables

Set in your shell before starting the API:

- `LABOS_LMSTUDIO_BASE_URL` (default `http://127.0.0.1:1234`)
- `LABOS_LMSTUDIO_MODEL` (**required**)
- `LABOS_LMSTUDIO_TIMEOUT_S` (default `30`)
- `LABOS_JUDGMENT_MAX_FRAMES` (default `8`)
- `LABOS_JUDGMENT_STORE_DEBUG` (default `0`) — when `1`, store prompt + raw response JSON in SQLite for debugging

## Trigger a judgment

1. Ensure the clip is associated with a step (`PATCH /media/clips/{clip_id}/step`), or pass `step_id` explicitly.
2. Call:

```bash
curl -s -X POST http://127.0.0.1:8000/judgments \
  -H "Content-Type: application/json" \
  -d '{"clip_id":"<clip_id>"}'
```

If the clip has no `step_id`, pass:

```bash
curl -s -X POST http://127.0.0.1:8000/judgments \
  -H "Content-Type: application/json" \
  -d '{"clip_id":"<clip_id>","step_id":"place-mug-on-counter"}'
```

## List judgments for a session

```bash
curl -s http://127.0.0.1:8000/sessions/<session_id>/judgments
```

Judgments are append-only for MVP (multiple rows over time are expected and useful for debugging).

## Frame selection policy (MVP)

- Frames are read from `data/processed/<session_id>/frames/<clip_id>/`.
- Files are sorted lexically and the first N are used (`LABOS_JUDGMENT_MAX_FRAMES`).

## Failure modes (expected and explicit)

- LM Studio unreachable → 502 with a readable message
- `LABOS_LMSTUDIO_MODEL` missing → 502 (configuration error)
- missing frames directory / no frames → 422
- model returns non-JSON or schema-invalid JSON → 502 with validation details

