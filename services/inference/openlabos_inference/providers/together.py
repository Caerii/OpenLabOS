"""
Together AI provider stub.

Routes vendor calls through the Together API (OpenAI-compatible endpoint with
hosted open-weights vision/text models). Owns API key handling and model id
selection. Placeholder until the dashboard server adapter is ported here.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from openlabos_inference.models.judgment import JudgmentResult, TriggerJudgmentRequest as JudgmentRequest


class TogetherProvider:
    async def render_judgment(self, request: "JudgmentRequest") -> "JudgmentResult":
        raise NotImplementedError("TogetherProvider.render_judgment not yet implemented")
