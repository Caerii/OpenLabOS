# RunPod runbook: Qwen3.5-9B on L40S

This is the first inference target for LabOS student VLM testing.

## Pod shape

- GPU: **1x L40S 48GB**
- Runtime: vLLM OpenAI-compatible server
- Model: `Qwen/Qwen3.5-9B`
- Endpoint: `http://<pod-host>:8000/v1`

The L40S is the preferred first pod because it has enough VRAM headroom for a 9B multimodal model without forcing aggressive quantization before we have baseline numbers.

## Start the server

Inside the pod:

```bash
git clone <openlabos-training-repo-url>
cd openlabos-training/services/training
bash scripts/runpod-vllm-qwen3_5_9b-l40s.sh
```

Optional overrides:

```bash
MODEL_ID=Qwen/Qwen3.5-9B \
SERVED_MODEL_NAME=Qwen/Qwen3.5-9B \
PORT=8000 \
MAX_MODEL_LEN=32768 \
GPU_MEMORY_UTILIZATION=0.90 \
bash scripts/runpod-vllm-qwen3_5_9b-l40s.sh
```

## Configure local clients

In `services/training/.env`:

```bash
REMOTE_OPENAI_BASE_URL=http://<pod-host>:8000/v1
REMOTE_OPENAI_MODEL_ID=Qwen/Qwen3.5-9B
# LMSTUDIO_BASE_URL=http://192.168.50.2:1234/v1
LMSTUDIO_MODEL_ID=qwen3.5-9b-vlm
```

For the dashboard, the first compatible route is still OpenAI-compatible provider config. Once the pod URL is known, add a first-class dashboard provider or point an OpenAI-compatible provider at the pod for student comparisons.

## Smoke checks

List models:

```bash
curl http://<pod-host>:8000/v1/models
```

Run one text-only check:

```bash
curl http://<pod-host>:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"Qwen/Qwen3.5-9B","messages":[{"role":"user","content":"Return the word ready."}],"max_tokens":16}'
```

For video and image checks, use the LabOS ingestion manifests from `data/raw/*/manifests/samples.jsonl` so every test case has stable provenance.

## Cost discipline

The pod should be treated as ephemeral inference infrastructure:

- stop it when not actively testing
- keep datasets/checkpoints on a persistent volume or copied back out
- record the pod GPU, model id, vLLM version, and max context in the run manifest

## Next integration step

After the server is reachable, run teacher/student collection with the remote endpoint:

```bash
cd services/training
uv run labos-collect-dpo \
  --dashboard-data ..\..\data\raw\openlabos-runs \
  --out ..\..\data\processed\dpo_pairs_qwen35_runpod.jsonl \
  --teacher-url http://localhost:3847 \
  --student-url http://<pod-host>:8000/v1 \
  --student-model Qwen/Qwen3.5-9B
```
