# Day 05 journal

---

## Entry: Media ingestion contract (TASK-0005)

- Added **repo-local media contract** rooted at `data/` (overrideable via `LABOS_DATA_ROOT`) with **relative paths only** in SQLite.
- Defined a **manually inspectable** on-disk layout: raw captures vs processed clips vs extracted frames (frames are file-only for now).
- Implemented minimal SQLite metadata tables: `media_captures` + `media_clips` (no blobs; session delete cascades metadata).
- Centralized path validation + layout helpers in `labos_api/storage/media_paths.py` to prevent absolute paths or `..` traversal.
- Added honest placeholder endpoints:
  - register capture under `data/`
  - list session media (DB captures/clips + disk-listed frames)
  - register clip placeholder
  - associate clip with step
- Wrote `docs/runbooks/capture-pipeline.md` and decision 0014 to freeze the layout decision.

---

