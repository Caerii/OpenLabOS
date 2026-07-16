"""
LM Studio provider — real implementation.

LM Studio exposes an OpenAI-compatible API at ``/v1/chat/completions`` on
localhost:1234 by default. Vision-language models (e.g. ``qwen3.5-9b-vlm``,
``qwen2vl-model-2b-instruct-spatial-information-v1``) accept frames through
the ``image_url`` content part with a ``data:image/jpeg;base64,…`` URL.

The provider speaks the OpenLabOS judgment contract: input is one frame +
one step + criteria; output is a structured Judgment with verdict,
rationale, criteria evidence, and observed objects.
"""
from __future__ import annotations

import asyncio
import base64
import json
import os
import re
import urllib.request
import urllib.error
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4


class LMStudioError(RuntimeError):
    pass


_SYSTEM = (
    "You are OpenLabOS, a closed-world judge. Given one frame of a "
    "laboratory protocol step and the step's structured criteria, return "
    "exactly one JSON object with this schema and no other text:\n"
    '  {"verdict": "succeeded"|"in_progress"|"failed"|"indeterminate",'
    ' "rationale": string,'
    ' "criteria": [{"criterion_index": int, "satisfied": bool,'
    '               "evidence": string}],'
    ' "observed_objects": [{"object_id": string, "confidence": number}]}\n'
    "Confidence is a number in [0, 1]. Rationale is one or two sentences. "
    "Criterion evidence cites what you saw."
)


def _step_prompt(step: dict[str, Any]) -> str:
    title = step.get("title", "")
    instruction = step.get("instruction", "")
    expected = ", ".join(
        f"{o.get('object_id')} ({o.get('label')})"
        for o in step.get("expected_objects", [])
    )
    criteria = step.get("success_criteria", [])
    criteria_block = "\n".join(
        f"  {i}. [{c.get('kind')}] {c.get('description', '')}"
        for i, c in enumerate(criteria)
    ) or "  (none)"
    return (
        f"Step: {title}\n"
        f"Instruction: {instruction}\n"
        f"Expected entities: {expected or '(none specified)'}\n"
        f"Success criteria (indexed):\n{criteria_block}\n\n"
        "Decide a verdict for the step against this single frame and return "
        "the JSON object."
    )


def _strict_json(text: str) -> dict[str, Any]:
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    match = re.search(r"\{[\s\S]*\}", text)
    if not match:
        raise LMStudioError(
            f"LM Studio did not return JSON (got {text[:200]!r})"
        )
    return json.loads(match.group(0))


class LMStudioProvider:
    """
    Provider that drives a local LM Studio server.

    Args:
        base_url: e.g. ``http://localhost:1234`` (LM Studio's default).
        model: the model id loaded in LM Studio (e.g. ``qwen3.5-9b-vlm``).
        timeout_s: per-call timeout in seconds.
    """

    def __init__(
        self,
        base_url: str | None = None,
        model: str | None = None,
        timeout_s: float = 300.0,
    ) -> None:
        self.base_url = (
            base_url
            or os.environ.get("LMSTUDIO_BASE_URL", "http://localhost:1234")
        ).rstrip("/")
        self.model = (
            model
            or os.environ.get("LMSTUDIO_MODEL")
            or os.environ.get("OPENLABOS_MODEL")
            or "qwen3.5-9b-vlm"
        )
        self.timeout_s = timeout_s

    async def render_judgment(self, request: dict[str, Any]) -> dict[str, Any]:
        step = request["step"]
        frame_b64 = request.get("frame_b64") or _read_frame_b64(
            request.get("frame_uri")
        )

        prompt = _step_prompt(step)
        if frame_b64:
            user_content: Any = [
                {"type": "text", "text": prompt},
                {
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:image/jpeg;base64,{frame_b64}"
                    },
                },
            ]
        else:
            user_content = prompt

        body = json.dumps(
            {
                "model": self.model,
                "messages": [
                    {"role": "system", "content": _SYSTEM},
                    {"role": "user", "content": user_content},
                ],
                "temperature": 0,
                "max_tokens": 700,
                # Some LM Studio backends accept only ``json_schema`` or
                # ``text`` for response_format; we rely on the strict
                # system prompt + post-hoc extraction in ``_strict_json``.
            }
        ).encode("utf-8")

        loop = asyncio.get_event_loop()
        raw = await loop.run_in_executor(None, self._post_chat, body)
        text = (
            raw.get("choices", [{}])[0].get("message", {}).get("content", "")
        )
        parsed = _strict_json(text)

        return {
            "judgment_id": str(uuid4()),
            "session_id": request["session_id"],
            "step_id": step["step_id"],
            "frame_uri": request.get("frame_uri", "") or "",
            "emitted_at": datetime.now(timezone.utc)
            .isoformat()
            .replace("+00:00", "Z"),
            "source": f"lmstudio:{self.model}",
            "verdict": parsed.get("verdict", "indeterminate"),
            "rationale": parsed.get("rationale", ""),
            "criteria": parsed.get("criteria", []),
            "observed_objects": parsed.get("observed_objects", []),
        }

    def _post_chat(self, body: bytes) -> dict[str, Any]:
        req = urllib.request.Request(
            f"{self.base_url}/v1/chat/completions",
            data=body,
            headers={"content-type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=self.timeout_s) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            detail = e.read().decode("utf-8", errors="replace")[:500]
            raise LMStudioError(f"HTTP {e.code}: {detail}") from e
        except urllib.error.URLError as e:
            raise LMStudioError(f"LM Studio request failed: {e}") from e


def _read_frame_b64(frame_uri: str | None) -> str | None:
    if not frame_uri:
        return None
    if frame_uri.startswith("file://"):
        path = frame_uri[len("file://") :]
        try:
            with open(path, "rb") as fh:
                return base64.b64encode(fh.read()).decode("ascii")
        except OSError:
            return None
    return None
