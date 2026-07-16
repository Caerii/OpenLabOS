# Day 11 journal

---

## Entry: Judgment LoRA / SFT pipeline (TASK-0011)

- Added `labos-training` with `prepare-judgment-sft` and `train-judgment-sft`, reading frozen TASK-0009 splits and emitting auditable JSONL + manifests under `services/training/outputs/`.
- Dataset prep **imports** `build_step_prompt` and `select_frames_for_clip` from `labos-api` so the training text and **first-N sorted frame** policy match inference; training still uses transformers+PEFT while serving uses LM Studio (documented divergence).
- Training defaults target a **single-GPU** path (4-bit, batch size 1 for multi-frame clips, Qwen2.5-VL-3B-Instruct); eval stays out of the training loop—post-hoc comparison uses TASK-0008 / TASK-0010 as already designed.
- Follow-up: prompts are **frozen in JSONL at prepare time**; train only tokenizes those strings + `resolve_data_path` for frames. `run-manifest.json` / `dataset-manifest.json` now carry stack versions, argv, git hash (best effort), and explicit test-split exclusion.

---
