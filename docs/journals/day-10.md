# Day 10 journal

---

## Entry: Baseline packaging (TASK-0010)

- Added a single local-only `baseline` CLI workflow in `services/eval` for producing a reproducible baseline from a frozen split.
- Baseline writes report artifacts to `reports/baseline/<dataset>/<freeze_id>/` and writes a separate `baseline-lock.json` lock artifact without mutating `data/splits/<dataset>/<freeze_id>/manifest.json`.
- Added explicit judgment reuse/regeneration policy to avoid silent prediction churn.

---