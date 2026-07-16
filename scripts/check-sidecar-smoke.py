"""Smoke-test the entity segmentation sidecar without loading GPU backends."""

from __future__ import annotations

import base64
import io
import os
import sys
from pathlib import Path

from fastapi.testclient import TestClient
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SIDECAR = ROOT / "services" / "perception"
sys.path.insert(0, str(SIDECAR))

os.environ["LABOS_SEGMENTATION_BACKEND"] = "mock"
os.environ.pop("LABOS_SEGMENTATION_TOKEN", None)

from app import app  # noqa: E402


def sample_image_base64() -> str:
    image = Image.new("RGB", (16, 12), color=(240, 235, 220))
    buf = io.BytesIO()
    image.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("ascii")


def main() -> None:
    client = TestClient(app)
    health = client.get("/health")
    assert health.status_code == 200, health.text
    assert health.json()["ok"] is True

    response = client.post(
        "/segment",
        json={
            "imageBase64": sample_image_base64(),
            "prompts": ["mug", "tea bag"],
            "includeMasks": True,
            "includeTracks": True,
            "frameId": "smoke-frame",
        },
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["provider"] == "mock"
    assert len(payload["observations"]) == 2
    assert payload["summary"]["hasMasks"] is True
    assert payload["summary"]["hasTracks"] is True
    print("[sidecar-smoke] mock segmentation contract passed")


if __name__ == "__main__":
    main()
