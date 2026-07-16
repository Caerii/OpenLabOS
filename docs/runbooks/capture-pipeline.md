# Runbook: Capture pipeline (MVP media contract)

This runbook defines the **on-disk layout** and **API contract** for local POV video capture in the MVP.

## What this is (and is not)

- **Is:** a boring contract for where files live and how they are registered/listed/linked to sessions and steps.
- **Is not:** upload server, streaming, background workers, or job queues.

## Canonical root

All media lives under repo-local `data/` by default.

- API resolves this as **`LABOS_DATA_ROOT`** (default: `<repo>/data`).
- SQLite stores **relative paths** rooted at that data root.

## Canonical on-disk layout

The intent is: a human can discover media from the filesystem alone, without needing the database.

```text
data/
  raw/
    captures/
      <session_id>/
        <capture_id>/
          source.mp4
          meta.json                # optional; not required in MVP

  processed/
    <session_id>/
      clips/
        <clip_id>.mp4              # registered clip placeholder (no slicing yet)
      frames/
        <clip_id>/
          frame-000001.jpg         # future extraction output
          frame-000002.jpg
```

Notes:
- **Raw capture** vs **clip** vs **frame** are conceptually distinct even if clips/frames are not generated yet.
- File extensions are conventions (`.mp4`, `.jpg`); the contract is “relative path under data root”.

## Minimal SQLite shape

SQLite tracks metadata only (no blobs) and only what is required for MVP tasks:

- `media_captures`
  - `capture_id`, `session_id`
  - `source` (`upload` | `ingest_dir`)
  - `relative_path` (under `data/`)
  - optional `mime_type`, `original_filename`
  - `status` (`registered`)
  - timestamps

- `media_clips`
  - `clip_id`, `session_id`, `capture_id`
  - optional `step_id` (nullable until associated)
  - `relative_path` (under `data/`)
  - optional `start_ms`, `end_ms` (placeholders for future slicing semantics)
  - `status` (`registered`)
  - timestamps

Frames are **not** stored in SQLite in this MVP. They are referenced by the layout and may be listed from disk.

## Endpoints (placeholder but honest)

### Register a raw capture file

Registers an already-present file under `data/` (future upload or ingest-dir tooling can copy files first, then call this).

- `POST /sessions/{session_id}/media/captures`

Body:

```json
{
  "source": "ingest_dir",
  "relative_path": "raw/captures/<session_id>/<capture_id>/source.mp4",
  "mime_type": "video/mp4",
  "original_filename": "VID_0001.mp4"
}
```

Behavior:
- Rejects absolute paths and `..` traversal.
- Returns `422` if the file does not exist under the data root.
- Returns `409` if the same `(session_id, relative_path)` was already registered.

### List media for a session

- `GET /sessions/{session_id}/media`

Returns:
- `captures[]` and `clips[]` from SQLite
- `frames[]` as **file-backed** relative paths under `data/processed/<session_id>/frames/` (if present)

### Register a clip placeholder

- `POST /sessions/{session_id}/media/clips`

Body:

```json
{
  "capture_id": "<capture_id>",
  "relative_path": "processed/<session_id>/clips/<clip_id>.mp4",
  "start_ms": 0,
  "end_ms": 1000,
  "step_id": null
}
```

No slicing is performed; this merely records metadata and a path convention.

### Associate a clip with a step

- `PATCH /media/clips/{clip_id}/step`

Body:

```json
{ "step_id": "place-mug-on-counter" }
```

Behavior:
- Requires that `step_id` is a step for the clip’s session (rejects nonsense).

## Lifecycle and retention rules (MVP)

- **Paths are treated as immutable** once registered (edit/rename is a future task).
- Registering the same capture path twice returns **409** (avoid silent duplicates).
- Session deletion cascades: deleting a session removes media metadata rows. Files under `data/` are **not** deleted automatically in this MVP.

## Processing step (Prompt 6): capture -> clips -> frames

This is a synchronous, local transformation using **ffmpeg**:

- raw capture file (registered) → fixed-duration clip files
- each clip → sampled frames (filesystem only)

### Sampling policy (MVP)

- **Clip chunking:** fixed duration, default **5000ms** per clip.
- **Frame sampling:** fixed FPS, default **1.0 fps**.
- **Clip boundaries:** clips cover \([start_ms, end_ms)\) in milliseconds. The final clip is a shorter remainder if needed.
- **Frame numbering:** extracted frames are named `frame-000001.jpg`, `frame-000002.jpg`, ... (ffmpeg starts at 1 for `%d`).

### CLI (primary verification path)

From `apps/api`:

```bash
uv run python scripts/process_capture.py --capture-id <capture_id> --clip-duration-ms 5000 --frame-fps 1.0
```

This will:
- write clips to `data/processed/<session_id>/clips/<clip_id>.mp4`
- write frames to `data/processed/<session_id>/frames/<clip_id>/frame-000001.jpg`
- insert clip metadata rows (`status=generated`) into SQLite

If outputs already exist, the CLI fails loudly unless `--overwrite` is provided.

### Tooling requirement

The CLI expects `ffmpeg` and `ffprobe` to be available on your `PATH`.

## Local ingest paths (future-friendly)

This contract supports both future ingestion shapes:

- **Direct upload:** upload bytes → write to `data/raw/...` → register capture.
- **Ingest directory / device sync:** copy from device to `data/raw/...` → register capture.

Nothing in this design commits to a specific Android mechanism yet.

