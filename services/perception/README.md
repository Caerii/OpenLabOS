# OpenLabOS Perception

Perception sidecar for OpenLabOS. Today it provides entity segmentation; the same service is intended to grow into the runtime home for tracking, spatial summary, and capture-readiness signals consumed by the rest of the platform.

## Role in the system

`services/inference` is the judgment layer: it decides whether the operator is on-protocol, what to coach, and what to record. Before producing a judgment, it gathers visual evidence by calling this perception sidecar. The contract is intentionally narrow and HTTP-shaped so that alternative perception backends (SAM, GroundingDINO, OWL-ViT, custom detectors, etc.) can be dropped in as sibling apps without changing the caller. Adding a new backend means writing a new app that satisfies the same contract and pointing `services/inference` at it.

## Runtime contract

`POST /segment` — submit a frame, receive observed objects with bounding boxes and confidences (and optional masks + per-object tracks).

Request:

```json
{
  "imageBase64": "...",
  "imageUrl": "https://...",
  "prompts": ["mug", "kettle", "tea bag", "hand"],
  "includeMasks": true,
  "includeTracks": true,
  "sessionId": "run-id",
  "frameId": "step-frame-id",
  "timestampMs": 123456789
}
```

Response (normalized):

- `observations`: per-object `label`, `bbox` (xyxy), `confidence`, optional `segmentation` mask, `centroid`, optional `trackId`
- `tracks`: stable per-object identities for the frame/session
- `summary`: `objectsFound`, `missingPrompts`, `averageConfidence`, `hasMasks`, `hasTracks`

`GET /health` — backend name and whether bearer auth is required.

The `outputFormat` field in requests and the response shape are versioned (`labos.entity-segmentation.v1`) so additional backends can advertise alternative shapes when they ship.

## Bootstrap

```bash
pip install -r requirements.txt
uvicorn app:app --port 8090
```

Default backend is `mock`, which validates the contract end-to-end without loading any GPU models. For a real backend on a GPU host:

```bash
LABOS_SEGMENTATION_BACKEND=grounded_sam2
LABOS_SEGMENTATION_TOKEN=<random-long-token>
GROUNDING_DINO_MODEL=IDEA-Research/grounding-dino-tiny
SAM2_MODEL=facebook/sam2-hiera-large
GROUNDING_BOX_THRESHOLD=0.28
GROUNDING_TEXT_THRESHOLD=0.25
```

For lightweight local testing of the contract only, install `requirements-smoke.txt` instead — it omits the heavy ML dependencies.

## Adding a new perception backend

The contract is intended to be implemented by alternative perception backends — SAM variants, GroundingDINO variants, OWL-ViT, depth/3D-aware models, multi-frame trackers, etc. Adding one is dropping in a sibling app that:

1. Accepts the same `POST /segment` payload
2. Emits the same `observations` / `tracks` / `summary` shape
3. Runs as its own service so `services/inference` can target it via configuration

Treat this directory as the reference implementation, not as the only implementation.
