"""
Anthropic provider stub.

Routes vendor calls through the official Anthropic Python SDK (messages API
with vision blocks). Owns API key handling, prompt-cache breakpoints, and
translating OpenLabOS prompt parts into Anthropic message shapes. Placeholder
until the dashboard server's Anthropic adapter is ported here.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from openlabos_inference.models.judgment import JudgmentResult, TriggerJudgmentRequest as JudgmentRequest


class AnthropicProvider:
    async def render_judgment(self, request: "JudgmentRequest") -> "JudgmentResult":
        raise NotImplementedError("AnthropicProvider.render_judgment not yet implemented")
