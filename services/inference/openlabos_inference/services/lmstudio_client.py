"""Local-only LM Studio client (OpenAI-compatible HTTP surface)."""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from dataclasses import dataclass


class LmStudioError(RuntimeError):
    pass


def _base_url() -> str:
    return os.environ.get("LABOS_LMSTUDIO_BASE_URL", "http://127.0.0.1:1234").rstrip("/")


def _model_id() -> str:
    mid = os.environ.get("LABOS_LMSTUDIO_MODEL", "").strip()
    if not mid:
        raise LmStudioError("LABOS_LMSTUDIO_MODEL is required (model id/name served by LM Studio)")
    return mid


@dataclass(frozen=True)
class LmStudioConfig:
    base_url: str
    model: str
    timeout_s: float


def load_lmstudio_config() -> LmStudioConfig:
    timeout_s = float(os.environ.get("LABOS_LMSTUDIO_TIMEOUT_S", "30"))
    return LmStudioConfig(base_url=_base_url(), model=_model_id(), timeout_s=timeout_s)


def chat_completions(payload: dict) -> dict:
    """
    Minimal POST to OpenAI-compatible `/v1/chat/completions`.
    Uses stdlib urllib to keep deps stable.
    """
    cfg = load_lmstudio_config()
    url = f"{cfg.base_url}/v1/chat/completions"
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=cfg.timeout_s) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
    except urllib.error.URLError as e:
        raise LmStudioError(f"LM Studio unreachable at {url}: {e}") from e
    try:
        return json.loads(raw)
    except json.JSONDecodeError as e:
        raise LmStudioError("LM Studio returned non-JSON response") from e
