import base64
import hashlib
import io
import os
import time
from typing import Any, Literal

import numpy as np
import requests
from fastapi import Depends, FastAPI, Header, HTTPException
from PIL import Image
from pydantic import BaseModel, Field


BackendName = Literal["mock", "grounded_sam2"]


class SegmentRequest(BaseModel):
    imageBase64: str | None = None
    imageUrl: str | None = None
    prompts: list[str] = Field(default_factory=list)
    includeMasks: bool = True
    includeTracks: bool = True
    sessionId: str | None = None
    frameId: str | None = None
    timestampMs: int | None = None
    outputFormat: str = "labos.entity-segmentation.v1"


app = FastAPI(title="OpenLabOS Perception", version="0.2.0")

_grounded_sam2_backend: "GroundedSam2Backend | None" = None


def required_token() -> str:
    return os.environ.get("LABOS_SEGMENTATION_TOKEN", "").strip()


def verify_auth(authorization: str | None = Header(default=None)) -> None:
    token = required_token()
    if not token:
        return
    if authorization != f"Bearer {token}":
        raise HTTPException(status_code=401, detail="invalid segmentation sidecar token")


def backend_name() -> BackendName:
    value = os.environ.get("LABOS_SEGMENTATION_BACKEND", "mock").strip().lower()
    if value in {"grounded-sam2", "grounded_sam2", "sam2"}:
        return "grounded_sam2"
    return "mock"


def clean_prompts(prompts: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for prompt in prompts:
        value = str(prompt or "").strip()
        if value and value.lower() not in seen:
            seen.add(value.lower())
            out.append(value)
    return out


def decode_image(req: SegmentRequest) -> Image.Image:
    if req.imageBase64:
        payload = req.imageBase64
        if "," in payload and payload.lstrip().startswith("data:"):
            payload = payload.split(",", 1)[1]
        data = base64.b64decode(payload)
        return Image.open(io.BytesIO(data)).convert("RGB")

    if req.imageUrl:
        response = requests.get(req.imageUrl, timeout=20)
        response.raise_for_status()
        return Image.open(io.BytesIO(response.content)).convert("RGB")

    raise HTTPException(status_code=400, detail="imageBase64 or imageUrl is required")


def stable_id(frame_id: str | None, label: str, index: int) -> str:
    h = hashlib.sha1(f"{frame_id or 'frame'}:{label}:{index}".encode("utf-8")).hexdigest()[:10]
    return f"ent_{h}"


def mock_box(index: int, width: int, height: int) -> list[int]:
    col = index % 3
    row = (index // 3) % 3
    x1 = int(width * (0.08 + col * 0.29))
    y1 = int(height * (0.11 + row * 0.23))
    x2 = min(width - 1, x1 + int(width * 0.2))
    y2 = min(height - 1, y1 + int(height * 0.17))
    return [x1, y1, x2, y2]


def polygon_from_xyxy(box: list[int]) -> list[list[int]]:
    x1, y1, x2, y2 = box
    return [[x1, y1], [x2, y1], [x2, y2], [x1, y2]]


def build_summary(prompts: list[str], observations: list[dict[str, Any]], tracks: list[dict[str, Any]]) -> dict[str, Any]:
    labels = [str(item.get("label", "")).lower() for item in observations]
    missing = [
        prompt
        for prompt in prompts
        if not any(prompt.lower() in label or label in prompt.lower() for label in labels)
    ]
    avg = sum(float(item.get("confidence", 0)) for item in observations) / len(observations) if observations else 0
    return {
        "objectsFound": [item.get("label") for item in observations],
        "missingPrompts": missing,
        "averageConfidence": avg,
        "hasMasks": any(bool(item.get("segmentation") or item.get("mask")) for item in observations),
        "hasTracks": bool(tracks),
    }


def mock_segment(req: SegmentRequest, image: Image.Image, prompts: list[str], started: float) -> dict[str, Any]:
    width, height = image.size
    observations: list[dict[str, Any]] = []
    for index, label in enumerate(prompts):
        box = mock_box(index, width, height)
        entity_id = stable_id(req.frameId, label, index)
        track_id = f"track_{label.lower().replace(' ', '_')}" if req.includeTracks else None
        observations.append({
            "entityId": entity_id,
            "trackId": track_id,
            "label": label,
            "class_name": label,
            "confidence": 0.62,
            "score": 0.62,
            "bbox": box,
            "box_format": "xyxy",
            "segmentation": {
                "points": polygon_from_xyxy(box),
                "coordinateFrame": "pixel",
            } if req.includeMasks else None,
            "centroid": {
                "x": int((box[0] + box[2]) / 2),
                "y": int((box[1] + box[3]) / 2),
                "coordinateFrame": "pixel",
            },
            "attributes": {"mock": True},
        })

    tracks = [
        {
            "trackId": item["trackId"],
            "label": item["label"],
            "observationIds": [item["entityId"]],
            "confidence": item["confidence"],
            "firstSeenAtMs": req.timestampMs,
            "lastSeenAtMs": req.timestampMs,
        }
        for item in observations
        if item.get("trackId")
    ]
    return {
        "provider": "mock",
        "configured": False,
        "latencyMs": int((time.time() - started) * 1000),
        "prompts": prompts,
        "observations": observations,
        "tracks": tracks,
        "summary": build_summary(prompts, observations, tracks),
        "warnings": ["mock_backend: set LABOS_SEGMENTATION_BACKEND=grounded_sam2 for real masks"],
    }


def encode_rle(mask: np.ndarray) -> dict[str, Any] | None:
    try:
        from pycocotools import mask as mask_utils

        binary = np.asfortranarray(mask.astype(np.uint8))
        rle = mask_utils.encode(binary)
        counts = rle["counts"]
        if isinstance(counts, bytes):
            counts = counts.decode("ascii")
        return {
            "size": [int(mask.shape[0]), int(mask.shape[1])],
            "counts": counts,
            "area": int(mask_utils.area(rle)),
        }
    except Exception:
        return None


class GroundedSam2Backend:
    def __init__(self) -> None:
        import torch
        from sam2.sam2_image_predictor import SAM2ImagePredictor
        from transformers import AutoModelForZeroShotObjectDetection, AutoProcessor

        self.torch = torch
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.grounding_model_id = os.environ.get("GROUNDING_DINO_MODEL", "IDEA-Research/grounding-dino-tiny")
        self.sam2_model_id = os.environ.get("SAM2_MODEL", "facebook/sam2-hiera-large")
        self.box_threshold = float(os.environ.get("GROUNDING_BOX_THRESHOLD", "0.28"))
        self.text_threshold = float(os.environ.get("GROUNDING_TEXT_THRESHOLD", "0.25"))

        self.processor = AutoProcessor.from_pretrained(self.grounding_model_id)
        self.grounder = AutoModelForZeroShotObjectDetection.from_pretrained(self.grounding_model_id).to(self.device)
        self.predictor = SAM2ImagePredictor.from_pretrained(self.sam2_model_id)

    def detect(self, image: Image.Image, prompts: list[str]) -> list[dict[str, Any]]:
        text = ". ".join(prompt if prompt.endswith(".") else f"{prompt}." for prompt in prompts)
        inputs = self.processor(images=image, text=text, return_tensors="pt").to(self.device)
        with self.torch.no_grad():
            outputs = self.grounder(**inputs)
        processed = self.processor.post_process_grounded_object_detection(
            outputs,
            inputs.input_ids,
            box_threshold=self.box_threshold,
            text_threshold=self.text_threshold,
            target_sizes=[image.size[::-1]],
        )[0]

        boxes = processed.get("boxes", [])
        scores = processed.get("scores", [])
        labels = processed.get("labels", [])
        detections: list[dict[str, Any]] = []
        for index, box in enumerate(boxes):
            value = [int(round(float(v))) for v in box.detach().cpu().tolist()]
            detections.append({
                "label": str(labels[index]),
                "score": float(scores[index]),
                "bbox": value,
            })
        return detections

    def segment(self, image: Image.Image, detections: list[dict[str, Any]], include_masks: bool) -> list[dict[str, Any]]:
        if not include_masks or not detections:
            return detections

        image_array = np.array(image)
        with self.torch.inference_mode():
            self.predictor.set_image(image_array)
            for detection in detections:
                box = np.array(detection["bbox"], dtype=np.float32)
                masks, scores, _ = self.predictor.predict(
                    point_coords=None,
                    point_labels=None,
                    box=box,
                    multimask_output=False,
                )
                mask = masks[0] if np.ndim(masks) == 3 else masks
                rle = encode_rle(mask)
                if rle:
                    detection["segmentation"] = rle
                if len(scores):
                    detection["mask_score"] = float(scores[0])
        return detections


def grounded_sam2_segment(req: SegmentRequest, image: Image.Image, prompts: list[str], started: float) -> dict[str, Any]:
    global _grounded_sam2_backend
    if _grounded_sam2_backend is None:
        _grounded_sam2_backend = GroundedSam2Backend()

    detections = _grounded_sam2_backend.detect(image, prompts)
    detections = _grounded_sam2_backend.segment(image, detections, req.includeMasks)
    observations: list[dict[str, Any]] = []
    for index, detection in enumerate(detections):
        label = str(detection.get("label") or f"entity-{index + 1}")
        box = [int(v) for v in detection["bbox"]]
        entity_id = stable_id(req.frameId, label, index)
        track_id = f"track_{label.lower().replace(' ', '_')}" if req.includeTracks else None
        observations.append({
            "entityId": entity_id,
            "trackId": track_id,
            "label": label,
            "class_name": label,
            "confidence": float(detection.get("score", detection.get("mask_score", 0.5))),
            "score": float(detection.get("score", 0.5)),
            "bbox": box,
            "box_format": "xyxy",
            "segmentation": detection.get("segmentation"),
            "centroid": {
                "x": int((box[0] + box[2]) / 2),
                "y": int((box[1] + box[3]) / 2),
                "coordinateFrame": "pixel",
            },
        })

    tracks = [
        {
            "trackId": item["trackId"],
            "label": item["label"],
            "observationIds": [item["entityId"]],
            "confidence": item["confidence"],
            "firstSeenAtMs": req.timestampMs,
            "lastSeenAtMs": req.timestampMs,
        }
        for item in observations
        if item.get("trackId")
    ]
    return {
        "provider": "grounded_sam2",
        "configured": True,
        "latencyMs": int((time.time() - started) * 1000),
        "prompts": prompts,
        "observations": observations,
        "tracks": tracks,
        "summary": build_summary(prompts, observations, tracks),
        "warnings": [],
    }


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "backend": backend_name(),
        "authRequired": bool(required_token()),
    }


@app.post("/segment")
def segment(req: SegmentRequest, _: None = Depends(verify_auth)) -> dict[str, Any]:
    started = time.time()
    prompts = clean_prompts(req.prompts)
    if not prompts:
        raise HTTPException(status_code=400, detail="prompts must contain at least one object")

    image = decode_image(req)
    if backend_name() == "grounded_sam2":
        return grounded_sam2_segment(req, image, prompts, started)
    return mock_segment(req, image, prompts, started)
