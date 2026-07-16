"""CLI for exporting LabOS session manifests into Isaac Lab task specs."""

from __future__ import annotations

import argparse
from pathlib import Path

from openlabos_training.isaac_lab import build_task_spec, load_manifest, write_task_spec


def main() -> None:
    parser = argparse.ArgumentParser(description="Export a LabOS session manifest into an Isaac Lab task spec.")
    parser.add_argument("--manifest", type=Path, required=True, help="LabOS session manifest JSON.")
    parser.add_argument(
        "--out",
        type=Path,
        required=True,
        help="Output isaac_lab_task_spec.json path.",
    )
    args = parser.parse_args()

    manifest_path = args.manifest.resolve()
    spec = build_task_spec(load_manifest(manifest_path), source_path=str(manifest_path))
    out_path = args.out.resolve()
    write_task_spec(spec, out_path)
    print(f"Wrote Isaac Lab task spec -> {out_path}")


if __name__ == "__main__":
    main()
