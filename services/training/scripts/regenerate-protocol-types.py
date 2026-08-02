"""Regenerate Python types from packages/protocol/schema/*.json.

This is a stub. The OpenLabOS API is implemented in TypeScript (services/api),
so the Python training service no longer imports `labos_api` for protocol
schemas. Instead, JSON Schemas live in `packages/protocol/schema/*.json` and we
regenerate Python models from them with `datamodel-code-generator`.

Wiring this up is a follow-up:
  1. Install datamodel-code-generator in a tooling venv:
       pip install "datamodel-code-generator[http]>=0.25"
  2. Run this script from the repo root; it should produce
     `services/training/openlabos_training/_generated_protocol/` with
     dataclasses / Pydantic models matching the JSON Schemas.
  3. Replace the TODO stubs in:
       - openlabos_training/judgment_sft_prepare.py  (JudgmentResult)
       - openlabos_training/post_sft_infer.py        (JudgmentResult validator)
       - openlabos_training/train_grpo.py            (judgment parsing helpers)
     with imports from the generated module.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[3]
SCHEMA_DIR = REPO_ROOT / "packages" / "protocol" / "schema"
OUT_DIR = (
    REPO_ROOT
    / "services"
    / "training"
    / "openlabos_training"
    / "_generated_protocol"
)


def main() -> int:
    if not SCHEMA_DIR.is_dir():
        print(
            f"ERROR: expected JSON Schema directory at {SCHEMA_DIR}; "
            "create packages/protocol/schema/ before running this script.",
            file=sys.stderr,
        )
        return 2

    schemas = sorted(SCHEMA_DIR.glob("*.json"))
    if not schemas:
        print(f"ERROR: no *.json files found in {SCHEMA_DIR}", file=sys.stderr)
        return 2

    OUT_DIR.parent.mkdir(parents=True, exist_ok=True)
    if OUT_DIR.exists():
        for child in OUT_DIR.glob("*.py"):
            child.unlink()

    cmd = [
        sys.executable,
        "-m",
        "datamodel_code_generator",
        "--input-file-type",
        "jsonschema",
        "--input",
        str(SCHEMA_DIR),
        "--output",
        str(OUT_DIR),
        "--output-model-type",
        "pydantic_v2.BaseModel",
        "--target-python-version",
        "3.12",
        "--use-standard-collections",
        "--use-union-operator",
        "--use-schema-description",
        "--snake-case-field",
    ]

    print("Running:", " ".join(cmd))
    result = subprocess.run(cmd, check=False)
    if result.returncode != 0:
        print(
            "ERROR: datamodel-code-generator failed. "
            "Install it via `pip install 'datamodel-code-generator[http]>=0.25'`.",
            file=sys.stderr,
        )
        return result.returncode

    init_path = OUT_DIR / "__init__.py"
    init_path.write_text(
        '"""Generated from packages/protocol/schema via scripts/regenerate-protocol-types.py."""\n',
        encoding="utf-8",
    )

    print(f"Wrote generated protocol types -> {OUT_DIR}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
