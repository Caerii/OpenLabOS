# Day 08 journal

---

## Entry: Eval harness (TASK-0008)

- Defined a tiny **JSONL** dataset format for frozen labeled judged clips (`docs/eval/dataset-spec.md`).
- Implemented a single CLI (`labos-eval-metrics judgments`) that reads labels and scores against the **API SQLite** judgments table.
- Metrics are strictly on **structured fields** (never `reason`):
  - objects micro P/R/F1 (set-based)
  - step completion accuracy
  - issue detection P/R
  - judgment validity rate (missing judgments counted in denominator)
  - action detection accuracy
- Emits small demo artifacts: `judgment-eval.json` + `judgment-eval.md`.

---

