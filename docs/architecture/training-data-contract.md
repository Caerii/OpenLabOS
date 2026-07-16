# Training data contract (LabOS kitchen step verification)

This document defines the canonical dataset shapes we will generate from LabOS kitchen artifacts and feed into:

- **SFT** (supervised fine-tuning)
- **DPO** (preference optimization)
- **GRPO** (reward optimization; later)

The goal is to keep the data model stable while the training stack evolves.

## Inputs (source artifacts)

From `OpenLabOS/dashboard/data/kitchen/`:

- `run_events.jsonl` — append-only event log (verify-step results, workspace checks, run lifecycle)
- `frames/*.jpg` — images referenced by `frameRef`
- `current_run.json` — latest snapshot (convenience; not required)

## Canonical label schema (authoritative)

The long-term “closed world” authoritative schema lives in:

- `packages/protocol-schema/src/judgment.ts` (`JudgmentResultSchema`)

That schema is the target output shape for the VLM.

## Dataset 1: SFT (image + prompt → judgment JSON)

Each record corresponds to **one step judgment** for one frame.

Shape (JSONL, one object per line):

```json
{
  "id": "run-.../step:add-tea-bag/frame:....jpg",
  "image_path": "data/raw/openlabos-runs/kitchen/frames/verify-step3-....jpg",
  "prompt": {
    "protocol_id": "kitchen-tea-v1",
    "protocol_version": "v1",
    "step_id": "add-tea-bag",
    "step_instruction": "Add tea bag",
    "expected_objects": ["tea_bag", "mug"],
    "expected_action": "add",
    "schema_hint": "JudgmentResultSchema v1"
  },
  "target": {
    "step_id": "add-tea-bag",
    "objects_seen": ["mug", "tea_bag"],
    "action_detected": "add",
    "step_complete": true,
    "possible_issue": null,
    "confidence": 0.82,
    "reason": "The tea bag is inside the mug."
  },
  "provenance": {
    "run_id": "run-...",
    "frame_ref": "kitchen/frames/verify-step3-....jpg",
    "source": "human|auto|baseline_model",
    "ts": 1713820000000
  }
}
```

Notes:
- `target` must validate against `JudgmentResultSchema` (or a versioned superset).
- For bootstrapping, `target` can be produced by a strong teacher model + then corrected.

## Dataset 2: DPO (same prompt + image, chosen vs rejected)

Each record is a preference pair for the same prompt+image.

```json
{
  "id": "run-.../step:add-tea-bag/frame:....jpg",
  "image_path": "data/raw/openlabos-runs/kitchen/frames/verify-step3-....jpg",
  "prompt": { "...same as SFT.prompt..." },
  "chosen": { "...JudgmentResult..." },
  "rejected": { "...JudgmentResult..." },
  "provenance": {
    "run_id": "run-...",
    "frame_ref": "kitchen/frames/verify-step3-....jpg",
    "chosen_source": "human|teacher_model",
    "rejected_source": "baseline_model",
    "ts": 1713820000000
  }
}
```

## Dataset 3: GRPO (prompt+image, reward function over model outputs)

GRPO does not require explicit `chosen/rejected`, but requires:

- a **reward function** that scores candidate model outputs
- a **frozen eval set** to verify improvement is real

For our task, rewards should prioritize:

1. **JSON validity** and schema compliance
2. Correct `step_id`
3. Correct `step_complete`
4. Correct `action_detected`
5. Correct `possible_issue`
6. Object overlap / F1

The current `labos-training train-grpo` implementation uses a local weighted reward over those fields and samples multiple completions per prompt to compute group-relative advantages.

## Frozen splits

All training runs should reference immutable split manifests under:

- `data/splits/*.json`

Each split file lists record IDs for:
- `train`
- `eval`
- `holdout`
