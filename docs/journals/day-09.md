# Day 09 journal

---

## Entry: Dataset freeze workflow (TASK-0009)

- Added deterministic candidate export from the API SQLite DB to `data/labels/candidates/<dataset>/candidates.jsonl` with relative media references.
- Added strict validation for train/val/test JSONL label files:
  - schema + closed vocab alignment
  - no duplicates within split
  - no overlap across splits
  - clip existence in DB (default on)
- Added a freeze command that materializes immutable-by-convention splits under `data/splits/<dataset>/<freeze_id>/` and writes `manifest.json` with hashes and counts.
- Wrote labeling policy defining conservative ambiguity handling and test split immutability.

---

