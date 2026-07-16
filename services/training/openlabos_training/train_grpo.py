"""
Group-relative policy optimization for the LabOS judgment task.

This is a direct training entrypoint that samples multiple candidate judgments
per prompt, scores them against the frozen target JSON, and updates the LoRA
policy with group-relative advantages.

The implementation is intentionally self-contained:
- it reuses the prepared SFT JSONL contract
- it uses the same multimodal prompt + image path policy as SFT
- it uses a deterministic reward function aligned with the LabOS judgment fields

This does not depend on TRL at runtime. The repo environment did not have TRL
installed, so the GRPO loop is implemented locally with transformers + PEFT.
"""

from __future__ import annotations

import argparse
import json
import math
import random
import subprocess
import sys
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Optional


# TODO(openlabos): replace with safe path-join helper that prevents traversal under data_root
# was: from labos_api.storage.media_paths import MediaPathError, resolve_data_path
class MediaPathError(RuntimeError):
    """Stub for labos_api.storage.media_paths.MediaPathError."""


def resolve_data_path(data_root: Path, rel: str) -> Path:  # pragma: no cover - stub
    raise NotImplementedError(
        "TODO(openlabos): port resolve_data_path (safe join under data_root); "
        "was labos_api.storage.media_paths.resolve_data_path",
    )


# TODO(openlabos): replace with strict JSON judgment parser/validator/normalizer
# was: from labos_api.services.judgment_parsing import JudgmentParseError, normalize_judgment_dict, parse_strict_json, validate_judgment
class JudgmentParseError(RuntimeError):
    """Stub for labos_api.services.judgment_parsing.JudgmentParseError."""


def parse_strict_json(text: str) -> dict[str, Any]:  # pragma: no cover - stub
    raise NotImplementedError(
        "TODO(openlabos): port parse_strict_json; "
        "was labos_api.services.judgment_parsing.parse_strict_json",
    )


def normalize_judgment_dict(parsed: dict[str, Any]) -> dict[str, Any]:  # pragma: no cover - stub
    raise NotImplementedError(
        "TODO(openlabos): port normalize_judgment_dict; "
        "was labos_api.services.judgment_parsing.normalize_judgment_dict",
    )


def validate_judgment(parsed: dict[str, Any]) -> Any:  # pragma: no cover - stub
    raise NotImplementedError(
        "TODO(openlabos): port validate_judgment; "
        "was labos_api.services.judgment_parsing.validate_judgment",
    )


REWARD_WEIGHTS = {
    "schema_valid": 0.20,
    "step_id": 0.15,
    "step_complete": 0.25,
    "action_detected": 0.15,
    "possible_issue": 0.10,
    "objects_f1": 0.15,
}


@dataclass(frozen=True)
class RewardBreakdown:
    score: float
    components: dict[str, float]
    raw_text: str
    parsed: dict[str, Any] | None
    parse_error: str | None = None


def _require(pkg: str) -> None:
    try:
        __import__(pkg)
    except Exception as e:  # pragma: no cover
        raise SystemExit(
            f"Missing dependency '{pkg}'.\n"
            "GRPO in LabOS currently expects a CUDA-capable PyTorch + transformers stack.",
        ) from e


def _package_versions() -> dict[str, str]:
    import importlib.metadata as m

    out: dict[str, str] = {}
    for pkg in ("transformers", "peft", "accelerate", "bitsandbytes", "torch", "datasets"):
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


def _load_jsonl_rows(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        raise SystemExit(f"ERROR: file not found: {path}")

    rows: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8-sig") as f:
        for i, line in enumerate(f, start=1):
            raw = line.strip()
            if not raw:
                continue
            try:
                obj = json.loads(raw)
            except json.JSONDecodeError as e:
                raise SystemExit(f"ERROR: {path} line {i} invalid JSON: {e}") from e
            if not isinstance(obj, dict):
                raise SystemExit(f"ERROR: {path} line {i} must be an object")
            for key in ("system", "user_text", "image_rel_paths", "target_json"):
                if key not in obj:
                    raise SystemExit(f"ERROR: {path} line {i} missing {key!r}")
            if not isinstance(obj["image_rel_paths"], list) or not obj["image_rel_paths"]:
                raise SystemExit(f"ERROR: {path} line {i} image_rel_paths must be a non-empty list")
            if not isinstance(obj["target_json"], dict):
                raise SystemExit(f"ERROR: {path} line {i} target_json must be an object")
            rows.append(obj)
    if not rows:
        raise SystemExit(f"ERROR: {path} is empty")
    return rows


def _peek_validate_prepared_jsonl(path: Path) -> None:
    if not path.exists():
        raise SystemExit(f"ERROR: file not found: {path}")
    with path.open("r", encoding="utf-8-sig") as f:
        for line in f:
            raw = line.strip()
            if not raw:
                continue
            obj = json.loads(raw)
            if not isinstance(obj, dict):
                raise SystemExit(f"ERROR: {path} first row must be a JSON object")
            for k in ("system", "user_text", "image_rel_paths", "target_json"):
                if k not in obj:
                    raise SystemExit(f"ERROR: {path} first row missing required key {k!r}")
            return
    raise SystemExit(f"ERROR: {path} is empty")


def _resolve_images(rel_paths: list[str], *, data_root: Path):
    from PIL import Image

    images = []
    for rel in rel_paths:
        try:
            abs_p = resolve_data_path(data_root, rel)
        except MediaPathError as e:
            raise SystemExit(f"Bad frame path {rel!r}: {e}") from e
        if not abs_p.is_file():
            raise SystemExit(f"Frame file missing: {abs_p}")
        images.append(Image.open(abs_p).convert("RGB"))
    return images


def _move_batch_to_device(batch: dict[str, Any], device: Any) -> dict[str, Any]:
    moved: dict[str, Any] = {}
    for key, value in batch.items():
        if hasattr(value, "to"):
            moved[key] = value.to(device)
        else:
            moved[key] = value
    return moved


def _build_prompt_text(*, processor, system: str, user_text: str, image_count: int) -> str:
    user_content: list[dict[str, Any]] = [{"type": "text", "text": user_text}]
    user_content.extend({"type": "image"} for _ in range(image_count))

    messages: list[dict[str, Any]] = []
    if system.strip():
        messages.append({"role": "system", "content": [{"type": "text", "text": system}]})
    messages.append({"role": "user", "content": user_content})
    return processor.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)


def _build_model_inputs(*, processor, prompt_text: str, images: list[Any], max_length: int) -> dict[str, Any]:
    proc_kw: dict[str, Any] = {
        "text": [prompt_text],
        "images": images,
        "return_tensors": "pt",
        "padding": True,
    }
    if max_length > 0:
        proc_kw["truncation"] = True
        proc_kw["max_length"] = max_length
    else:
        proc_kw["truncation"] = False
    return processor(**proc_kw)


def _first_completion_end(token_ids: list[int], eos_token_id: int | None) -> int:
    if eos_token_id is None:
        return len(token_ids)
    for i, token in enumerate(token_ids):
        if int(token) == int(eos_token_id):
            return i + 1
    return len(token_ids)


def _safe_f1(gold: set[str], pred: set[str]) -> float:
    tp = len(gold & pred)
    fp = len(pred - gold)
    fn = len(gold - pred)
    precision = tp / (tp + fp) if (tp + fp) else (1.0 if not pred else 0.0)
    recall = tp / (tp + fn) if (tp + fn) else (1.0 if not gold else 0.0)
    return (2 * precision * recall / (precision + recall)) if (precision + recall) else 0.0


def _as_str_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(x) for x in value if x is not None]


def score_candidate_text(text: str, *, target_step_id: str, target_json: dict[str, Any]) -> RewardBreakdown:
    zero = {key: 0.0 for key in REWARD_WEIGHTS}
    try:
        parsed = parse_strict_json(text)
    except JudgmentParseError as e:
        return RewardBreakdown(score=0.0, components=zero, raw_text=text, parsed=None, parse_error=str(e))

    normalized = normalize_judgment_dict(parsed)
    schema_valid = 1.0
    try:
        validate_judgment(parsed)
    except JudgmentParseError:
        schema_valid = 0.0

    target_objects = set(_as_str_list(target_json.get("objects_seen")))
    pred_objects = set(_as_str_list(normalized.get("objects_seen")))
    components = {
        "schema_valid": schema_valid,
        "step_id": 1.0 if str(normalized.get("step_id") or "") == str(target_step_id) else 0.0,
        "step_complete": 1.0 if bool(normalized.get("step_complete") is True) == bool(target_json.get("step_complete") is True) else 0.0,
        "action_detected": 1.0 if normalized.get("action_detected") == target_json.get("action_detected") else 0.0,
        "possible_issue": 1.0 if normalized.get("possible_issue") == target_json.get("possible_issue") else 0.0,
        "objects_f1": round(_safe_f1(target_objects, pred_objects), 4),
    }
    score = sum(REWARD_WEIGHTS[key] * float(value) for key, value in components.items())
    return RewardBreakdown(score=round(score, 4), components=components, raw_text=text, parsed=normalized)


def compute_group_advantages(rewards: list[float]) -> list[float]:
    if not rewards:
        return []
    mean = sum(rewards) / len(rewards)
    if len(rewards) == 1:
        return [0.0]
    variance = sum((r - mean) ** 2 for r in rewards) / len(rewards)
    std = math.sqrt(variance)
    if std <= 1e-8:
        return [0.0 for _ in rewards]
    return [max(-2.0, min(2.0, (r - mean) / (std + 1e-8))) for r in rewards]


def compute_grpo_policy_loss(
    seq_mean_logprobs: list[Any],
    *,
    rewards: list[float],
    ref_mean_logprobs: list[Any] | None = None,
    kl_beta: float = 0.0,
) -> tuple[Any, list[float]]:
    if len(seq_mean_logprobs) != len(rewards):
        raise ValueError("seq_mean_logprobs and rewards must have the same length")
    if ref_mean_logprobs is not None and len(ref_mean_logprobs) != len(seq_mean_logprobs):
        raise ValueError("ref_mean_logprobs must match seq_mean_logprobs length")

    advantages = compute_group_advantages(rewards)
    policy_losses = []
    for i, seq_mean_logprob in enumerate(seq_mean_logprobs):
        loss = -(advantages[i] * seq_mean_logprob)
        if ref_mean_logprobs is not None and kl_beta > 0.0:
            loss = loss + kl_beta * (seq_mean_logprob - ref_mean_logprobs[i])
        policy_losses.append(loss)

    import torch

    return torch.stack(policy_losses).mean(), advantages


def _build_reward_summary(target_json: dict[str, Any], pred_breakdown: RewardBreakdown) -> dict[str, Any]:
    return {
        "score": pred_breakdown.score,
        "components": pred_breakdown.components,
        "target_step_id": str(target_json.get("step_id") or ""),
        "pred_text": pred_breakdown.raw_text,
        "parse_error": pred_breakdown.parse_error,
    }


def _load_model(
    model_id: str,
    *,
    use_4bit: bool,
    bf16: bool,
    device_map: str | dict[str, Any] | None,
):
    from transformers import BitsAndBytesConfig

    from openlabos_training.vlm_model import load_vlm_for_generation

    quant_config = None
    if use_4bit:
        _require("bitsandbytes")
        import torch

        quant_config = BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_quant_type="nf4",
            bnb_4bit_use_double_quant=True,
            bnb_4bit_compute_dtype=torch.bfloat16 if bf16 else torch.float16,
        )
    return load_vlm_for_generation(
        model_id,
        trust_remote_code=True,
        torch_dtype=None,
        quantization_config=quant_config,
        device_map=device_map,
    )


def _apply_lora(model, *, lora_r: int, lora_alpha: int, lora_dropout: float):
    from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training

    if hasattr(model, "is_loaded_in_4bit") and bool(getattr(model, "is_loaded_in_4bit")):
        model = prepare_model_for_kbit_training(model)

    lora = LoraConfig(
        r=int(lora_r),
        lora_alpha=int(lora_alpha),
        lora_dropout=float(lora_dropout),
        bias="none",
        task_type="CAUSAL_LM",
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
    )
    return get_peft_model(model, lora)


def _save_model_bundle(model, processor, out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    model.save_pretrained(str(out_dir))
    processor.save_pretrained(str(out_dir))


def _evaluate_policy(
    *,
    rows: list[dict[str, Any]],
    model,
    processor,
    tokenizer,
    data_root: Path,
    max_length: int,
    max_new_tokens: int,
    temperature: float,
    top_p: float,
    num_generations: int,
    device: Any,
    bf16: bool,
) -> dict[str, Any]:
    import torch

    model.eval()
    totals = {
        "reward": [],
        "schema_valid": [],
        "step_id": [],
        "step_complete": [],
        "action_detected": [],
        "possible_issue": [],
        "objects_f1": [],
    }
    all_rows: list[dict[str, Any]] = []
    amp_dtype = torch.bfloat16 if bf16 else torch.float16
    for row in rows:
        images = _resolve_images([str(x) for x in row["image_rel_paths"]], data_root=data_root)
        prompt_text = _build_prompt_text(
            processor=processor,
            system=str(row["system"]),
            user_text=str(row["user_text"]),
            image_count=len(images),
        )
        inputs = _build_model_inputs(processor=processor, prompt_text=prompt_text, images=images, max_length=max_length)
        inputs = _move_batch_to_device(inputs, device)
        eos_id = tokenizer.eos_token_id if tokenizer.eos_token_id is not None else tokenizer.pad_token_id
        gen_kw: dict[str, Any] = {
            "max_new_tokens": max_new_tokens,
            "do_sample": False,
            "num_return_sequences": 1,
            "pad_token_id": tokenizer.pad_token_id,
            "eos_token_id": eos_id,
        }
        with torch.no_grad():
            with torch.autocast(device_type="cuda", dtype=amp_dtype, enabled=torch.cuda.is_available()):
                generated = model.generate(**inputs, **gen_kw)
        seq = generated[0].tolist()
        prompt_len = int(inputs["input_ids"].shape[1])
        completion_ids = seq[prompt_len:]
        end = _first_completion_end(completion_ids, eos_id)
        completion_text = tokenizer.decode(completion_ids[:end], skip_special_tokens=True)
        reward = score_candidate_text(
            completion_text,
            target_step_id=str(row["target_json"].get("step_id") or row["step_id"]),
            target_json=dict(row["target_json"]),
        )
        totals["reward"].append(reward.score)
        for key in ("schema_valid", "step_id", "step_complete", "action_detected", "possible_issue", "objects_f1"):
            totals[key].append(reward.components[key])
        all_rows.append(
            {
                "clip_id": row.get("clip_id"),
                "step_id": row.get("step_id"),
                "reward": _build_reward_summary(row["target_json"], reward),
            }
        )

    def _mean(values: list[float]) -> float:
        return round(sum(values) / len(values), 4) if values else 0.0

    return {
        "row_count": len(rows),
        "mean_reward": _mean(totals["reward"]),
        "component_means": {k: _mean(v) for k, v in totals.items() if k != "reward"},
        "rows": all_rows,
    }


def main(argv: Optional[list[str]] = None) -> int:
    from openlabos_training.vlm_model import DEFAULT_VLM_MODEL_ID

    p = argparse.ArgumentParser(description="GRPO training entrypoint for the LabOS judgment task.")
    p.add_argument("--train", required=True, help="Prepared SFT JSONL from prepare-judgment-sft.")
    p.add_argument("--val", default="", help="Optional prepared validation JSONL.")
    p.add_argument("--data-root", required=True, help="Repo data root (same as LABOS_DATA_ROOT / API).")
    p.add_argument("--model", default=DEFAULT_VLM_MODEL_ID, help="HF hub base model id.")
    p.add_argument("--output", required=True, help="Run output directory.")
    p.add_argument("--epochs", type=float, default=1.0)
    p.add_argument("--max-steps", type=int, default=0, help="If >0, overrides epochs.")
    p.add_argument("--lr", type=float, default=5e-6)
    p.add_argument("--weight-decay", type=float, default=0.0)
    p.add_argument("--warmup-ratio", type=float, default=0.03)
    p.add_argument("--batch-size", type=int, default=1, help="Must stay 1 for the current single-example GRPO loop.")
    p.add_argument("--grad-accum", type=int, default=1)
    p.add_argument("--max-length", type=int, default=0, help="0 disables truncation (safer for VL image tokens).")
    p.add_argument("--seed", type=int, default=1337)
    p.add_argument("--log-steps", type=int, default=1)
    p.add_argument("--save-steps", type=int, default=25)
    p.add_argument("--num-generations", type=int, default=4, help="Candidate completions sampled per prompt.")
    p.add_argument("--temperature", type=float, default=0.7)
    p.add_argument("--top-p", type=float, default=0.95)
    p.add_argument("--max-new-tokens", type=int, default=256)
    p.add_argument("--kl-beta", type=float, default=0.0, help="Optional KL regularization against a frozen reference model.")
    p.add_argument("--lora-r", type=int, default=8)
    p.add_argument("--lora-alpha", type=int, default=16)
    p.add_argument("--lora-dropout", type=float, default=0.05)
    p.add_argument("--use-4bit", action=argparse.BooleanOptionalAction, default=True)
    p.add_argument("--bf16", action="store_true")
    p.add_argument("--shuffle-train", action="store_true")
    args = p.parse_args(argv)

    _log("train-grpo starting")
    if int(args.batch_size) != 1:
        print("ERROR: --batch-size must be 1 for the current GRPO loop.", file=sys.stderr)
        return 2
    if int(args.num_generations) < 2:
        print("ERROR: --num-generations must be at least 2 to form a group-relative reward.", file=sys.stderr)
        return 2
    if float(args.temperature) <= 0.0:
        print("ERROR: --temperature must be > 0 for sampled GRPO generations.", file=sys.stderr)
        return 2

    _require("datasets")
    _require("torch")
    _require("transformers")
    _require("peft")
    _require("PIL")
    import torch

    if not torch.cuda.is_available():
        print(
            "ERROR: CUDA is not available. GRPO for the LabOS VLM target expects a GPU.",
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
    train_rows = _load_jsonl_rows(train_path)
    val_rows = _load_jsonl_rows(Path(args.val).resolve()) if (args.val or "").strip() else []
    if val_rows:
        _peek_validate_prepared_jsonl(Path(args.val).resolve())
    _log(f"loaded rows: train={len(train_rows)} val={len(val_rows)}")

    if len(train_rows) < 8:
        print(
            f"WARNING: only {len(train_rows)} training rows - this validates the plumbing, not the final claim.",
            file=sys.stderr,
        )

    if args.shuffle_train:
        random.seed(args.seed)
        random.shuffle(train_rows)

    from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
    from transformers import AutoProcessor, get_linear_schedule_with_warmup

    from openlabos_training.vlm_model import load_vlm_for_generation

    quant_config = None
    if args.use_4bit:
        _require("bitsandbytes")
        from transformers import BitsAndBytesConfig

        quant_config = BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_quant_type="nf4",
            bnb_4bit_use_double_quant=True,
            bnb_4bit_compute_dtype=torch.bfloat16 if args.bf16 else torch.float16,
        )

    _log(f"loading processor: {args.model}")
    processor = AutoProcessor.from_pretrained(args.model, trust_remote_code=True)
    tokenizer = processor.tokenizer
    if tokenizer.pad_token_id is None:
        tokenizer.pad_token = tokenizer.eos_token
    device = torch.device("cuda:0")

    _log(f"loading base model: {args.model}")
    model = load_vlm_for_generation(
        args.model,
        trust_remote_code=True,
        torch_dtype=None,
        quantization_config=quant_config,
        device_map="auto",
    )
    if args.use_4bit:
        model = prepare_model_for_kbit_training(model)
    model = get_peft_model(
        model,
        LoraConfig(
            r=int(args.lora_r),
            lora_alpha=int(args.lora_alpha),
            lora_dropout=float(args.lora_dropout),
            bias="none",
            task_type="CAUSAL_LM",
            target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
        ),
    )
    model.train()
    if hasattr(model, "gradient_checkpointing_enable"):
        try:
            model.gradient_checkpointing_enable()
        except Exception:
            pass
    if hasattr(model, "config"):
        try:
            model.config.use_cache = False
        except Exception:
            pass

    ref_model = None
    if float(args.kl_beta) > 0.0:
        _log("loading frozen reference model for KL regularization")
        ref_model = load_vlm_for_generation(
            args.model,
            trust_remote_code=True,
            torch_dtype=None,
            quantization_config=quant_config,
            device_map="auto",
        )
        ref_model.eval()
        for p in ref_model.parameters():
            p.requires_grad_(False)
        if hasattr(ref_model, "config"):
            try:
                ref_model.config.use_cache = False
            except Exception:
                pass

    trainable_params = [p for p in model.parameters() if p.requires_grad]
    if not trainable_params:
        print("ERROR: no trainable parameters found after LoRA setup.", file=sys.stderr)
        return 2

    total_steps = int(args.max_steps) if int(args.max_steps) > 0 else max(1, math.ceil(float(args.epochs) * len(train_rows)))
    warmup_steps = max(0, int(total_steps * float(args.warmup_ratio)))
    optimizer = torch.optim.AdamW(trainable_params, lr=float(args.lr), weight_decay=float(args.weight_decay))
    scheduler = get_linear_schedule_with_warmup(optimizer, warmup_steps, total_steps)

    run_manifest_path = out_dir / "run-manifest.json"
    trace_path = out_dir / "grpo-trace.jsonl"
    manifest = {
        "created_at": datetime.now(UTC).replace(microsecond=0).isoformat(),
        "task": "judgment_grpo",
        "argv": list(sys.argv),
        "algorithm": {
            "name": "group_relative_policy_optimization",
            "reward_weights": REWARD_WEIGHTS,
            "num_generations": int(args.num_generations),
            "temperature": float(args.temperature),
            "top_p": float(args.top_p),
            "max_new_tokens": int(args.max_new_tokens),
            "kl_beta": float(args.kl_beta),
            "reference_model": args.model if float(args.kl_beta) > 0.0 else None,
        },
        "trainer": {
            "library": "manual-torch-loop",
            "note": "GRPO is implemented locally because TRL is not available in the repo environment.",
        },
        "base_model_id": args.model,
        "processor_id": args.model,
        "git_commit": _git_commit(train_path) or _git_commit(out_dir) or _git_commit(Path.cwd()),
        "package_versions": _package_versions(),
        "train_jsonl": str(train_path),
        "val_jsonl": str(Path(args.val).resolve()) if (args.val or "").strip() else None,
        "data_root": str(data_root),
        "output_dir": str(out_dir),
        "hyperparameters": {
            "epochs": float(args.epochs),
            "max_steps": int(args.max_steps),
            "lr": float(args.lr),
            "weight_decay": float(args.weight_decay),
            "warmup_ratio": float(args.warmup_ratio),
            "per_device_train_batch_size": int(args.batch_size),
            "gradient_accumulation_steps": int(args.grad_accum),
            "max_length": int(args.max_length),
            "num_generations": int(args.num_generations),
            "temperature": float(args.temperature),
            "top_p": float(args.top_p),
            "max_new_tokens": int(args.max_new_tokens),
            "shuffle_train": bool(args.shuffle_train),
            "seed": int(args.seed),
            "lora_r": int(args.lora_r),
            "lora_alpha": int(args.lora_alpha),
            "lora_dropout": float(args.lora_dropout),
            "use_4bit": bool(args.use_4bit),
            "bf16": bool(args.bf16),
            "kl_beta": float(args.kl_beta),
        },
        "prepared_row_contract": (
            "Training reads only frozen fields from JSONL: system, user_text, image_rel_paths, target_json."
        ),
        "reward_contract": (
            "Reward uses strict JSON validity plus step_id, step_complete, action_detected, possible_issue, and objects_f1."
        ),
        "notes": (
            "This loop samples group candidates per prompt, computes relative advantages inside the group, "
            "and updates the LoRA policy with a policy-gradient loss."
        ),
    }
    run_manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    _log(f"wrote run manifest: {run_manifest_path}")

    global_step = 0
    optimizer.zero_grad(set_to_none=True)
    rng = random.Random(int(args.seed))
    row_index = 0
    epoch = 0
    accum_loss = 0.0
    trace_file = trace_path.open("w", encoding="utf-8")

    def next_train_row() -> dict[str, Any]:
        nonlocal row_index, epoch
        if row_index >= len(train_rows):
            row_index = 0
            epoch += 1
            if args.shuffle_train:
                rng.shuffle(train_rows)
        row = train_rows[row_index]
        row_index += 1
        return row

    def one_policy_update(row: dict[str, Any]) -> tuple[float, dict[str, Any]]:
        nonlocal model, ref_model
        images = _resolve_images([str(x) for x in row["image_rel_paths"]], data_root=data_root)
        prompt_text = _build_prompt_text(
            processor=processor,
            system=str(row["system"]),
            user_text=str(row["user_text"]),
            image_count=len(images),
        )
        inputs = _build_model_inputs(
            processor=processor,
            prompt_text=prompt_text,
            images=images,
            max_length=int(args.max_length),
        )
        inputs = _move_batch_to_device(inputs, device)
        prompt_len = int(inputs["input_ids"].shape[1])
        eos_id = tokenizer.eos_token_id if tokenizer.eos_token_id is not None else tokenizer.pad_token_id
        gen_kwargs: dict[str, Any] = {
            "max_new_tokens": int(args.max_new_tokens),
            "do_sample": True,
            "temperature": float(args.temperature),
            "top_p": float(args.top_p),
            "num_return_sequences": int(args.num_generations),
            "pad_token_id": tokenizer.pad_token_id,
            "eos_token_id": eos_id,
        }

        with torch.no_grad():
            with torch.autocast(
                device_type="cuda",
                dtype=torch.bfloat16 if args.bf16 else torch.float16,
                enabled=torch.cuda.is_available(),
            ):
                generated = model.generate(**inputs, **gen_kwargs)

        rewards: list[float] = []
        breakdowns: list[RewardBreakdown] = []
        seq_mean_logprobs: list[torch.Tensor] = []
        ref_mean_logprobs: list[torch.Tensor] = []
        completion_rows: list[dict[str, Any]] = []

        for idx in range(int(args.num_generations)):
            seq = generated[idx : idx + 1]
            seq_list = seq[0].tolist()
            completion_ids = seq_list[prompt_len:]
            end = _first_completion_end(completion_ids, eos_id)
            completion_ids = completion_ids[:end]
            completion_text = tokenizer.decode(completion_ids, skip_special_tokens=True)

            reward = score_candidate_text(
                completion_text,
                target_step_id=str(row["target_json"].get("step_id") or row["step_id"]),
                target_json=dict(row["target_json"]),
            )
            rewards.append(reward.score)
            breakdowns.append(reward)
            completion_rows.append(
                {
                    "index": idx,
                    "completion_text": completion_text,
                    "reward": _build_reward_summary(row["target_json"], reward),
                }
            )

            # Teacher-forcing logprob of the sampled completion.
            seq_inputs = dict(inputs)
            seq_inputs["input_ids"] = seq
            seq_inputs["attention_mask"] = torch.ones_like(seq, device=seq.device)
            with torch.autocast(
                device_type="cuda",
                dtype=torch.bfloat16 if args.bf16 else torch.float16,
                enabled=torch.cuda.is_available(),
            ):
                outputs = model(**seq_inputs)
            logits = outputs.logits[:, prompt_len - 1 : -1, :]
            target_ids = seq[:, prompt_len:]
            if target_ids.numel() == 0:
                seq_mean_logprobs.append(torch.zeros((), device=device))
            else:
                log_probs = torch.log_softmax(logits, dim=-1)
                token_logprobs = log_probs.gather(-1, target_ids.unsqueeze(-1)).squeeze(-1)
                mask = torch.ones_like(target_ids, dtype=token_logprobs.dtype, device=target_ids.device)
                if tokenizer.pad_token_id is not None:
                    mask = mask * target_ids.ne(tokenizer.pad_token_id).to(token_logprobs.dtype)
                token_logprobs = token_logprobs * mask
                denom = mask.sum(dim=-1).clamp_min(1.0)
                seq_mean_logprobs.append((token_logprobs.sum(dim=-1) / denom).squeeze(0))

            if ref_model is not None:
                with torch.no_grad():
                    ref_outputs = ref_model(**seq_inputs)
                ref_logits = ref_outputs.logits[:, prompt_len - 1 : -1, :]
                if target_ids.numel() == 0:
                    ref_mean_logprobs.append(torch.zeros((), device=device))
                else:
                    ref_log_probs = torch.log_softmax(ref_logits, dim=-1)
                    ref_token_logprobs = ref_log_probs.gather(-1, target_ids.unsqueeze(-1)).squeeze(-1)
                    mask = torch.ones_like(target_ids, dtype=ref_token_logprobs.dtype, device=target_ids.device)
                    if tokenizer.pad_token_id is not None:
                        mask = mask * target_ids.ne(tokenizer.pad_token_id).to(ref_token_logprobs.dtype)
                    ref_token_logprobs = ref_token_logprobs * mask
                    denom = mask.sum(dim=-1).clamp_min(1.0)
                    ref_mean_logprobs.append((ref_token_logprobs.sum(dim=-1) / denom).squeeze(0))

        loss, advantages = compute_grpo_policy_loss(
            seq_mean_logprobs,
            rewards=rewards,
            ref_mean_logprobs=ref_mean_logprobs if ref_mean_logprobs else None,
            kl_beta=float(args.kl_beta),
        )
        reward_tensor = torch.tensor(rewards, dtype=torch.float32, device=device)
        stats = {
            "reward_mean": round(float(reward_tensor.mean().item()), 4),
            "reward_std": round(float(reward_tensor.std(unbiased=False).item()), 4),
            "schema_valid_rate": round(float(torch.tensor([b.components["schema_valid"] for b in breakdowns]).mean().item()), 4),
            "step_id_rate": round(float(torch.tensor([b.components["step_id"] for b in breakdowns]).mean().item()), 4),
            "step_complete_rate": round(float(torch.tensor([b.components["step_complete"] for b in breakdowns]).mean().item()), 4),
            "action_rate": round(float(torch.tensor([b.components["action_detected"] for b in breakdowns]).mean().item()), 4),
            "issue_rate": round(float(torch.tensor([b.components["possible_issue"] for b in breakdowns]).mean().item()), 4),
            "objects_f1": round(float(torch.tensor([b.components["objects_f1"] for b in breakdowns]).mean().item()), 4),
            "advantages": [round(float(x), 4) for x in advantages],
            "completion_rows": completion_rows,
        }
        return loss, stats

    try:
        for step in range(total_steps):
            row = next_train_row()
            with torch.autocast(
                device_type="cuda",
                dtype=torch.bfloat16 if args.bf16 else torch.float16,
                enabled=torch.cuda.is_available(),
            ):
                loss, stats = one_policy_update(row)
            loss.backward()
            accum_loss += float(loss.detach().item())
            if (step + 1) % int(args.grad_accum) == 0:
                torch.nn.utils.clip_grad_norm_(trainable_params, 1.0)
                optimizer.step()
                scheduler.step()
                optimizer.zero_grad(set_to_none=True)
            global_step += 1

            trace_record = {
                "global_step": global_step,
                "epoch": epoch,
                "loss": round(float(loss.detach().item()), 6),
                **stats,
                "step_id": row.get("step_id"),
                "clip_id": row.get("clip_id"),
            }
            trace_file.write(json.dumps(trace_record, ensure_ascii=False) + "\n")
            trace_file.flush()

            if global_step % int(args.log_steps) == 0:
                _log(
                    f"step={global_step}/{total_steps} "
                    f"loss={trace_record['loss']:.4f} "
                    f"reward={trace_record['reward_mean']:.4f} "
                    f"step_acc={trace_record['step_complete_rate']:.4f} "
                    f"action_acc={trace_record['action_rate']:.4f}"
                )

            if global_step % int(args.save_steps) == 0:
                ckpt_dir = out_dir / f"checkpoint-{global_step}"
                _log(f"saving checkpoint: {ckpt_dir}")
                _save_model_bundle(model, processor, ckpt_dir)

        if total_steps % int(args.grad_accum) != 0:
            torch.nn.utils.clip_grad_norm_(trainable_params, 1.0)
            optimizer.step()
            scheduler.step()
            optimizer.zero_grad(set_to_none=True)

    except RuntimeError as e:
        if "out of memory" in str(e).lower() or "cuda" in str(e).lower():
            print(
                f"ERROR: training failed ({e}). Try smaller num-generations, lower max_new_tokens, "
                "disable KL regularization, or use a larger GPU.",
                file=sys.stderr,
            )
            return 2
        raise
    finally:
        trace_file.close()

    _log("training complete; saving final bundle")
    _save_model_bundle(model, processor, out_dir)

    final_summary = {"train": None, "val": None}
    if val_rows:
        _log("running final validation reward pass")
        final_summary["val"] = _evaluate_policy(
            rows=val_rows,
            model=model,
            processor=processor,
            tokenizer=tokenizer,
            data_root=data_root,
            max_length=int(args.max_length),
            max_new_tokens=int(args.max_new_tokens),
            temperature=float(args.temperature),
            top_p=float(args.top_p),
            num_generations=1,
            device=device,
            bf16=bool(args.bf16),
        )

    final_manifest = dict(manifest)
    final_manifest["completed_at"] = datetime.now(UTC).replace(microsecond=0).isoformat()
    final_manifest["summary"] = {
        "global_steps": global_step,
        "epochs_seen": epoch,
        "mean_step_loss": round(accum_loss / max(1, global_step), 6),
        "train_trace": str(trace_path),
        "final_eval": final_summary,
    }
    run_manifest_path.write_text(json.dumps(final_manifest, indent=2), encoding="utf-8")
    print("GRPO complete.")
    print(f"- train rows: {len(train_rows)}  val rows: {len(val_rows)}")
    print(f"- output:     {out_dir}")
    print(f"- manifest:   {run_manifest_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
