from __future__ import annotations

import asyncio

from openlabos_inference.api.routes.openlabos_judgments import (
    JudgmentRequest,
    StepCriterion,
    StepIn,
    post_judgment,
)


def test_mock_provider_returns_judgment_contract() -> None:
    request = JudgmentRequest(
        session_id="00000000-0000-4000-8000-000000000001",
        provider="mock",
        step=StepIn(
            step_id="test-step",
            title="Test step",
            instruction="Return a deterministic response.",
            success_criteria=[
                StepCriterion(kind="integration", description="Contract works")
            ],
        ),
    )

    judgment = asyncio.run(post_judgment(request))

    assert judgment["session_id"] == request.session_id
    assert judgment["step_id"] == request.step.step_id
    assert judgment["source"] == "mock:deterministic"
    assert judgment["verdict"] == "indeterminate"
    assert judgment["criteria"] == [
        {
            "criterion_index": 0,
            "satisfied": False,
            "evidence": "Mock provider does not inspect evidence.",
        }
    ]
