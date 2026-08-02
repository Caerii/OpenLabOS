# Object detection (`services/perception`)

Accepts a frame and returns normalized object observations. Today that means a
deterministic mock backend and an optional Grounded SAM 2 path. The service
does not own sessions or produce step judgments.

## Role in the system

The kitchen run path calls this service from the API when entity segmentation
is configured. Step judgments are separate requests to `services/inference`.
Keeping the normalized observation contract here prevents callers from
depending on a model SDK.

## Runtime contract

`POST /segment`: submit a frame and receive objects with bounding boxes,
confidences, and optional masks or track IDs.

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

`GET /health`: return the backend name and whether bearer auth is required.

The `outputFormat` field identifies the normalized contract version
(`labos.entity-segmentation.v1`). Every backend implementing that version must
return the same shape. A future incompatible shape requires a new format
version and explicit caller support.

## Bootstrap

```bash
pip install -r requirements.txt
uvicorn app:app --port 8002
```

The default `mock` backend exercises the contract without loading a model. For
Grounded SAM 2 on a GPU host:

```bash
LABOS_SEGMENTATION_BACKEND=grounded_sam2
LABOS_SEGMENTATION_TOKEN=<random-long-token>
GROUNDING_DINO_MODEL=IDEA-Research/grounding-dino-tiny
SAM2_MODEL=facebook/sam2-hiera-large
GROUNDING_BOX_THRESHOLD=0.28
GROUNDING_TEXT_THRESHOLD=0.25
```

For contract-only testing, install `requirements-smoke.txt`; it omits the GPU
dependencies.

## Adding a new perception backend

To add a backend:

1. Accept the same `POST /segment` payload.
2. Emit the same `observations`, `tracks`, and `summary` shape.
3. Keep model loading and backend-specific dependencies inside this service.
4. Add contract tests that can run without downloading model weights.

The API, not the inference service, is the current caller.
