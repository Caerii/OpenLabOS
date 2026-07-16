# Day 12 journal

---

## Entry: Post-SFT HF inference bridge

- Added `labos-training infer-hf-judgments` / `labos-infer-hf-judgments` to load a TASK-0011 PEFT output with `transformers`+`peft`, run the same `build_step_prompt` + `select_frames_for_clip` path as `POST /judgments`, and insert rows into SQLite with an explicit `judgment_model_id` string so eval can tell HF post-SFT runs apart from LM Studio baselines.
- Documented the **LM Studio vs HF** boundary and the fact that GGUF serving does not consume HF adapter folders without a separate export/merge story.
- **TASK-0012 (GRPO)** intentionally deferred until this bridge is exercised on a real adapter + frozen split.

## Entry: Agent E2E smoke (seed → infer → eval)

- Ran `**tools/agent_e2e_seed.py`** → `data/tmp/agent_e2e.sqlite`, `data/splits/agent_e2e/20260422-agent/`, tiny frames.
- `**infer-hf-judgments**` dry-run then real insert against `**outputs/agent_e2e_sft**` (existing 1-step LoRA run); wrote `**infer_manifest.json**` and SQLite rows (`agent-e2e-post-sft-real`, `agent-e2e-post-sft-real-b`).
- `**labos-eval-metrics judgments**` → `**reports/agent_e2e_smoke/**` with **coverage 1.0** on the 2-row test split (metrics reflect model over-claiming objects/issues, which is fine for plumbing proof).
- **Normalization** in `judgment_parsing.normalize_judgment_dict` extended so HF/LM outputs like `**v1`**, single-element lists, and **multi-token enum lists** (`["pour","null"]`, multi `possible_issue`) coerce to the strict `JudgmentResult` contract before insert (same path as API).
- CLI: `**--show-raw-on-parse-fail`** for decode debugging on smokes.

---