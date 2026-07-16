"""
OpenAI provider stub.

Routes vendor calls through the official OpenAI Python SDK (chat completions /
responses API + multimodal image inputs). Owns API key handling, rate-limit
retries, and translating OpenLabOS prompt parts into OpenAI message shapes.
This is a placeholder; actual SDK integration will be lifted from the dashboard
server in a follow-up change.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from openlabos_inference.models.judgment import JudgmentResult, TriggerJudgmentRequest as JudgmentRequest


class OpenAIProvider:
    async def render_judgment(self, request: "JudgmentRequest") -> "JudgmentResult":
        raise NotImplementedError("OpenAIProvider.render_judgment not yet implemented")
