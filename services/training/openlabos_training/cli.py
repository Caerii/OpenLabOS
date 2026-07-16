"""Single entrypoint for judgment SFT (prepare + train). Legacy CLIs remain available."""

from __future__ import annotations

import argparse
import sys
from typing import Sequence


def main(argv: Sequence[str] | None = None) -> int:
    from openlabos_training.vlm_model import DEFAULT_VLM_MODEL_ID

    argv_list = list(argv) if argv is not None else None
    p = argparse.ArgumentParser(
        prog="openlabos-training",
        description="LabOS training CLI (TASK-0011: judgment LoRA/SFT).",
    )
    sub = p.add_subparsers(dest="cmd", required=True)

    p_prep = sub.add_parser(
        "prepare-judgment-sft",
        help="Convert frozen TASK-0009 splits into judgment SFT JSONL (same prompt/frame policy as API).",
    )
    p_prep.add_argument("--frozen-dir", required=True)
    p_prep.add_argument("--sqlite", required=True)
    p_prep.add_argument("--data-root", default="")
    p_prep.add_argument("--protocol-path", default="")
    p_prep.add_argument("--out-dir", required=True)

    p_tr = sub.add_parser(
        "train-judgment-sft",
        help="Run LoRA SFT on JSONL from prepare-judgment-sft (local GPU; no eval loop).",
    )
    p_tr.add_argument("--train", required=True)
    p_tr.add_argument("--val", default="")
    p_tr.add_argument("--data-root", required=True)
    p_tr.add_argument("--model", default=DEFAULT_VLM_MODEL_ID)
    p_tr.add_argument("--output", required=True)
    p_tr.add_argument("--epochs", type=float, default=1.0)
    p_tr.add_argument("--max-steps", type=int, default=0)
    p_tr.add_argument("--lr", type=float, default=1e-4)
    p_tr.add_argument("--batch-size", type=int, default=1)
    p_tr.add_argument("--grad-accum", type=int, default=4)
    p_tr.add_argument("--max-length", type=int, default=4096, help="0 disables truncation (VL-safe, more VRAM).")
    p_tr.add_argument("--seed", type=int, default=1337)
    p_tr.add_argument("--save-steps", type=int, default=50)
    p_tr.add_argument("--lora-r", type=int, default=8)
    p_tr.add_argument("--lora-alpha", type=int, default=16)
    p_tr.add_argument("--lora-dropout", type=float, default=0.05)
    p_tr.add_argument("--bf16", action="store_true")
    p_tr.add_argument("--no-use-4bit", action="store_true", help="Disable 4-bit quantization (needs more VRAM).")
    p_tr.add_argument(
        "--shuffle-train",
        action="store_true",
        help="Shuffle train rows (default preserves prepared JSONL order).",
    )

    p_grpo = sub.add_parser(
        "train-grpo",
        help="Run group-relative policy optimization on prepared judgment JSONL (local GPU; sampled reward loop).",
    )
    p_grpo.add_argument("--train", required=True)
    p_grpo.add_argument("--val", default="")
    p_grpo.add_argument("--data-root", required=True)
    p_grpo.add_argument("--model", default=DEFAULT_VLM_MODEL_ID)
    p_grpo.add_argument("--output", required=True)
    p_grpo.add_argument("--epochs", type=float, default=1.0)
    p_grpo.add_argument("--max-steps", type=int, default=0)
    p_grpo.add_argument("--lr", type=float, default=5e-6)
    p_grpo.add_argument("--weight-decay", type=float, default=0.0)
    p_grpo.add_argument("--warmup-ratio", type=float, default=0.03)
    p_grpo.add_argument("--batch-size", type=int, default=1)
    p_grpo.add_argument("--grad-accum", type=int, default=1)
    p_grpo.add_argument("--max-length", type=int, default=0)
    p_grpo.add_argument("--seed", type=int, default=1337)
    p_grpo.add_argument("--log-steps", type=int, default=1)
    p_grpo.add_argument("--save-steps", type=int, default=25)
    p_grpo.add_argument("--num-generations", type=int, default=4)
    p_grpo.add_argument("--temperature", type=float, default=0.7)
    p_grpo.add_argument("--top-p", type=float, default=0.95)
    p_grpo.add_argument("--max-new-tokens", type=int, default=256)
    p_grpo.add_argument("--kl-beta", type=float, default=0.0)
    p_grpo.add_argument("--lora-r", type=int, default=8)
    p_grpo.add_argument("--lora-alpha", type=int, default=16)
    p_grpo.add_argument("--lora-dropout", type=float, default=0.05)
    p_grpo.add_argument("--use-4bit", action=argparse.BooleanOptionalAction, default=True)
    p_grpo.add_argument("--bf16", action="store_true")
    p_grpo.add_argument(
        "--shuffle-train",
        action="store_true",
        help="Shuffle training rows at epoch boundaries.",
    )

    p_inf = sub.add_parser(
        "infer-hf-judgments",
        help="Run judgments with HF+PEFT adapter (post-SFT); writes SQLite rows with explicit model_id.",
    )
    p_inf.add_argument(
        "--split-jsonl",
        default="",
        help="Path to split JSONL, or omit and use --frozen-dir + --split.",
    )
    p_inf.add_argument("--frozen-dir", default="", help="Freeze dir with train/val/test.jsonl (use with --split).")
    p_inf.add_argument("--split", default="", metavar="SPLIT", help="train, val, or test (with --frozen-dir).")
    p_inf.add_argument("--sqlite", required=True)
    p_inf.add_argument("--data-root", required=True)
    p_inf.add_argument("--protocol-path", default="")
    p_inf.add_argument("--adapter-dir", required=True)
    p_inf.add_argument("--base-model", default="")
    p_inf.add_argument("--judgment-model-id", required=True)
    p_inf.add_argument("--max-new-tokens", type=int, default=512)
    p_inf.add_argument("--limit", type=int, default=0)
    p_inf.add_argument("--dry-run", action="store_true")
    p_inf.add_argument(
        "--show-raw-on-parse-fail",
        action="store_true",
        help="Log decoded output on JSON parse/validation failure (see post_sft_infer).",
    )
    p_inf.add_argument("--manifest-out", default="")

    args = p.parse_args(argv_list)

    if args.cmd == "infer-hf-judgments":
        fj, fd, sp = (args.split_jsonl or "").strip(), (args.frozen_dir or "").strip(), (args.split or "").strip()
        if fj and (fd or sp):
            p.error("infer-hf-judgments: use --split-jsonl OR --frozen-dir/--split, not both.")
        if not fj and not (fd and sp):
            p.error("infer-hf-judgments: provide --split-jsonl or both --frozen-dir and --split (train|val|test).")
        if fd and sp and sp not in ("train", "val", "test"):
            p.error("infer-hf-judgments: --split must be train, val, or test.")

    if args.cmd == "prepare-judgment-sft":
        from openlabos_training.judgment_sft_prepare import main as prep_main

        return prep_main(
            [
                "--frozen-dir",
                args.frozen_dir,
                "--sqlite",
                args.sqlite,
                *([] if not args.data_root else ["--data-root", args.data_root]),
                *([] if not args.protocol_path else ["--protocol-path", args.protocol_path]),
                "--out-dir",
                args.out_dir,
            ],
        )

    if args.cmd == "train-judgment-sft":
        from openlabos_training.train_judgment_sft import main as train_main

        use_4bit = not args.no_use_4bit
        return train_main(
            [
                "--train",
                args.train,
                *([] if not args.val else ["--val", args.val]),
                "--data-root",
                args.data_root,
                "--model",
                args.model,
                "--output",
                args.output,
                "--epochs",
                str(args.epochs),
                "--max-steps",
                str(args.max_steps),
                "--lr",
                str(args.lr),
                "--batch-size",
                str(args.batch_size),
                "--grad-accum",
                str(args.grad_accum),
                "--max-length",
                str(args.max_length),
                "--seed",
                str(args.seed),
                "--save-steps",
                str(args.save_steps),
                "--lora-r",
                str(args.lora_r),
                "--lora-alpha",
                str(args.lora_alpha),
                "--lora-dropout",
                str(args.lora_dropout),
                *(["--bf16"] if args.bf16 else []),
                *(["--no-use-4bit"] if not use_4bit else []),
                *(["--shuffle-train"] if args.shuffle_train else []),
            ],
        )

    if args.cmd == "train-grpo":
        from openlabos_training.train_grpo import main as grpo_main

        return grpo_main(
            [
                "--train",
                args.train,
                *([] if not args.val else ["--val", args.val]),
                "--data-root",
                args.data_root,
                "--model",
                args.model,
                "--output",
                args.output,
                "--epochs",
                str(args.epochs),
                "--max-steps",
                str(args.max_steps),
                "--lr",
                str(args.lr),
                "--weight-decay",
                str(args.weight_decay),
                "--warmup-ratio",
                str(args.warmup_ratio),
                "--batch-size",
                str(args.batch_size),
                "--grad-accum",
                str(args.grad_accum),
                "--max-length",
                str(args.max_length),
                "--seed",
                str(args.seed),
                "--log-steps",
                str(args.log_steps),
                "--save-steps",
                str(args.save_steps),
                "--num-generations",
                str(args.num_generations),
                "--temperature",
                str(args.temperature),
                "--top-p",
                str(args.top_p),
                "--max-new-tokens",
                str(args.max_new_tokens),
                "--kl-beta",
                str(args.kl_beta),
                "--lora-r",
                str(args.lora_r),
                "--lora-alpha",
                str(args.lora_alpha),
                "--lora-dropout",
                str(args.lora_dropout),
                *(["--use-4bit"] if args.use_4bit else ["--no-use-4bit"]),
                *(["--bf16"] if args.bf16 else []),
                *(["--shuffle-train"] if args.shuffle_train else []),
            ],
        )

    if args.cmd == "infer-hf-judgments":
        from openlabos_training.post_sft_infer import main as inf_main

        inf_argv: list[str] = [
            "--sqlite",
            args.sqlite,
            "--data-root",
            args.data_root,
            *([] if not args.protocol_path else ["--protocol-path", args.protocol_path]),
            "--adapter-dir",
            args.adapter_dir,
            *([] if not args.base_model else ["--base-model", args.base_model]),
            "--judgment-model-id",
            args.judgment_model_id,
            "--max-new-tokens",
            str(args.max_new_tokens),
            "--limit",
            str(args.limit),
            *(["--dry-run"] if args.dry_run else []),
            *(["--show-raw-on-parse-fail"] if args.show_raw_on_parse_fail else []),
            *([] if not args.manifest_out else ["--manifest-out", args.manifest_out]),
        ]
        if (args.split_jsonl or "").strip():
            inf_argv = ["--split-jsonl", (args.split_jsonl or "").strip(), *inf_argv]
        else:
            inf_argv = [
                "--frozen-dir",
                (args.frozen_dir or "").strip(),
                "--split",
                (args.split or "").strip(),
                *inf_argv,
            ]
        return inf_main(inf_argv)

    print(f"Unknown command: {args.cmd}", file=sys.stderr)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
