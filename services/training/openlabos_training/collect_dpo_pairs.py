from __future__ import annotations

import argparse
import base64
import json
import os
import re
import time
import urllib.request
import urllib.error
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from openlabos_training.datasets.kitchen_events import extract_verify_step, iter_jsonl, resolve_frame_path


@dataclass(frozen=True)
class DpoPairRow:
    id: str
    image_path: str
    prompt: str
    chosen: Dict[str, Any]
    rejected: Dict[str, Any]
    meta: Dict[str, Any]


def _post_json(url: str, body: dict, timeout_s: int = 120) -> dict:
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout_s) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _teacher_judgment(teacher_base_url: str, protocol_id: str, step_number: int, jpg_bytes: bytes) -> Tuple[Dict[str, Any], float]:
    t0 = time.time()
    payload = {
        "protocolId": protocol_id,
        "stepNumber": step_number,
        "testImage": base64.b64encode(jpg_bytes).decode("utf-8"),
    }
    resp = _post_json(teacher_base_url.rstrip("/") + "/api/kitchen/teacher/judgment", payload, timeout_s=180)
    dt = time.time() - t0
    j = resp.get("judgment") if isinstance(resp, dict) else None
    if not isinstance(j, dict):
        raise RuntimeError(f"Teacher response missing judgment: keys={list(resp.keys()) if isinstance(resp, dict) else type(resp)}")
    return j, dt


def _try_parse_json_object(text: str) -> Dict[str, Any]:
    """
    LM Studio / llama.cpp VLMs sometimes emit special tokens or extra text.
    We try strict JSON first, then fall back to extracting the first {...} block.
    """
    raw = (text or "").strip()
    if not raw:
        return {"_parse_error": True, "raw": text}

    def _validate(obj: Any) -> Dict[str, Any]:
        if not isinstance(obj, dict):
            return {"_parse_error": True, "raw": text}
        # Treat empty or schema-missing objects as parse errors for our pipeline.
        required = {"step_id", "objects_seen", "action_detected", "step_complete", "possible_issue", "confidence", "reason"}
        if not required.issubset(set(obj.keys())):
            return {"_parse_error": True, "raw": text, "_missing_keys": sorted(list(required - set(obj.keys())))}
        return obj

    # Strict parse first
    try:
        obj = json.loads(raw)
        return _validate(obj)
    except Exception:
        pass

    # Heuristic: first JSON object block
    # Find the first '{' and last '}' that could form a JSON object.
    start = raw.find("{")
    end = raw.rfind("}")
    if start != -1 and end != -1 and end > start:
        cand = raw[start : end + 1]
        # Remove obvious non-JSON wrappers
        cand = re.sub(r"^```(?:json)?\s*", "", cand.strip(), flags=re.IGNORECASE)
        cand = re.sub(r"\s*```$", "", cand.strip())
        try:
            obj = json.loads(cand)
            return _validate(obj)
        except Exception:
            pass

    return {"_parse_error": True, "raw": text}


def _openai_compat_student(
    student_base_url: str,
    model: str,
    prompt: str,
    jpg_bytes: bytes,
    *,
    temperature: float = 0.0,
    max_tokens: int = 512,
) -> Tuple[Dict[str, Any], float, str]:
    """
    Uses LM Studio OpenAI-compatible endpoints.

    For multimodal: send a data: URL via image_url (OpenAI-style).
    """
    t0 = time.time()
    b64 = base64.b64encode(jpg_bytes).decode("utf-8")
    data_url = f"data:image/jpeg;base64,{b64}"

    # Closed-world schema aligned with dashboard teacher output.
    #
    # Route 2: Use ONLY /v1/chat/completions and send response_format exactly
    # as LM Studio documents it: { type: "json_schema", json_schema: { name, strict: "true", schema: {...} } }.
    judgment_schema_inner = {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "step_id": {"type": "string"},
            "objects_seen": {
                "type": "array",
                "items": {
                    "type": "string",
                    "enum": ["mug", "kettle", "tea_bag", "spoon", "tray", "pot", "stove", "bowl", "noodles", "seasoning_packet"],
                },
            },
            "action_detected": {"type": ["string", "null"], "enum": ["place", "pour", "add", "stir", None]},
            "step_complete": {"type": "boolean"},
            "possible_issue": {
                "type": ["string", "null"],
                "enum": ["missing_object", "wrong_object", "wrong_surface", "spill", "sequence_error", "other", None],
            },
            "confidence": {"type": "number", "minimum": 0.0, "maximum": 1.0},
            "reason": {"type": "string"},
        },
        "required": ["step_id", "objects_seen", "action_detected", "step_complete", "possible_issue", "confidence", "reason"],
    }
    judgment_schema_wrapper = {"name": "labos_judgment_v1", "strict": "true", "schema": judgment_schema_inner}

    url_chat = student_base_url.rstrip("/") + "/chat/completions"
    body_chat = {
        "model": model,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "stream": False,
        "response_format": {"type": "json_schema", "json_schema": judgment_schema_wrapper},
        "messages": [
            {
                "role": "system",
                "content": (
                    "You are LabOS StepJudge. "
                    "Return ONLY a JSON object that matches the provided JSON Schema. "
                    "No markdown, no extra keys, no extra text."
                ),
            },
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": prompt},
                    {"type": "image_url", "image_url": {"url": data_url}},
                ],
            },
        ],
    }

    try:
        resp = _post_json(url_chat, body_chat, timeout_s=180)
    except urllib.error.HTTPError as e:
        # If schema enforcement is rejected, retry without it and rely on heuristic extraction.
        if int(getattr(e, "code", 0) or 0) == 400 and "response_format" in body_chat:
            body_chat.pop("response_format", None)
            resp = _post_json(url_chat, body_chat, timeout_s=180)
        else:
            raise
    dt = time.time() - t0

    try:
        content = resp["choices"][0]["message"]["content"]
    except Exception:
        raise RuntimeError(f"Unexpected LM Studio response shape: {resp}")

    raw_text = str(content or "")
    parsed = _try_parse_json_object(raw_text)
    return parsed, dt, raw_text


def build_prompt_closed_world(protocol_id: str, step_number: int, step_id: str) -> str:
    # Keep aligned to dashboard teacher prompt; this prompt is intentionally strict.
    return (
        "You are LabOS StepJudge.\n"
        "Given a first-person POV image and the current step, output ONLY valid JSON with this exact schema:\n"
        '{ "step_id": "<id>", "objects_seen": ["mug","kettle","tea_bag","spoon","tray","pot","stove","bowl","noodles","seasoning_packet"], '
        '"action_detected": "place"|"pour"|"add"|"stir"|null, '
        '"step_complete": <bool>, '
        '"possible_issue": "missing_object"|"wrong_object"|"wrong_surface"|"spill"|"sequence_error"|"other"|null, '
        '"confidence": <0..1>, "reason": "<short>" }\n'
        f"ProtocolId: {protocol_id}\n"
        f"StepNumber: {step_number}\n"
        f"StepId: {step_id}\n"
        "Rules: Use only the enum values. If uncertain, use nulls and lower confidence.\n"
    )


def main(argv: Optional[List[str]] = None) -> int:
    p = argparse.ArgumentParser(description="Collect teacher-vs-student preference pairs for DPO from LabOS kitchen artifacts.")
    p.add_argument("--dashboard-data", required=True, help="Path to imported dashboard data root (contains kitchen/)")
    p.add_argument("--out", required=True, help="Output JSONL path for DPO pairs")
    p.add_argument("--teacher-url", required=True, help="Dashboard base URL, e.g. http://localhost:3847")
    p.add_argument(
        "--student-url",
        default="",
        help="Student OpenAI-compatible base URL (RunPod / vLLM / SGLang / LM Studio).",
    )
    p.add_argument("--lmstudio-url", dest="student_url_legacy", default="", help=argparse.SUPPRESS)
    p.add_argument(
        "--student-model",
        default="",
        help="Student model id as reported by GET /v1/models.",
    )
    p.add_argument("--lmstudio-model", dest="student_model_legacy", default="", help=argparse.SUPPRESS)
    p.add_argument("--limit", type=int, default=0, help="If >0, limit number of examples")
    args = p.parse_args(argv)

    student_url = (
        args.student_url
        or args.student_url_legacy
        or os.environ.get("REMOTE_OPENAI_BASE_URL", "")
        or os.environ.get("LMSTUDIO_BASE_URL", "")
        or "http://localhost:1234/v1"
    ).strip()
    student_model = (
        args.student_model
        or args.student_model_legacy
        or os.environ.get("REMOTE_OPENAI_MODEL_ID", "")
        or os.environ.get("LMSTUDIO_MODEL_ID", "")
    ).strip()
    if not student_model:
        p.error("Provide --student-model (or --lmstudio-model) or set REMOTE_OPENAI_MODEL_ID / LMSTUDIO_MODEL_ID.")

    root = Path(args.dashboard_data).resolve()
    events_path = root / "kitchen" / "run_events.jsonl"
    out_path = Path(args.out).resolve()
    out_path.parent.mkdir(parents=True, exist_ok=True)

    # Mirrors dashboard teacher mapping for kitchen-tea.
    tea_step_id_by_number: Dict[int, str] = {
        1: "place-mug-on-counter",
        2: "pour-water-into-mug",
        3: "add-tea-bag",
        4: "stir-with-spoon",
        5: "place-mug-on-tray",
    }

    events = list(iter_jsonl(events_path))
    examples = extract_verify_step(events)
    if args.limit and args.limit > 0:
        examples = examples[: int(args.limit)]

    rows: List[DpoPairRow] = []
    for ex in examples:
        img_path = resolve_frame_path(root, ex.frame_ref)
        jpg = Path(img_path).read_bytes()
        step_id = tea_step_id_by_number.get(ex.step_number, f"step-{ex.step_number}")
        prompt = build_prompt_closed_world(ex.protocol_id, ex.step_number, step_id)

        teacher_j, t_teacher = _teacher_judgment(args.teacher_url, ex.protocol_id, ex.step_number, jpg)
        student_j, t_student, student_raw = _openai_compat_student(student_url, student_model, prompt, jpg)

        rows.append(
            DpoPairRow(
                id=f"{ex.run_id}/step:{ex.step_number}/frame:{Path(img_path).name}",
                image_path=str(img_path),
                prompt=prompt,
                chosen=teacher_j,
                rejected=student_j,
                meta={
                    "run_id": ex.run_id,
                    "protocol_id": ex.protocol_id,
                    "step_number": ex.step_number,
                    "frame_ref": ex.frame_ref,
                    "teacher_url": args.teacher_url,
                    "student_url": student_url,
                    "student_model": student_model,
                    "lmstudio_url": student_url,
                    "lmstudio_model": student_model,
                    "latency_s": {"teacher": t_teacher, "student": t_student},
                    "student_raw": student_raw[:4000],
                },
            )
        )

    with out_path.open("w", encoding="utf-8") as f:
        for r in rows:
            f.write(
                json.dumps(
                    {
                        "id": r.id,
                        "image_path": r.image_path,
                        "prompt": r.prompt,
                        "chosen": r.chosen,
                        "rejected": r.rejected,
                        "meta": r.meta,
                    },
                    ensure_ascii=False,
                )
                + "\n"
            )

    print(f"Wrote {len(rows)} DPO pairs -> {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
