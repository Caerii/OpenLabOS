"""
Run step judgments with a local Hugging Face model + PEFT adapter (post-SFT path).

This is **not** LM Studio: it loads the Hugging Face VLM base model + LoRA from your SFT output directory,
runs the **same** prompt and frame policy as ``apps/api`` ``POST /judgments``, and inserts rows into
SQLite with a **caller-chosen** ``model_id`` so TASK-0008 / TASK-0010 can distinguish them from
LM Studio baseline judgments.

LM Studio cannot consume HF adapter folders directly; use this script (or merge/export to GGUF
elsewhere) for post-SFT comparisons.
"""

from __future__ import annotations

import argparse
import json
import os
import sqlite3
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import torch
from PIL import Image


# TODO(openlabos): replace with judgment + media persistence helpers (insert_judgment, get_clip, session_step_exists) reading services/api SQLite schema
# was: from labos_api.persistence import judgment_repository, media_repository
class _JudgmentRepositoryStub:
    @staticmethod
    def insert_judgment(*args: Any, **kwargs: Any) -> None:  # pragma: no cover - stub
        raise NotImplementedError(
            "TODO(openlabos): port judgment_repository.insert_judgment; "
            "was labos_api.persistence.judgment_repository.insert_judgment",
        )


class _MediaRepositoryStub:
    @staticmethod
    def get_clip(conn: sqlite3.Connection, *, clip_id: str) -> Any:  # pragma: no cover - stub
        raise NotImplementedError(
            "TODO(openlabos): port media_repository.get_clip; "
            "was labos_api.persistence.media_repository.get_clip",
        )

    @staticmethod
    def session_step_exists(conn: sqlite3.Connection, *, session_id: str, step_id: str) -> bool:  # pragma: no cover - stub
        raise NotImplementedError(
            "TODO(openlabos): port media_repository.session_step_exists; "
            "was labos_api.persistence.media_repository.session_step_exists",
        )


judgment_repository = _JudgmentRepositoryStub()
media_repository = _MediaRepositoryStub()


# TODO(openlabos): replace with frame selection helper from openlabos protocol package
# was: from labos_api.services.frame_selection import FrameSelectionError, select_frames_for_clip
class FrameSelectionError(RuntimeError):
    """Stub for labos_api.services.frame_selection.FrameSelectionError."""


def select_frames_for_clip(*, data_root: Path, session_id: str, clip_id: str) -> list[str]:  # pragma: no cover - stub
    raise NotImplementedError(
        "TODO(openlabos): port frame selection; "
        "was labos_api.services.frame_selection.select_frames_for_clip",
    )


# TODO(openlabos): replace with strict JSON judgment parser/validator (matches generated openlabos_protocol JudgmentResult schema)
# was: from labos_api.services.judgment_parsing import JudgmentParseError, parse_strict_json, validate_judgment
class JudgmentParseError(RuntimeError):
    """Stub for labos_api.services.judgment_parsing.JudgmentParseError."""


def parse_strict_json(text: str) -> dict[str, Any]:  # pragma: no cover - stub
    raise NotImplementedError(
        "TODO(openlabos): port parse_strict_json; "
        "was labos_api.services.judgment_parsing.parse_strict_json",
    )


def validate_judgment(parsed: dict[str, Any]) -> Any:  # pragma: no cover - stub
    raise NotImplementedError(
        "TODO(openlabos): port validate_judgment; "
        "was labos_api.services.judgment_parsing.validate_judgment",
    )


# TODO(openlabos): replace with judgment prompt builder
# was: from labos_api.services.judgment_prompt import build_step_prompt
def build_step_prompt(*, protocol: Any, step: Any, frame_paths: list[str]) -> Any:  # pragma: no cover - stub
    raise NotImplementedError(
        "TODO(openlabos): port build_step_prompt; "
        "was labos_api.services.judgment_prompt.build_step_prompt",
    )


# TODO(openlabos): replace with protocol registry that loads protocol JSON files
# was: from labos_api.services.protocol_registry import ProtocolRegistry
class ProtocolRegistry:  # pragma: no cover - stub
    @classmethod
    def from_single_path(cls, path: Path) -> "ProtocolRegistry":
        raise NotImplementedError(
            "TODO(openlabos): port ProtocolRegistry.from_single_path; "
            "was labos_api.services.protocol_registry.ProtocolRegistry.from_single_path",
        )

    def get(self, protocol_id: str) -> Any:
        raise NotImplementedError(
            "TODO(openlabos): port ProtocolRegistry.get; "
            "was labos_api.services.protocol_registry.ProtocolRegistry.get",
        )


# TODO(openlabos): replace with safe path-join helper that prevents traversal under data_root
# was: from labos_api.storage.media_paths import MediaPathError, resolve_data_path
class MediaPathError(RuntimeError):
    """Stub for labos_api.storage.media_paths.MediaPathError."""


def resolve_data_path(data_root: Path, rel: str) -> Path:  # pragma: no cover - stub
    raise NotImplementedError(
        "TODO(openlabos): port resolve_data_path (safe join under data_root); "
        "was labos_api.storage.media_paths.resolve_data_path",
    )


def _default_repo_root() -> Path:
    """openlabos_training/post_sft_infer.py -> .../services/training -> repo root."""
    return Path(__file__).resolve().parents[3]


def _resolve_base_model_id(adapter_dir: Path, override: str | None) -> str:
    if override:
        return override.strip()
    rm = adapter_dir / "run-manifest.json"
    if rm.exists():
        data = json.loads(rm.read_text(encoding="utf-8"))
        mid = data.get("base_model_id")
        if isinstance(mid, str) and mid.strip():
            return mid.strip()
    ac = adapter_dir / "adapter_config.json"
    if ac.exists():
        data = json.loads(ac.read_text(encoding="utf-8"))
        mid = data.get("base_model_name_or_path")
        if isinstance(mid, str) and mid.strip():
            return mid.strip()
    raise SystemExit(
        "Could not infer base model; pass --base-model or ensure adapter_dir contains "
        "run-manifest.json (base_model_id) or adapter_config.json (base_model_name_or_path).",
    )


def _iter_split(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8-sig") as f:
        for i, line in enumerate(f, start=1):
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
            except json.JSONDecodeError as e:
                raise SystemExit(f"{path}: line {i} invalid JSON: {e}") from e
            if not isinstance(obj, dict):
                raise SystemExit(f"{path}: line {i} must be an object")
            rows.append(obj)
    return rows


def _resolve_split_path(
    p: argparse.ArgumentParser,
    *,
    split_jsonl: str,
    frozen_dir: str,
    split: str,
) -> tuple[Path, dict[str, Any]]:
    """Return resolved split JSONL path and optional manifest fields for how it was chosen."""
    j = (split_jsonl or "").strip()
    fd = (frozen_dir or "").strip()
    sp = (split or "").strip()
    if j:
        if fd or sp:
            p.error("Provide either --split-jsonl or (--frozen-dir and --split), not both.")
        return Path(j).resolve(), {"split_input_mode": "split_jsonl"}
    if fd and sp:
        if sp not in ("train", "val", "test"):
            p.error("--split must be one of: train, val, test")
        frozen = Path(fd).resolve()
        return frozen / f"{sp}.jsonl", {
            "split_input_mode": "frozen_dir",
            "frozen_dir": str(frozen),
            "split_name": sp,
        }
    if fd or sp:
        p.error("--frozen-dir and --split must be given together.")
    p.error("Provide --split-jsonl or --frozen-dir with --split (train|val|test).")


def _get_protocol(conn: sqlite3.Connection, registry: ProtocolRegistry, *, session_id: str):
    row = conn.execute("SELECT protocol_id FROM sessions WHERE session_id = ?", (session_id,)).fetchone()
    if row is None:
        return None, None
    pid = str(row[0])
    return registry.get(pid), pid


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        description="HF+PEFT judgments for a frozen split (post-SFT inference bridge).",
    )
    p.add_argument(
        "--split-jsonl",
        default="",
        help="Explicit path to a split JSONL (e.g. .../test.jsonl). Alternative: --frozen-dir + --split.",
    )
    p.add_argument(
        "--frozen-dir",
        default="",
        help="TASK-0009 freeze directory containing train.jsonl / val.jsonl / test.jsonl (use with --split).",
    )
    p.add_argument(
        "--split",
        default="",
        metavar="SPLIT",
        help="Which file under --frozen-dir: train, val, or test (implies <split>.jsonl).",
    )
    p.add_argument("--sqlite", required=True, help="SQLite DB (same schema as API).")
    p.add_argument("--data-root", required=True, help="Data root (LABOS_DATA_ROOT).")
    p.add_argument(
        "--protocol-path",
        default="",
        help="Protocol JSON (default: infer from path or LABOS_PROTOCOL_PATH).",
    )
    p.add_argument("--adapter-dir", required=True, help="SFT output dir with adapter + processor.")
    p.add_argument("--base-model", default="", help="Override base HF model id if manifest is missing.")
    p.add_argument(
        "--judgment-model-id",
        required=True,
        help="Stored in judgments.model_id (e.g. hf-sft:my-run:Qwen/Qwen3.5-9B). Must be distinct from LM Studio ids.",
    )
    p.add_argument("--max-new-tokens", type=int, default=512)
    p.add_argument("--limit", type=int, default=0, help="If >0, only process first N rows (smoke).")
    p.add_argument("--dry-run", action="store_true", help="Load model and process rows but do not write SQLite.")
    p.add_argument(
        "--show-raw-on-parse-fail",
        action="store_true",
        help="Print decoded model text (truncated) to stderr when JSON parse/validation fails (smoke debugging).",
    )
    p.add_argument(
        "--manifest-out",
        default="",
        help="Write infer_manifest.json to this path (default: <adapter-dir>/infer_manifest.json).",
    )
    args = p.parse_args(argv)

    split_path, split_manifest_extra = _resolve_split_path(
        p,
        split_jsonl=args.split_jsonl,
        frozen_dir=args.frozen_dir,
        split=args.split,
    )
    sqlite_path = Path(args.sqlite).resolve()
    data_root = Path(args.data_root).resolve()
    adapter_dir = Path(args.adapter_dir).resolve()

    if not split_path.is_file():
        print(f"ERROR: split not found: {split_path}", file=sys.stderr)
        return 2
    if not sqlite_path.is_file():
        print(f"ERROR: sqlite not found: {sqlite_path}", file=sys.stderr)
        return 2
    if not data_root.is_dir():
        print(f"ERROR: data-root not a directory: {data_root}", file=sys.stderr)
        return 2
    if not adapter_dir.is_dir():
        print(f"ERROR: adapter-dir not a directory: {adapter_dir}", file=sys.stderr)
        return 2

    if args.protocol_path:
        protocol_path = Path(args.protocol_path).resolve()
    else:
        env = os.environ.get("LABOS_PROTOCOL_PATH")
        if env:
            protocol_path = Path(env).resolve()
        else:
            protocol_path = _default_repo_root() / "packages" / "protocol-schema" / "examples" / "kitchen-tea-v1.json"
    if not protocol_path.is_file():
        print(f"ERROR: protocol file not found: {protocol_path}", file=sys.stderr)
        return 2

    base_model = _resolve_base_model_id(adapter_dir, args.base_model or None)

    from peft import PeftModel
    from transformers import AutoProcessor

    from openlabos_training.vlm_model import load_vlm_for_generation

    processor = AutoProcessor.from_pretrained(str(adapter_dir), trust_remote_code=True)
    tok = processor.tokenizer

    try:
        base = load_vlm_for_generation(
            base_model,
            trust_remote_code=True,
            torch_dtype=torch.bfloat16 if torch.cuda.is_available() else None,
            device_map="auto" if torch.cuda.is_available() else None,
        )
    except Exception as e:
        print(f"ERROR: failed to load base model {base_model!r}: {e}", file=sys.stderr)
        return 2

    try:
        model = PeftModel.from_pretrained(base, str(adapter_dir))
    except Exception as e:
        print(f"ERROR: failed to load adapter from {adapter_dir}: {e}", file=sys.stderr)
        return 2

    model.eval()
    if not torch.cuda.is_available():
        print("ERROR: CUDA required for this path today.", file=sys.stderr)
        return 2

    registry = ProtocolRegistry.from_single_path(protocol_path)
    rows = _iter_split(split_path)
    if args.limit and args.limit > 0:
        rows = rows[: int(args.limit)]

    created_at = datetime.now(UTC).replace(microsecond=0).isoformat()
    if args.manifest_out:
        manifest_path = Path(args.manifest_out).resolve()
    else:
        # Avoid overwriting prior manifests so runs are stable artifacts.
        base = adapter_dir / "infer_manifest.json"
        if base.exists():
            safe_ts = created_at.replace(":", "").replace("+", "").replace("-", "")
            manifest_path = adapter_dir / f"infer_manifest_{safe_ts}.json"
        else:
            manifest_path = base

    stats = {"ok": 0, "parse_fail": 0, "step_mismatch": 0, "frame_error": 0, "skipped": 0}

    conn = sqlite3.connect(str(sqlite_path))
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        for obj in rows:
            try:
                session_id = str(obj["session_id"])
                clip_id = str(obj["clip_id"])
                step_id = str(obj["step_id"])
            except KeyError as e:
                print(f"ERROR: row missing key {e}: {obj}", file=sys.stderr)
                return 2

            clip = media_repository.get_clip(conn, clip_id=clip_id)
            if clip is None:
                print(f"WARNING: clip not in DB, skip clip_id={clip_id}", file=sys.stderr)
                stats["skipped"] += 1
                continue
            if not media_repository.session_step_exists(conn, session_id=clip.session_id, step_id=step_id):
                print(f"WARNING: step not in session, skip clip_id={clip_id} step_id={step_id}", file=sys.stderr)
                stats["skipped"] += 1
                continue

            protocol, _pid = _get_protocol(conn, registry, session_id=clip.session_id)
            if protocol is None:
                stats["skipped"] += 1
                continue
            step = next((s for s in protocol.steps if s.step_id == step_id), None)
            if step is None:
                stats["skipped"] += 1
                continue

            try:
                frame_rel_paths = select_frames_for_clip(
                    data_root=data_root,
                    session_id=clip.session_id,
                    clip_id=clip.clip_id,
                )
            except FrameSelectionError as e:
                print(f"WARNING: frames clip_id={clip_id}: {e}", file=sys.stderr)
                stats["frame_error"] += 1
                continue

            prompt = build_step_prompt(protocol=protocol, step=step, frame_paths=frame_rel_paths)
            images: list[Image.Image] = []
            frame_load_failed = False
            for rel in frame_rel_paths:
                try:
                    abs_p = resolve_data_path(data_root, rel)
                except MediaPathError as e:
                    print(f"WARNING: bad path {rel!r}: {e}", file=sys.stderr)
                    stats["frame_error"] += 1
                    frame_load_failed = True
                    break
                if not abs_p.is_file():
                    print(f"WARNING: missing file {abs_p}", file=sys.stderr)
                    stats["frame_error"] += 1
                    frame_load_failed = True
                    break
                images.append(Image.open(abs_p).convert("RGB"))
            if frame_load_failed or len(images) != len(frame_rel_paths):
                continue

            user_msgs: list[dict[str, Any]] = []
            if prompt.system.strip():
                user_msgs.append({"role": "system", "content": [{"type": "text", "text": prompt.system}]})
            user_msgs.append(
                {
                    "role": "user",
                    "content": [{"type": "text", "text": prompt.user}] + [{"type": "image"} for _ in images],
                },
            )
            prompt_text = processor.apply_chat_template(
                user_msgs,
                tokenize=False,
                add_generation_prompt=True,
            )
            inputs = processor(
                text=[prompt_text],
                images=[images],
                return_tensors="pt",
                padding=True,
            )
            dev = next(model.parameters()).device
            inputs = {k: (v.to(dev) if torch.is_tensor(v) else v) for k, v in inputs.items()}

            pad_id = tok.pad_token_id if tok.pad_token_id is not None else tok.eos_token_id
            with torch.inference_mode():
                out = model.generate(
                    **inputs,
                    max_new_tokens=int(args.max_new_tokens),
                    do_sample=False,
                    pad_token_id=pad_id,
                )
            in_len = inputs["input_ids"].shape[1]
            raw = tok.decode(out[0, in_len:], skip_special_tokens=True).strip()

            try:
                parsed = parse_strict_json(raw)
                result = validate_judgment(parsed)
            except JudgmentParseError as e:
                stats["parse_fail"] += 1
                if args.show_raw_on_parse_fail:
                    snippet = raw if len(raw) <= 4000 else raw[:4000] + "\n... [truncated]"
                    print(
                        f"PARSE_FAIL clip_id={clip_id} step_id={step_id}: {e}\n--- raw ---\n{snippet}\n--- end raw ---",
                        file=sys.stderr,
                    )
                continue

            if result.step_id != step_id:
                stats["step_mismatch"] += 1
                continue

            if args.dry_run:
                stats["ok"] += 1
                continue

            judgment_repository.insert_judgment(
                conn,
                session_id=clip.session_id,
                clip_id=clip.clip_id,
                step_id=step_id,
                result=result,
                model_id=str(args.judgment_model_id),
                prompt_text=None,
                response_json=None,
            )
            stats["ok"] += 1

        if not args.dry_run:
            conn.commit()
    finally:
        conn.close()

    manifest = {
        "task": "post_sft_hf_infer",
        "created_at": created_at,
        "split_jsonl": str(split_path),
        **split_manifest_extra,
        "sqlite_path": str(sqlite_path),
        "data_root": str(data_root),
        "protocol_path": str(protocol_path),
        "adapter_dir": str(adapter_dir),
        "base_model_hf": base_model,
        "judgment_model_id": str(args.judgment_model_id),
        "dry_run": bool(args.dry_run),
        "max_new_tokens": int(args.max_new_tokens),
        "labos_judgment_max_frames": int(os.environ.get("LABOS_JUDGMENT_MAX_FRAMES", "8")),
        "stats": stats,
        "argv": list(sys.argv),
        "notes": (
            "Judgments are inserted like API judgments; latest row per clip_id wins in eval. "
            "Use a unique judgment_model_id so baselines are not ambiguous."
        ),
    }
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(json.dumps({"manifest": str(manifest_path), **stats}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
