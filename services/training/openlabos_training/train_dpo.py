from __future__ import annotations

import argparse
from pathlib import Path
from typing import List, Optional

from openlabos_training.vlm_model import DEFAULT_VLM_MODEL_ID


def _require(pkg: str) -> None:
    try:
        __import__(pkg)
    except Exception as e:  # pragma: no cover
        raise SystemExit(
            f"Missing dependency '{pkg}'.\n"
            "Run `uv sync --python 3.12` in services/training on a GPU box."
        ) from e


def main(argv: Optional[List[str]] = None) -> int:
    p = argparse.ArgumentParser(description="DPO training entrypoint (template).")
    p.add_argument("--dataset", required=True, help="Path to DPO JSONL (prompt+image+chosen/rejected).")
    p.add_argument("--model", default=DEFAULT_VLM_MODEL_ID)
    p.add_argument("--output", required=True)
    args = p.parse_args(argv)

    _require("trl")
    _require("transformers")
    _require("datasets")

    ds_path = Path(args.dataset).resolve()
    out_dir = Path(args.output).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    print("DPO template ready.")
    print(f"- dataset: {ds_path}")
    print(f"- model:   {args.model}")
    print(f"- output:  {out_dir}")
    print("Next: implement DPO dataset formatting using processor.apply_chat_template() + images list.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
