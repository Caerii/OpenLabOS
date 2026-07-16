"""
Google GenAI (Gemini) provider stub.

Routes vendor calls through google-genai (Gemini multimodal models). Owns API
key handling, safety setting plumbing, and translating OpenLabOS prompt parts
into google-genai Content/Part shapes. Placeholder until the dashboard server
adapter is ported here.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from openlabos_inference.models.judgment import JudgmentResult, TriggerJudgmentRequest as JudgmentRequest


class GoogleGenAIProvider:
    async def render_judgment(self, request: "JudgmentRequest") -> "JudgmentResult":
        raise NotImplementedError("GoogleGenAIProvider.render_judgment not yet implemented")
