# Runbook: Protocol-Constrained Hybrid Validator

This runbook documents the no-new-data validation path used for the kitchen tea contract smoke artifact.

## Purpose

Use this when the baseline VLM and fine-tuned adapter have complementary strengths.

In the current kitchen tea run:

- baseline VLM is stronger at `objects_seen`, `possible_issue`, and visual grounding
- SFT adapter is stronger at `action_detected`
- protocol schema knows the expected action and allowed failure modes for each step

The hybrid validator writes a new audited `judgments.model_id` into SQLite. It is a validation-layer result, not a pure single-model result.

## Routing Policy

For each clip:

| Field | Rule |
|---|---|
| `objects_seen` | Use baseline objects |
| `action_detected` | Use SFT action only when it equals the protocol expected action; otherwise use baseline action |
| `possible_issue` | Use baseline issue only when it is an allowed failure mode for that protocol step; otherwise null |
| `step_complete` | Force false when a protocol-allowed issue remains; otherwise use baseline completion, with a narrow SFT completion override for out-of-protocol baseline issues |

Every row records its routing decisions in `response_json` and in the audit file.

## Command

From the repo root:

```powershell
cd services\eval
uv run labos-eval-metrics hybrid-judgments `
  --dataset ..\..\data\splits\kitchen_tea_latest\20260502-contract-smoke-v2\test.jsonl `
  --sqlite ..\..\data\tmp\kitchen_tea_latest-20260502-contract-smoke-v2.sqlite `
  --protocol ..\..\packages\protocol-schema\examples\kitchen-tea-v1.json `
  --baseline-model-id openlabos-runs:together-qwen35-step-analysis-normalized `
  --sft-model-id hf-sft:kitchen-tea-latest-fast5:qwen2.5-vl-3b `
  --output-model-id hybrid:protocol-constrained-baseline+fast5-action:v1 `
  --audit-out ..\..\reports\contract\kitchen_tea_latest\20260502-contract-smoke-v2\hybrid_fast5_audit.json `
  --replace
```

Then evaluate:

```powershell
uv run labos-eval-metrics judgments `
  --dataset ..\..\data\splits\kitchen_tea_latest\20260502-contract-smoke-v2\test.jsonl `
  --sqlite ..\..\data\tmp\kitchen_tea_latest-20260502-contract-smoke-v2.sqlite `
  --out ..\..\reports\contract\kitchen_tea_latest\20260502-contract-smoke-v2\hybrid_fast5 `
  --required-model-id hybrid:protocol-constrained-baseline+fast5-action:v1
```

## Current Smoke Result

On `kitchen_tea_latest / 20260502-contract-smoke-v2`, the hybrid validator scored:

- `judgment_coverage_rate`: 1.0
- `step_complete_accuracy`: 1.0
- `action_detected_accuracy`: 1.0
- `objects_micro_f1`: 1.0
- `issue_detection_f1`: 1.0

Artifact paths:

- metrics: `reports/contract/kitchen_tea_latest/20260502-contract-smoke-v2/hybrid_fast5/judgment-eval.md`
- audit: `reports/contract/kitchen_tea_latest/20260502-contract-smoke-v2/hybrid_fast5_audit.json`
- report: `reports/contract/kitchen_tea_latest/20260502-contract-smoke-v2/hybrid-validator-report.md`

## Claim Boundary

Safe:

> A protocol-constrained validation layer combines baseline grounding with the SFT adapter's improved action signal and improves the end-to-end validator on the kitchen tea smoke set.

Unsafe:

> The fine-tuned model alone is now perfect.

Unsafe:

> This proves held-out generalization.

## Maintenance

Focused routing tests live at:

- `services/eval/tests/test_hybrid_validator.py`

If the routing policy changes, update:

- `services/eval/labos_eval/hybrid_validator.py`
- this runbook
- `reports/contract/kitchen_tea_latest/20260502-contract-smoke-v2/hybrid-validator-report.md`

The legacy `scripts/build_contract_hybrid_judgments.py` wrapper remains for compatibility, but the supported interface is `uv run labos-eval-metrics hybrid-judgments`.
