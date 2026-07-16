#!/usr/bin/env bash
set -euo pipefail

# Example: run `openlabos-train-sft` on Hugging Face Jobs (managed GPU).
#
# Prereqs:
# - Install the Hugging Face CLI: https://huggingface.co/docs/huggingface_hub/main/guides/cli
# - `hf auth login` with a token that can **start Jobs** in the target namespace.
#   If you see `missing permissions: job.write`, your token/org role needs Jobs permissions.
#   Jobs auth requirements are described in the Hub Jobs reference:
#   https://huggingface.co/docs/hub/en/jobs-reference
# - If you run `hf jobs uv run` under an org namespace, you also need permission to create the
#   ephemeral private dataset repo HF uses to upload the UV script (or pass `--repo` to an existing repo).
# - Token roles/scopes overview:
#   https://huggingface.co/docs/hub/en/security-tokens
# - A paid HF plan that includes Jobs (see HF docs / pricing)
#
# Docs:
# - Jobs overview: https://huggingface.co/docs/hub/jobs
# - Jobs pricing: https://huggingface.co/docs/hub/jobs-pricing
#
# Notes:
# - Replace placeholders below (dataset path, output repo id, flavor, timeout).
# - This is intentionally an *example* — tune batch size / max steps for your GPU flavor.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Extra CLI args for `openlabos-train-sft` (required for real runs).
# Example:
#   export HF_JOB_EXTRA_ARGS="--dataset /workspace/data/sft.jsonl --model ... --out /workspace/out"
if [[ -z "${HF_JOB_EXTRA_ARGS:-}" ]]; then
  echo "Set HF_JOB_EXTRA_ARGS to the openlabos-train-sft flags you want (see services/training/.env.example)."
  exit 2
fi

# shellcheck disable=SC2086
hf jobs uv run \
  --namespace "${HF_JOB_NAMESPACE:-Halcyox}" \
  --flavor "${HF_JOB_FLAVOR:-l4x1}" \
  --timeout "${HF_JOB_TIMEOUT:-4h}" \
  --secrets HF_TOKEN \
  --env LABOS_DASHBOARD_DATA="${LABOS_DASHBOARD_DATA:?set LABOS_DASHBOARD_DATA}" \
  --cwd "${ROOT}" \
  -- \
  uv run openlabos-train-sft ${HF_JOB_EXTRA_ARGS}
