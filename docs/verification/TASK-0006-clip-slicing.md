# TASK-0006: clip-slicing

## Scope

Implement the first real local processing step in the media pipeline:

- registered raw capture → fixed-duration clip files
- clip → sampled frame images
- persist **clip** metadata rows in SQLite (`status=generated`)
- keep frames **file-only** (no SQLite frame rows)
- provide a **CLI** as the primary verification path

Out of scope: async jobs/queues, streaming, browser uploads, ffmpeg servers, inference/training integration.

## Files created / changed (key)

- `apps/api/labos_api/services/ffmpeg.py` — thin wrappers for ffmpeg/ffprobe, readable failures
- `apps/api/labos_api/services/media_processing.py` — clip slicing + frame extraction (separate functions)
- `apps/api/scripts/process_capture.py` — CLI entrypoint
- `apps/api/labos_api/models/media.py` — closed status vocab: `CaptureStatus`, `ClipStatus`
- `apps/api/labos_api/persistence/media_repository.py` — `create_generated_clip`, `get_capture`
- `docs/runbooks/capture-pipeline.md` — processing step + sampling policy + CLI command
- `docs/architecture/data-flow.md` — diagram raw → clips → frames
- `apps/api/README.md` — processing notes
- `docs/journals/day-06.md`

## Sampling policy (MVP)

- **Chunking:** fixed duration clips, default `5000ms` per clip.
- **Frames:** fixed fps, default `1.0 fps`.
- **Boundaries:** clips cover \([start_ms, end_ms)\) and keep a trailing remainder clip if needed.
- **Frame numbering:** `frame-%06d.jpg` starts at `000001`.

## How to run

1. Start the API (optional but useful for registration/listing):

```bash
cd apps/api
uv sync
uv run python -m uvicorn labos_api.main:app --reload --host 127.0.0.1 --port 8000
```

2. Create a session and register a capture file under `data/raw/...` (see TASK-0005).
3. Run processing from `apps/api`:

```bash
uv run python scripts/process_capture.py --capture-id <capture_id> --clip-duration-ms 5000 --frame-fps 1.0
```

4. Inspect outputs:

```text
data/processed/<session_id>/clips/<clip_id>.mp4
data/processed/<session_id>/frames/<clip_id>/frame-000001.jpg
```

5. Confirm metadata:
- `GET /sessions/<session_id>/media` shows the new `clips[]` rows, and `frames[]` lists file-backed frame paths.

## Failure modes to verify

- ffmpeg missing → clear error (“ffmpeg not found on PATH”)
- capture missing on disk → clear error
- output exists without `--overwrite` → clear error
- ffmpeg exits nonzero → stderr surfaced and partial outputs cleaned up

## Overwrite and duplicate processing semantics

- Re-running without `--overwrite` fails early if the capture already has `status=generated` clip rows.
- `--overwrite` removes existing generated clip rows for the capture and deletes their clip files + frame directories before regenerating.
- Clip ids (and therefore filenames) are deterministic from `(capture_id, start_ms, end_ms)` so reruns reproduce stable paths.

