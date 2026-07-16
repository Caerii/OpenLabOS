#!/usr/bin/env bash
set -euo pipefail

# Run this inside a RunPod L40S pod with CUDA available.
# It exposes an OpenAI-compatible API at http://0.0.0.0:${PORT}/v1.

MODEL_ID="${MODEL_ID:-Qwen/Qwen3.5-9B}"
SERVED_MODEL_NAME="${SERVED_MODEL_NAME:-${MODEL_ID}}"
PORT="${PORT:-8000}"
MAX_MODEL_LEN="${MAX_MODEL_LEN:-32768}"
GPU_MEMORY_UTILIZATION="${GPU_MEMORY_UTILIZATION:-0.90}"

python -m pip install --upgrade pip
python -m pip install --upgrade "vllm>=0.11.0" "qwen-vl-utils[decord]"

nvidia-smi

exec python -m vllm.entrypoints.openai.api_server \
  --host 0.0.0.0 \
  --port "${PORT}" \
  --model "${MODEL_ID}" \
  --served-model-name "${SERVED_MODEL_NAME}" \
  --trust-remote-code \
  --dtype bfloat16 \
  --max-model-len "${MAX_MODEL_LEN}" \
  --gpu-memory-utilization "${GPU_MEMORY_UTILIZATION}" \
  --limit-mm-per-prompt image=8,video=1
