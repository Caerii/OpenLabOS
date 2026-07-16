"""Smoke test for the Isaac Lab bridge contract."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
TRAINING_ROOT = ROOT / "services" / "training"
API_ROOT = ROOT / "services" / "api"
for path in (str(TRAINING_ROOT), str(API_ROOT), str(ROOT)):
    if path not in sys.path:
        sys.path.insert(0, path)

from openlabos_training.isaac_lab import SCHEMA_VERSION, build_task_spec


def main() -> None:
    manifest = {
        "run": {"id": "run-test", "protocolId": "kitchen-tea-v1"},
        "protocol": {
            "id": "kitchen-tea-v1",
            "steps": [
                {
                    "id": "place-mug-on-counter",
                    "number": 1,
                    "instruction": "Place the mug on the counter.",
                    "requiredObjects": ["mug"],
                    "successCriteria": "Mug is stable on the counter.",
                },
                {
                    "id": "pour-water-into-mug",
                    "number": 2,
                    "instruction": "Pour water into the mug.",
                    "requiredObjects": ["mug", "kettle"],
                    "successCriteria": "Water is inside the mug.",
                },
            ],
        },
    }

    spec = build_task_spec(manifest, source_path="manifest.json")
    assert spec["schema_version"] == SCHEMA_VERSION
    assert spec["source"]["run_id"] == "run-test"
    assert spec["source"]["protocol_id"] == "kitchen-tea-v1"
    assert spec["isaac_lab"]["headless_default"] is True
    assert spec["environment"]["objects"] == ["kettle", "mug"]
    assert spec["environment"]["steps"][1]["step_id"] == "pour-water-into-mug"
    assert "optional B3D scene graph and object-pose uncertainty" in spec["observations"]

    print("[isaac_lab_smoke] all checks passed")


if __name__ == "__main__":
    main()
