from __future__ import annotations

import argparse
import dataclasses
import json
import os
from pathlib import Path
from typing import Any, Dict, List, Optional

from openlabos_training.vlm_model import DEFAULT_VLM_MODEL_ID


def _require(pkg: str) -> None:
    try:
        __import__(pkg)
    except Exception as e:  # pragma: no cover
        raise SystemExit(
            f"Missing dependency '{pkg}'.\n"
            "If you are on a GPU box, run:\n"
            "  uv sync --python 3.12\n"
            "  uv sync --python 3.12 --extra gpu\n"
        ) from e


def _peek_jsonl(path: Path, n: int = 3) -> List[dict]:
    out: List[dict] = []
    if not path.exists():
        return out
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            out.append(json.loads(line))
            if len(out) >= n:
                break
    return out


@dataclasses.dataclass
class SftExample:
    id: str
    image_path: str
    prompt: str
    target_json: Dict[str, Any]


def _load_jsonl_dataset(path: Path) -> List[SftExample]:
    rows: List[SftExample] = []
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            r = json.loads(line)
            if not isinstance(r, dict):
                continue
            if not r.get("image_path") or not r.get("prompt") or r.get("target_json") is None:
                continue
            rows.append(
                SftExample(
                    id=str(r.get("id") or ""),
                    image_path=str(r["image_path"]),
                    prompt=str(r["prompt"]),
                    target_json=r["target_json"] if isinstance(r["target_json"], dict) else {"value": r["target_json"]},
                )
            )
    return rows


def main(argv: Optional[List[str]] = None) -> int:
    p = argparse.ArgumentParser(description="SFT (QLoRA) training for LabOS Qwen-family VLM targets (demo-grade).")
    p.add_argument("--dataset", required=True, help="Path to SFT JSONL (built by openlabos-build-sft).")
    p.add_argument("--model", default=DEFAULT_VLM_MODEL_ID)
    p.add_argument("--output", required=True, help="Output dir for adapter/checkpoints.")
    p.add_argument("--epochs", type=float, default=1.0)
    p.add_argument("--max-steps", type=int, default=0, help="If >0, overrides epochs.")
    p.add_argument("--lr", type=float, default=2e-4)
    p.add_argument("--weight-decay", type=float, default=0.0)
    p.add_argument("--warmup-ratio", type=float, default=0.03)
    p.add_argument("--batch-size", type=int, default=1)
    p.add_argument("--grad-accum", type=int, default=8)
    p.add_argument("--max-length", type=int, default=1024)
    p.add_argument("--eval-split", type=float, default=0.0, help="0 disables eval; else fraction for validation.")
    p.add_argument("--seed", type=int, default=1337)
    p.add_argument("--log-steps", type=int, default=10)
    p.add_argument("--save-steps", type=int, default=200)
    p.add_argument("--lora-r", type=int, default=16)
    p.add_argument("--lora-alpha", type=int, default=32)
    p.add_argument("--lora-dropout", type=float, default=0.05)
    p.add_argument("--use-4bit", action="store_true", help="Requires bitsandbytes; recommended on 24GB GPUs.")
    p.add_argument("--bf16", action="store_true", help="Prefer bf16 if supported.")
    args = p.parse_args(argv)

    # Lazy-import heavy deps only when used
    _require("datasets")
    _require("transformers")
    _require("peft")
    _require("accelerate")
    _require("PIL")

    import random
    import torch
    from PIL import Image
    from datasets import Dataset
    from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
    from transformers import (
        AutoProcessor,
        BitsAndBytesConfig,
        Trainer,
        TrainingArguments,
    )

    ds_path = Path(args.dataset).resolve()
    out_dir = Path(args.output).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    sample = _peek_jsonl(ds_path, 1)
    if not sample:
        raise SystemExit(f"Dataset empty or missing: {ds_path}")

    rows = _load_jsonl_dataset(ds_path)
    if not rows:
        raise SystemExit(f"No usable rows found in dataset: {ds_path}")

    random.seed(args.seed)
    random.shuffle(rows)

    n_eval = int(len(rows) * float(args.eval_split)) if args.eval_split else 0
    eval_rows = rows[:n_eval] if n_eval > 0 else []
    train_rows = rows[n_eval:]

    def _to_hf(rows_in: List[SftExample]) -> "Dataset":
        return Dataset.from_list(
            [
                {
                    "id": r.id,
                    "image_path": r.image_path,
                    "prompt": r.prompt,
                    "target_json": r.target_json,
                }
                for r in rows_in
            ]
        )

    train_ds = _to_hf(train_rows)
    eval_ds = _to_hf(eval_rows) if eval_rows else None

    processor = AutoProcessor.from_pretrained(args.model, trust_remote_code=True)
    tok = processor.tokenizer

    # Qwen-family VLMs usually require trust_remote_code; AutoModel resolution is handled by transformers internals.
    quant_config = None
    if args.use_4bit:
        _require("bitsandbytes")
        quant_config = BitsAndBytesConfig(
            load_in_4bit=True,
            bnb_4bit_quant_type="nf4",
            bnb_4bit_use_double_quant=True,
            bnb_4bit_compute_dtype=torch.bfloat16 if args.bf16 else torch.float16,
        )

    from transformers import AutoModelForVision2Seq

    model = AutoModelForVision2Seq.from_pretrained(
        args.model,
        trust_remote_code=True,
        torch_dtype=torch.bfloat16 if args.bf16 else None,
        quantization_config=quant_config,
        device_map="auto" if torch.cuda.is_available() else None,
    )

    if args.use_4bit:
        model = prepare_model_for_kbit_training(model)

    lora = LoraConfig(
        r=int(args.lora_r),
        lora_alpha=int(args.lora_alpha),
        lora_dropout=float(args.lora_dropout),
        bias="none",
        task_type="CAUSAL_LM",
    )
    model = get_peft_model(model, lora)

    def _make_text(prompt: str, target: Dict[str, Any]) -> tuple[str, str]:
        target_text = json.dumps(target, ensure_ascii=False)

        user_msgs = [
            {
                "role": "user",
                "content": [
                    {"type": "image"},
                    {"type": "text", "text": prompt},
                ],
            }
        ]
        full_msgs = user_msgs + [{"role": "assistant", "content": [{"type": "text", "text": target_text}]}]

        prompt_text = processor.apply_chat_template(user_msgs, tokenize=False, add_generation_prompt=True)
        full_text = processor.apply_chat_template(full_msgs, tokenize=False, add_generation_prompt=False)
        return prompt_text, full_text

    class DataCollator:
        def __init__(self):
            self.processor = processor
            self.tok = tok
            self.max_length = int(args.max_length)

        def __call__(self, features: List[Dict[str, Any]]) -> Dict[str, Any]:
            images: List[Image.Image] = []
            prompt_texts: List[str] = []
            full_texts: List[str] = []

            for f in features:
                img = Image.open(f["image_path"]).convert("RGB")
                ptxt, ftxt = _make_text(f["prompt"], f["target_json"])
                images.append(img)
                prompt_texts.append(ptxt)
                full_texts.append(ftxt)

            enc = self.processor(
                text=full_texts,
                images=images,
                return_tensors="pt",
                padding=True,
                truncation=True,
                max_length=self.max_length,
            )

            # Mask prompt tokens so loss is only on assistant completion.
            labels = enc["input_ids"].clone()
            for i, ptxt in enumerate(prompt_texts):
                p_ids = self.tok(ptxt, add_special_tokens=False).input_ids
                prompt_len = min(len(p_ids), labels.shape[1])
                labels[i, :prompt_len] = -100
            enc["labels"] = labels
            return enc

    collator = DataCollator()

    # Keep noisy parallelism low on Windows by default.
    os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")

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

    trainer.train()

    # Save adapters + processor for inference.
    model.save_pretrained(str(out_dir))
    processor.save_pretrained(str(out_dir))

    print("SFT done.")
    print(f"- rows:   train={len(train_rows)} eval={len(eval_rows)}")
    print(f"- output: {out_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
