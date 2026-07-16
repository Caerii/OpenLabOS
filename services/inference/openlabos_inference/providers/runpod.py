"""
RunPod provider stub.

Routes vendor calls through RunPod-hosted endpoints (serverless or pod-based
OpenAI-compatible inference). Owns endpoint URL, API key handling, and pod
warm-up handshakes. Placeholder until the dashboard server adapter is ported
here.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from openlabos_inference.models.judgment import JudgmentResult, TriggerJudgmentRequest as JudgmentRequest


class RunPodProvider:
    async def render_judgment(self, request: "JudgmentRequest") -> "JudgmentResult":
        raise NotImplementedError("RunPodProvider.render_judgment not yet implemented")
