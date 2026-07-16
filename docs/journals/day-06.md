# Day 06 journal

---

## Entry: Clip slicing + frame extraction (TASK-0006)

- Added a thin, explicit `ffmpeg`/`ffprobe` wrapper (`labos_api/services/ffmpeg.py`) that fails loudly with readable stderr when commands fail.
- Implemented synchronous local processing (`labos_api/services/media_processing.py`):
  - fixed-duration clip slicing (`-ss` + `-t` + `-c copy`)
  - frame extraction per clip (`-vf fps=<fps>`, `frame-%06d.jpg`)
  - deterministic, id-driven outputs under `data/processed/<session_id>/...`
- Added CLI `scripts/process_capture.py` as the primary entrypoint for the pipeline; no background workers or queues.
- Persisted generated clip rows in SQLite (`status=generated`); frames remain file-only.
- Updated runbook/docs with sampling policy and exact commands.

---

