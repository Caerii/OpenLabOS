"""
Modern OpenLabOS judgments endpoint.

This router exposes one clean POST endpoint that mirrors the API contract
documented in decision 0005:

    POST /v1/judgments
      body:    JudgmentRequest
      result:  Judgment

The provider is selected by the env var ``OPENLABOS_PROVIDER`` (default
``ollama``). Adding a new provider is a class import + a branch here.
"""
from __future__ import annotations

import os
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from openlabos_inference.providers.lmstudio import (
    LMStudioError,
    LMStudioProvider,
)
from openlabos_inference.providers.mock import MockProvider
from openlabos_inference.providers.ollama import OllamaError, OllamaProvider

router = APIRouter(prefix="/v1", tags=["judgments"])


class StepCriterion(BaseModel):
    kind: str
    description: str = ""


class StepIn(BaseModel):
    step_id: str
    title: str
    instruction: str
    expected_objects: list[dict[str, Any]] = Field(default_factory=list)
    success_criteria: list[StepCriterion] = Field(default_factory=list)


class JudgmentRequest(BaseModel):
    session_id: str
    step: StepIn
    frame_uri: str | None = None
    frame_b64: str | None = None
    context: dict[str, Any] | None = None
    provider: str | None = None


@router.post("/judgments")
async def post_judgment(req: JudgmentRequest) -> dict[str, Any]:
    provider_name = (
        req.provider or os.environ.get("OPENLABOS_PROVIDER", "ollama")
    ).lower()
    if provider_name == "lmstudio":
        provider: Any = LMStudioProvider()
    elif provider_name == "ollama":
        provider = OllamaProvider()
    elif provider_name == "mock":
        provider = MockProvider()
    else:
        raise HTTPException(
            status_code=400, detail=f"Unsupported provider: {provider_name}"
        )

    try:
        return await provider.render_judgment(
            {
                "session_id": req.session_id,
                "step": req.step.model_dump(),
                "frame_uri": req.frame_uri,
                "frame_b64": req.frame_b64,
                "context": req.context,
            }
        )
    except (LMStudioError, OllamaError) as e:
        raise HTTPException(status_code=502, detail=str(e)) from e
