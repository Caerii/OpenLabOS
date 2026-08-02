"""
LoRA SFT on the judgment task using JSONL produced by ``judgment_sft_prepare``.

**Frozen prompts:** each row must contain final ``system`` / ``user_text`` strings and
``image_rel_paths`` written at prepare time. This module never imports ``build_step_prompt``.
It only uses ``labos_api.storage.media_paths.resolve_data_path`` to resolve frame paths safely.

We use HuggingFace ``Trainer`` (not TRL ``SFTTrainer``) because the custom collator builds
Qwen-family VLM ``apply_chat_template`` + processor inputs from frozen text and multi-frame PIL
lists. TRL's VLM ``SFTTrainer`` path should be revisited if we standardize on a messages+
``images`` column batch path; until then, control truncation explicitly (``--max-length`` or
``0`` to disable) to avoid silently eating image tokens.

Evaluation against TASK-0008 / TASK-0010 stays out of this script by design.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Dict, List, Optional


from openlabos_training.judgment_runtime import MediaPathError, resolve_data_path


def _require(pkg: str) -> None:
    try:
        __import__(pkg)
    except Exception as e:  # pragma: no cover
        raise SystemExit(
            f"Missing dependency '{pkg}'.\n"
            "From services/training run:\n"
            "  uv sync --python 3.12\n"
            "  uv sync --python 3.12 --extra gpu\n",
        ) from e


def _package_versions() -> dict[str, str]:
    import importlib.metadata as m

    out: dict[str, str] = {}
    for pkg in ("transformers", "peft", "trl", "accelerate", "bitsandbytes", "torch", "datasets"):
        try:
            out[pkg] = m.version(pkg)
        except Exception:
            out[pkg] = "not-installed"
    return out


def _git_commit(start: Path) -> str | None:
    p = start.resolve()
    for d in [p, *p.parents]:
        if (d / ".git").is_dir():
            try:
                r = subprocess.run(
                    ["git", "-C", str(d), "rev-parse", "HEAD"],
                    capture_output=True,
                    text=True,
                    timeout=8,
                    check=False,
                )
                if r.returncode == 0:
                    return r.stdout.strip()
            except (OSError, subprocess.SubprocessError):
                return None
    return None


def _log(message: str) -> None:
    ts = datetime.now(UTC).replace(microsecond=0).isoformat()
    print(f"[{ts}] {message}", file=sys.stderr, flush=True)


def _peek_validate_prepared_jsonl(path: Path) -> None:
    if not path.exists():
        raise SystemExit(f"ERROR: file not found: {path}")
    with path.open("r", encoding="utf-8-sig") as f:
        for line in f:
            raw = line.strip()
            if not raw:
                continue
            try:
                obj = json.loads(raw)
            except json.JSONDecodeError as e:
                raise SystemExit(f"ERROR: {path} first row is not valid JSON: {e}") from e
            if not isinstance(obj, dict):
                raise SystemExit(f"ERROR: {path} first row must be a JSON object")
            for k in ("user_text", "image_rel_paths", "target_json"):
                if k not in obj:
                    raise SystemExit(f"ERROR: {path} first row missing required key {k!r}")
            if not isinstance(obj["image_rel_paths"], list) or not obj["image_rel_paths"]:
                raise SystemExit(f"ERROR: {path} first row image_rel_paths must be a non-empty list")
            if not isinstance(obj["target_json"], dict):
                raise SystemExit(f"ERROR: {path} first row target_json must be an object")
            if "system" not in obj:
                raise SystemExit(f"ERROR: {path} first row missing required key 'system'")
            return
    raise SystemExit(f"ERROR: {path} is empty")


def _load_prepared_rows(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8-sig") as f:
        for i, line in enumerate(f, start=1):
            line = line.strip()
            if not line:
                continue
            try:
                r = json.loads(line)
            except json.JSONDecodeError as e:
                raise SystemExit(f"ERROR: {path} line {i} invalid JSON: {e}") from e
            if not isinstance(r, dict):
                raise SystemExit(f"ERROR: {path} line {i} must be an object")
            for k in ("system", "user_text", "image_rel_paths", "target_json"):
                if k not in r:
                    raise SystemExit(f"ERROR: {path} line {i} missing {k!r}")
            if not isinstance(r["image_rel_paths"], list) or not r["image_rel_paths"]:
                raise SystemExit(f"ERROR: {path} line {i} image_rel_paths must be a non-empty list")
            if not isinstance(r["target_json"], dict):
                raise SystemExit(f"ERROR: {path} line {i} target_json must be an object")
            rows.append(r)
    return rows


def main(argv: Optional[List[str]] = None) -> int:
    from openlabos_training.vlm_model import DEFAULT_VLM_MODEL_ID, load_vlm_for_generation

    p = argparse.ArgumentParser(description="LoRA SFT for LabOS judgment JSONL (multi-frame, Qwen-family VLM).")
    p.add_argument("--train", required=True, help="Path to sft_train.jsonl from prepare-judgment-sft.")
    p.add_argument("--val", default="", help="Optional sft_val.jsonl for periodic eval loss.")
    p.add_argument("--data-root", required=True, help="Repo data root (same as LABOS_DATA_ROOT / API).")
    p.add_argument("--model", default=DEFAULT_VLM_MODEL_ID, help="HF hub base model id.")
    p.add_argument(
        "--output",
        required=True,
        help="Run output directory (e.g. services/training/outputs/<run_name>/)",
    )
    p.add_argument("--epochs", type=float, default=1.0)
    p.add_argument("--max-steps", type=int, default=0, help="If >0, overrides epochs.")
    p.add_argument("--lr", type=float, default=1e-4)
    p.add_argument("--weight-decay", type=float, default=0.0)
    p.add_argument("--warmup-ratio", type=float, default=0.03)
    p.add_argument(
        "--batch-size",
        type=int,
        default=1,
        help="Must stay 1 with the current multi-frame collator (implementation constraint, not a law of nature).",
    )
    p.add_argument("--grad-accum", type=int, default=4)
    p.add_argument(
        "--max-length",
        type=int,
        default=4096,
        help="Processor max length when truncating (default 4096). Use 0 to disable truncation (safer for VL "
        "image tokens; uses more memory).",
    )
    p.add_argument("--seed", type=int, default=1337)
    p.add_argument("--log-steps", type=int, default=5)
    p.add_argument("--save-steps", type=int, default=50)
    p.add_argument("--lora-r", type=int, default=8)
    p.add_argument("--lora-alpha", type=int, default=16)
    p.add_argument("--lora-dropout", type=float, default=0.05)
    p.add_argument(
        "--use-4bit",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="4-bit load (default: on). Fallback: --no-use-4bit then fp16; if VRAM still insufficient use a larger GPU or AWS.",
    )
    p.add_argument(
        "--bf16",
        action="store_true",
        help="Use bf16 compute where supported (Ampere+ often OK). If unstable, omit for fp16.",
    )
    p.add_argument(
        "--shuffle-train",
        action="store_true",
        help="Shuffle training rows (default: preserve prepared JSONL order for reproducibility).",
    )
    args = p.parse_args(argv)
    _log("train-judgment-sft starting")

    if int(args.batch_size) != 1:
        print(
            "ERROR: --batch-size must be 1 for the current judgment multi-frame collator.",
            file=sys.stderr,
        )
        return 2

    # Windows: importing ``torch`` (CUDA) before ``pyarrow`` (via ``datasets``) can AV in native DLLs.
    # Pull ``datasets`` first so Arrow initializes before CUDA runtime wiring.
    _log("checking datasets/torch dependencies")
    _require("datasets")
    _require("torch")
    import torch

    if not torch.cuda.is_available():
        print(
            "ERROR: CUDA is not available. Judgment SFT for the LabOS VLM target expects a GPU.\n"
            "Fallback: run the same command on a GPU host or cloud instance with this repo + data.",
            file=sys.stderr,
        )
        return 2
    _log(
        "CUDA available: "
        f"torch={getattr(torch, '__version__', 'unknown')} "
        f"cuda={getattr(torch.version, 'cuda', None)} "
        f"device={torch.cuda.get_device_name(0)}",
    )

    train_path = Path(args.train).resolve()
    out_dir = Path(args.output).resolve()
    data_root = Path(args.data_root).resolve()

    if not data_root.is_dir():
        print(f"ERROR: data-root is not a directory: {data_root}", file=sys.stderr)
        return 2

    try:
        out_dir.mkdir(parents=True, exist_ok=True)
    except OSError as e:
        print(f"ERROR: cannot create output directory {out_dir}: {e}", file=sys.stderr)
        return 2

    _peek_validate_prepared_jsonl(train_path)
    _log(f"validated train JSONL: {train_path}")
    val_path: Path | None = None
    if (args.val or "").strip():
        val_path = Path(args.val).resolve()
        if not val_path.is_file():
            print(f"ERROR: --val file not found: {val_path}", file=sys.stderr)
            return 2
        _peek_validate_prepared_jsonl(val_path)

    # NOTE: The original implementation also required the `labos_api` package here.
    # In OpenLabOS that cross-import has been replaced with a local stub (see top of file);
    # the dependency is therefore not enforced at runtime until the port is finished.
    for pkg in ("transformers", "peft", "accelerate", "PIL"):
        _log(f"checking dependency: {pkg}")
        _require(pkg)
    _log("checked transformers/peft/accelerate/PIL dependencies")

    import random
    _log("importing PIL.Image")
    from PIL import Image

    _log("importing Dataset / peft / transformers training classes")
    from datasets import Dataset
    from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
    from transformers import AutoProcessor, BitsAndBytesConfig, Trainer, TrainingArguments
    _log("training classes imported")

    train_rows = _load_prepared_rows(train_path)
    if not train_rows:
        print(f"ERROR: no rows in {train_path}", file=sys.stderr)
        return 2

    val_rows = _load_prepared_rows(val_path) if val_path else []
    _log(f"loaded prepared rows: train={len(train_rows)} val={len(val_rows)}")

    if len(train_rows) < 8:
        print(
            f"WARNING: only {len(train_rows)} training rows — this validates the pipeline, not meaningful "
            "model improvement; do not over-claim results.",
            file=sys.stderr,
        )

    if args.shuffle_train:
        random.seed(args.seed)
        random.shuffle(train_rows)

    try:
        _log(f"loading processor: {args.model}")
        processor = AutoProcessor.from_pretrained(args.model, trust_remote_code=True)
    except Exception as e:
        print(
            f"ERROR: cannot load processor for model {args.model!r} (wrong name or transformers too old?): {e}",
            file=sys.stderr,
        )
        return 2
    tok = processor.tokenizer
    _log("processor loaded")

    quant_config = None
    if args.use_4bit:
        _require("bitsandbytes")
        _log("using 4-bit quantization config")
        quant_config = BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_quant_type="nf4",
            bnb_4bit_use_double_quant=True,
            bnb_4bit_compute_dtype=torch.bfloat16 if args.bf16 else torch.float16,
        )

    try:
        _log(f"loading base VLM: {args.model}")
        model = load_vlm_for_generation(
            args.model,
            trust_remote_code=True,
            torch_dtype=torch.bfloat16 if args.bf16 else None,
            quantization_config=quant_config,
            device_map="auto",
        )
    except Exception as e:
        print(
            f"ERROR: failed to load model {args.model!r} (OOM, stale Transformers, or unsupported model class): {e}",
            file=sys.stderr,
        )
        return 2
    _log("base VLM loaded")

    if args.use_4bit:
        _log("preparing model for k-bit training")
        model = prepare_model_for_kbit_training(model)

    _log(f"attaching LoRA: r={args.lora_r} alpha={args.lora_alpha}")
    lora = LoraConfig(
        r=int(args.lora_r),
        lora_alpha=int(args.lora_alpha),
        lora_dropout=float(args.lora_dropout),
        bias="none",
        task_type="CAUSAL_LM",
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
    )
    model = get_peft_model(model, lora)
    _log("LoRA model ready")

    max_len_arg = int(args.max_length)
    max_frames = int(os.environ.get("LABOS_JUDGMENT_MAX_FRAMES", "8"))

    def _resolve_images(rel_paths: list[str]) -> list[Image.Image]:
        images: list[Image.Image] = []
        for rel in rel_paths:
            try:
                abs_p = resolve_data_path(data_root, rel)
            except MediaPathError as e:
                raise SystemExit(f"Bad frame path {rel!r}: {e}") from e
            if not abs_p.is_file():
                raise SystemExit(f"Frame file missing: {abs_p}")
            images.append(Image.open(abs_p).convert("RGB"))
        return images

    def _make_texts(system: str, user_text: str, images: list[Image.Image], target: dict[str, Any]) -> tuple[str, str]:
        """Assistant target = strict JSON string (same shape inference expects after parsing)."""
        target_text = json.dumps(target, ensure_ascii=False)
        user_content: list[dict[str, Any]] = [{"type": "text", "text": user_text}]
        user_content.extend({"type": "image"} for _ in images)

        user_msgs: list[dict[str, Any]] = []
        if system.strip():
            user_msgs.append({"role": "system", "content": [{"type": "text", "text": system}]})
        user_msgs.append({"role": "user", "content": user_content})

        full_msgs = user_msgs + [{"role": "assistant", "content": [{"type": "text", "text": target_text}]}]

        prompt_text = processor.apply_chat_template(user_msgs, tokenize=False, add_generation_prompt=True)
        full_text = processor.apply_chat_template(full_msgs, tokenize=False, add_generation_prompt=False)
        return prompt_text, full_text

    class DataCollator:
        def __init__(self) -> None:
            self.processor = processor
            self.tok = tok
            self.max_length = max_len_arg

        def __call__(self, features: List[Dict[str, Any]]) -> Dict[str, Any]:
            if len(features) != 1:
                raise ValueError(
                    "Judgment SFT collator requires per_device_train_batch_size=1 (multi-frame clips).",
                )
            f = features[0]
            imgs = _resolve_images(f["image_rel_paths"])
            ptxt, ftxt = _make_texts(str(f["system"]), str(f["user_text"]), imgs, f["target_json"])

            proc_kw: dict[str, Any] = {
                "text": [ftxt],
                "images": imgs,
                "return_tensors": "pt",
                "padding": True,
            }
            if self.max_length and self.max_length > 0:
                proc_kw["truncation"] = True
                proc_kw["max_length"] = self.max_length
            else:
                proc_kw["truncation"] = False

            enc = self.processor(**proc_kw)

            labels = enc["input_ids"].clone()
            p_ids = self.tok(ptxt, add_special_tokens=False).input_ids
            prompt_len = min(len(p_ids), labels.shape[1])
            labels[0, :prompt_len] = -100
            enc["labels"] = labels
            return enc

    collator = DataCollator()
    os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")

    versions = _package_versions()
    manifest = {
        "created_at": datetime.now(UTC).replace(microsecond=0).isoformat(),
        "task": "judgment_lora_sft",
        "argv": list(sys.argv),
        "trainer": {
            "library": "transformers.Trainer",
            "note": (
                "TRL SFTTrainer supports VLM columns and often recommends max_length=None; we keep "
                "transformers Trainer with an explicit collator until we validate TRL+Qwen-family multi-image batches."
            ),
        },
        "base_model_id": args.model,
        "processor_id": args.model,
        "git_commit": _git_commit(train_path) or _git_commit(out_dir) or _git_commit(Path.cwd()),
        "package_versions": versions,
        "train_jsonl": str(train_path),
        "val_jsonl": str(val_path) if val_path else None,
        "data_root": str(data_root),
        "output_dir": str(out_dir),
        "max_frames_env": max_frames,
        "hyperparameters": {
            "epochs": float(args.epochs),
            "max_steps": int(args.max_steps),
            "lr": float(args.lr),
            "weight_decay": float(args.weight_decay),
            "warmup_ratio": float(args.warmup_ratio),
            "per_device_train_batch_size": int(args.batch_size),
            "gradient_accumulation_steps": int(args.grad_accum),
            "max_length": int(args.max_length),
            "shuffle_train": bool(args.shuffle_train),
            "seed": int(args.seed),
            "lora_r": int(args.lora_r),
            "lora_alpha": int(args.lora_alpha),
            "lora_dropout": float(args.lora_dropout),
            "use_4bit": bool(args.use_4bit),
            "bf16": bool(args.bf16),
            "fp16_fallback": (not bool(args.bf16)) and torch.cuda.is_available(),
        },
        "prepared_row_contract": (
            "Training reads only frozen fields from JSONL: system, user_text, image_rel_paths, target_json "
            "(plus optional audit ids). It does not call build_step_prompt."
        ),
        "target_serialization": (
            "Assistant turn is a single text block containing strict JSON from json.dumps(target_json), "
            "matching JudgmentResult / API inference expectations."
        ),
        "confidence_convention": (
            "Gold rows use confidence=1.0 in target_json as an SFT label convention, not a calibrated human score."
        ),
        "notes": (
            "Quantization fallback: if 4-bit stack fails, retry with --no-use-4bit. "
            "Precision: prefer omitting --bf16 if bf16 misbehaves on your stack (fp16 is used when bf16 is off). "
            "VRAM: if local GPU is insufficient, use a larger GPU or run the same artifacts on AWS. "
            "Compare adapters to baseline via TASK-0008 and TASK-0010 after inference wiring exists."
        ),
    }
    (out_dir / "run-manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    _log(f"wrote run manifest: {out_dir / 'run-manifest.json'}")

    train_ds = Dataset.from_list(train_rows)
    eval_ds = Dataset.from_list(val_rows) if val_rows else None

    args_train = TrainingArguments(
        output_dir=str(out_dir),
        learning_rate=float(args.lr),
        weight_decay=float(args.weight_decay),
        warmup_ratio=float(args.warmup_ratio),
        num_train_epochs=float(args.epochs) if args.max_steps <= 0 else 1.0,
        max_steps=int(args.max_steps) if args.max_steps > 0 else -1,
        per_device_train_batch_size=int(args.batch_size),
        per_device_eval_batch_size=int(args.batch_size),
        gradient_accumulation_steps=int(args.grad_accum),
        logging_steps=int(args.log_steps),
        save_steps=int(args.save_steps),
        save_total_limit=2,
        eval_strategy="steps" if eval_ds is not None else "no",
        eval_steps=int(args.save_steps) if eval_ds is not None else None,
        report_to=[],
        remove_unused_columns=False,
        bf16=bool(args.bf16),
        fp16=bool((not args.bf16) and torch.cuda.is_available()),
        seed=int(args.seed),
    )

    trainer = Trainer(
        model=model,
        args=args_train,
        train_dataset=train_ds,
        eval_dataset=eval_ds,
        data_collator=collator,
    )

    try:
        _log("trainer.train starting")
        trainer.train()
    except RuntimeError as e:
        if "out of memory" in str(e).lower() or "cuda" in str(e).lower():
            print(
                f"ERROR: training failed ({e}). Try --max-length 0, fewer frames (re-prepare with lower "
                "LABOS_JUDGMENT_MAX_FRAMES), --no-use-4bit, or a larger GPU / AWS.",
                file=sys.stderr,
            )
            return 2
        raise

    _log("trainer.train complete; saving adapter")
    model.save_pretrained(str(out_dir))
    processor.save_pretrained(str(out_dir))
    print("Judgment SFT complete.")
    print(f"- train rows: {len(train_rows)}  val rows: {len(val_rows)}")
    print(f"- output:     {out_dir}")
    print(f"- manifest:   {out_dir / 'run-manifest.json'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
