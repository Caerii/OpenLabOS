from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
TRAINING_ROOT = ROOT / "services" / "training"
for path in (str(TRAINING_ROOT), str(ROOT)):
    if path not in sys.path:
        sys.path.insert(0, path)

from openlabos_training.world_model.manifest_io import (
    episode_from_path,
    manifest_join_integrity,
    media_coverage,
    resolve_frame_ref,
)
from openlabos_training.world_model.query_suite import build_query_suite
from openlabos_training.world_model.shootout import run_shootout


def test_manifest_join_integrity_on_fixture(tmp_path: Path) -> None:
    manifest = {
        "schemaVersion": "labos.kitchen.session-manifest.v1",
        "run": {"id": "run-1", "protocolId": "kitchen-tea-v1", "protocolName": "Tea", "status": "completed"},
        "stepSegments": [{"id": "seg-1", "stepNumber": 1, "frameRefs": ["kitchen/frames/a.jpg"]}],
        "exportHints": {
            "stableJoinKeys": [
                "run.id",
                "run.protocolId",
                "steps.number",
                "stepAttempts.attemptId",
                "stepSegments.id",
                "frames.frameRef",
            ],
        },
    }
    result = manifest_join_integrity(manifest)
    assert result["ok"] is True


def test_query_suite_from_segment() -> None:
    manifest = {
        "run": {"id": "run-1"},
        "stepSegments": [
            {
                "id": "seg-1",
                "stepNumber": 2,
                "stepInstruction": "Pour water.",
                "frameRefs": ["kitchen/frames/a.jpg"],
                "startedAt": 10,
                "endedAt": 20,
            },
        ],
    }
    queries = build_query_suite("run-1", manifest)
    types = {query.query_type for query in queries}
    assert "step_instruction" in types
    assert "step_evidence" in types
    assert "step_time_range" in types
    instruction = next(query for query in queries if query.query_type == "step_instruction")
    assert instruction.gold_answer == "Pour water."


def test_shootout_dry_run(tmp_path: Path) -> None:
    manifest_dir = tmp_path / "manifests"
    manifest_dir.mkdir()
    manifest = {
        "schemaVersion": "labos.kitchen.session-manifest.v1",
        "run": {
            "id": "dry-run",
            "protocolId": "kitchen-tea-v1",
            "protocolName": "Tea",
            "status": "completed",
        },
        "stepSegments": [
            {
                "id": "seg-1",
                "stepNumber": 1,
                "stepInstruction": "Boil water.",
                "frameRefs": [],
                "startedAt": 1,
                "endedAt": 2,
            },
        ],
        "exportHints": {"stableJoinKeys": ["run.id", "run.protocolId", "stepSegments.id", "frames.frameRef"]},
    }
    (manifest_dir / "dry-run.json").write_text(json.dumps(manifest), encoding="utf-8")

    report = run_shootout(
        manifest_dir=manifest_dir,
        data_root=None,
        run_ids=None,
        label="test",
        phase=0,
        stacks=["a", "b", "c"],
        dry_run=True,
        out_dir=tmp_path / "out",
    )
    assert report["dryRun"] is True
    assert report["manifestCount"] == 1
    assert report["queryCount"] >= 2


def test_media_coverage_missing_files() -> None:
    frames = [resolve_frame_ref(None, "kitchen/frames/missing.jpg")]
    coverage = media_coverage(frames, [])
    assert coverage["mediaCoverageRate"] == 0.0


def test_episode_from_repo_fixture() -> None:
    repo_root = Path(__file__).resolve().parents[3]
    manifest_path = repo_root / "services" / "api" / "data" / "kitchen" / "manifests" / "test-step-segment-1782523608221-79ops5.json"
    if not manifest_path.exists():
        return
    episode = episode_from_path(manifest_path)
    assert episode.run_id.startswith("test-step-segment")


def _run_all() -> None:
    import tempfile

    test_manifest_join_integrity_on_fixture(Path(tempfile.mkdtemp()))
    test_query_suite_from_segment()
    test_shootout_dry_run(Path(tempfile.mkdtemp()))
    test_media_coverage_missing_files()
    test_episode_from_repo_fixture()
    print("world_model_shootout tests: ok")


if __name__ == "__main__":
    _run_all()
