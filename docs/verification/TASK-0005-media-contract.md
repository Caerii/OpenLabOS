# TASK-0005: media-contract

## Scope

Define and implement the MVP **media ingestion contract** for local POV capture:

- **On-disk layout** under repo-local `data/` (override: `LABOS_DATA_ROOT`)
- Minimal SQLite metadata for **captures** and **clips** (no blobs)
- Placeholder but honest endpoints:
  - register raw capture
  - list session media
  - associate clip with step (and register clip placeholder to enable the association)
- Centralized path validation/resolution
- Runbook + ADR + doc updates

Out of scope: streaming, uploads of bytes, ffmpeg slicing, frame extraction jobs, background queues.

## Files created / changed (key)

- `apps/api/labos_api/config.py` — add `LABOS_DATA_ROOT` / default data root
- `apps/api/labos_api/main.py` — store `data_root` on app state; include media router
- `apps/api/labos_api/api/deps.py` — `get_data_root`
- `apps/api/labos_api/storage/media_paths.py` — centralized relative-path validation + layout helpers
- `apps/api/labos_api/models/media.py` — DTOs for captures/clips + file-only frames list
- `apps/api/labos_api/persistence/sqlite.py` — new tables: `media_captures`, `media_clips`
- `apps/api/labos_api/persistence/media_repository.py` — SQL for register/list/associate
- `apps/api/labos_api/api/routes/media.py` — endpoints
- `docs/runbooks/capture-pipeline.md` — layout + lifecycle + examples
- `docs/architecture/data-flow.md` — add media contract section
- `docs/decisions/0014-media-storage-layout.md`
- `apps/api/README.md` — media ingestion section

## API surface (MVP)

- `POST /sessions/{session_id}/media/captures`
- `GET /sessions/{session_id}/media`
- `POST /sessions/{session_id}/media/clips` (register placeholder)
- `PATCH /media/clips/{clip_id}/step`

## Manual verification

1. Start API:

```bash
cd apps/api
uv sync
uv run uvicorn labos_api.main:app --reload --host 127.0.0.1 --port 8000
```

2. Create a session (`POST /sessions`), note `session_id`.
3. Create a dummy file under data root, e.g.:

```text
data/raw/captures/<session_id>/<capture_id>/source.mp4
```

4. Register capture:
   - `POST /sessions/{session_id}/media/captures` with `relative_path` pointing at the file under `data/`
   - Expect `201`
5. List media:
   - `GET /sessions/{session_id}/media`
   - Expect the capture in `captures[]`, `clips[]` empty, `frames[]` empty unless you created frame files under `data/processed/<session_id>/frames/`.
6. Register a clip placeholder:
   - `POST /sessions/{session_id}/media/clips` with `capture_id` from step 4 and a `relative_path` under `processed/<session_id>/clips/`
7. Associate clip with a known `step_id` from `GET /sessions/{session_id}`:
   - `PATCH /media/clips/{clip_id}/step`
   - Expect `200` with `step_id` set.

## Notes

- Duplicate capture registration (same session + same relative path) returns **409**.
- Paths are stored as **relative** strings; absolute paths and `..` traversal are rejected with **422**.
- Deleting a session removes SQLite metadata rows (cascade) but does **not** delete files under `data/` in this MVP.

