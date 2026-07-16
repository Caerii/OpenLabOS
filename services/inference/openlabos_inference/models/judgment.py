"""Judgment schema and DTOs for LM Studio step evaluation."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from openlabos_inference.models.protocol import ActionId, FailureType, ObjectId

JudgmentSchemaVersion = Literal["1"]


class JudgmentResult(BaseModel):
    """
    Mirrors `packages/protocol-schema/src/judgment.ts`.

    Structured fields are authoritative. `reason` is explanatory only.
    """

    model_config = {"extra": "forbid"}

    step_id: str = Field(min_length=1)
    judgment_schema_version: JudgmentSchemaVersion | None = "1"
    objects_seen: list[ObjectId]
    action_detected: ActionId | None = None
    step_complete: bool
    possible_issue: FailureType | None = None
    confidence: float = Field(ge=0, le=1)
    reason: str


class TriggerJudgmentRequest(BaseModel):
    model_config = {"extra": "forbid"}

    clip_id: str = Field(min_length=1)
    # Optional override; by default we judge the clip's associated step_id.
    step_id: str | None = None


class JudgmentResponse(BaseModel):
    judgment_id: str
    session_id: str
    clip_id: str
    created_at: datetime

    result: JudgmentResult


class ListJudgmentsResponse(BaseModel):
    session_id: str
    judgments: list[JudgmentResponse]
