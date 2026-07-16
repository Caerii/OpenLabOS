"""
Regenerate Pydantic models from packages/protocol/schema/*.json into every
Python service that imports them. Run from the repo root after any change
to packages/protocol.

Usage:
    python scripts/regenerate-protocol-types.py [--service NAME]...

If no --service is given, all services that opt in (have an
openlabos_protocol/ directory) are regenerated.

Requires:
    pip install "datamodel-code-generator[http]>=0.25"
"""
from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
SCHEMA_DIR = REPO_ROOT / "packages" / "protocol" / "schema"

# Services that consume the protocol schema. Each entry is the relative path
# of the service's openlabos_protocol/ directory.
DEFAULT_SERVICES = (
    "services/inference/openlabos_inference/openlabos_protocol",
    "services/training/openlabos_training/openlabos_protocol",
    "services/eval/openlabos_eval/openlabos_protocol",
    "services/voice/openlabos_voice/openlabos_protocol",
)


def regenerate(target_pkg: Path) -> int:
    out_dir = target_pkg / "_generated"
    out_dir.mkdir(parents=True, exist_ok=True)

    init = target_pkg / "__init__.py"
    if not init.exists():
        init.write_text(
            '"""Generated protocol types — do not edit by hand.\n\n'
            'Re-emit with `python scripts/regenerate-protocol-types.py`.\n"""\n'
            "from ._generated import *  # noqa: F401,F403\n",
            encoding="utf-8",
        )

    cmd = [
        sys.executable,
        "-m",
        "datamodel_code_generator",
        "--input-file-type",
        "jsonschema",
        "--input",
        str(SCHEMA_DIR),
        "--output",
        str(out_dir),
        "--output-model-type",
        "pydantic_v2.BaseModel",
        "--target-python-version",
        "3.12",
        "--use-standard-collections",
        "--use-union-operator",
        "--use-schema-description",
        "--snake-case-field",
    ]
    print("→", " ".join(cmd))
    proc = subprocess.run(cmd, check=False)
    return proc.returncode


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--service",
        action="append",
        default=None,
        help="Relative path of an openlabos_protocol package; repeatable.",
    )
    args = parser.parse_args()

    if not SCHEMA_DIR.is_dir() or not list(SCHEMA_DIR.glob("*.json")):
        print(
            f"ERROR: no JSON Schemas under {SCHEMA_DIR}. "
            "Build packages/protocol first: pnpm --filter @openlabos/protocol build",
            file=sys.stderr,
        )
        return 2

    if shutil.which("datamodel-codegen") is None:
        try:
            __import__("datamodel_code_generator")
        except ImportError:
            print(
                "ERROR: datamodel-code-generator is not installed. "
                "Run: pip install 'datamodel-code-generator[http]>=0.25'",
                file=sys.stderr,
            )
            return 2

    targets = args.service or DEFAULT_SERVICES
    failures: list[str] = []
    for rel in targets:
        target = REPO_ROOT / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        rc = regenerate(target)
        if rc != 0:
            failures.append(rel)

    if failures:
        print(f"\nFAILED for: {', '.join(failures)}", file=sys.stderr)
        return 1
    print("\nAll services regenerated.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
