"""Legacy: build SFT rows from dashboard `run_events.jsonl` (verify_step). For frozen judgment SFT use `judgment_sft_prepare` / `openlabos-training prepare-judgment-sft`."""

from __future__ import annotations

import argparse
import json
import urllib.request
from pathlib import Path
from typing import Any, Dict, List

from openlabos_training.datasets.kitchen_events import extract_verify_step, iter_jsonl, resolve_frame_path


def build_prompt(protocol_id: str, step_number: int) -> str:
    # Demo-grade prompt. We’ll replace this with protocol-schema-derived step_id/object/action later.
    return (
        "You are LabOS StepJudge.\n"
        "Given a first-person POV image and the current step, output ONLY valid JSON with keys:\n"
        '{"step_number": <int>, "success": <bool>, "confidence": <0..1>, "reason": "<short>"}\n'
        f"Current step_number: {step_number}\n"
        f"Protocol: {protocol_id}\n"
    )

def _post_json(url: str, body: dict) -> dict:
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read().decode("utf-8"))


def main(argv: List[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Build a minimal SFT dataset from LabOS kitchen run events.")
    p.add_argument("--dashboard-data", required=True, help="Path to imported dashboard data root (contains kitchen/)")
    p.add_argument("--out", required=True, help="Output JSONL path")
    p.add_argument("--teacher-url", default="", help="Optional teacher endpoint base URL (e.g. http://localhost:3847). If set, labels are re-generated via Gemini ER 1.6.")
    p.add_argument("--teacher-mode", default="verify", choices=["verify", "judgment"], help="Which teacher endpoint to use when --teacher-url is set.")
    args = p.parse_args(argv)

    root = Path(args.dashboard_data).resolve()
    events_path = root / "kitchen" / "run_events.jsonl"
    out_path = Path(args.out).resolve()
    out_path.parent.mkdir(parents=True, exist_ok=True)

    events = list(iter_jsonl(events_path))
    examples = extract_verify_step(events)

    rows: List[Dict[str, Any]] = []
    for ex in examples:
        img_path = resolve_frame_path(root, ex.frame_ref)
        target_success = ex.success
        target_conf = ex.confidence
        target_reason = ex.reasoning[:500]

        if args.teacher_url:
            # Re-label using Gemini Robotics ER 1.6 through the dashboard teacher endpoint.
            # This ensures the dataset is teacher-consistent even if the run events contain mixed sources.
            payload = {"protocolId": ex.protocol_id, "stepNumber": ex.step_number, "testImage": ""}
            b64 = Path(img_path).read_bytes()
            import base64
            payload["testImage"] = base64.b64encode(b64).decode("utf-8")

            if args.teacher_mode == "judgment":
                resp = _post_json(args.teacher_url.rstrip("/") + "/api/kitchen/teacher/judgment", payload)
                j = (resp.get("judgment") or {}) if isinstance(resp, dict) else {}
                # Store the full closed-world judgment as target_json
                target_success = bool(j.get("step_complete") is True)
                try:
                    target_conf = float(j.get("confidence") or 0.0)
                except Exception:
                    target_conf = 0.0
                target_reason = str(j.get("reason") or "")[:500]
                target_override = j
            else:
                resp = _post_json(args.teacher_url.rstrip("/") + "/api/kitchen/teacher/verify-step", payload)
                v = (resp.get("verification") or {}) if isinstance(resp, dict) else {}
                target_success = bool(v.get("success") is True)
                try:
                    target_conf = float(v.get("confidence") or 0.0)
                except Exception:
                    target_conf = 0.0
                target_reason = str(v.get("reasoning") or "")[:500]
                target_override = None

        rows.append(
            {
                "id": f"{ex.run_id}/step:{ex.step_number}/frame:{img_path.name}",
                "image_path": str(img_path),
                "prompt": build_prompt(ex.protocol_id, ex.step_number),
                "target_json": target_override
                if args.teacher_url and args.teacher_mode == "judgment"
                else {
                    "step_number": ex.step_number,
                    "success": target_success,
                    "confidence": target_conf,
                    "reason": target_reason,
                },
                "provenance": {
                    "run_id": ex.run_id,
                    "protocol_id": ex.protocol_id,
                    "frame_ref": ex.frame_ref,
                    "ts": ex.ts,
                    "teacher_url": args.teacher_url or None,
                    "teacher_mode": args.teacher_mode if args.teacher_url else None,
                },
            }
        )

    with out_path.open("w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")

    print(f"Wrote {len(rows)} rows -> {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
