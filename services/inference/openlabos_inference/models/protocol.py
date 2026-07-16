"""
Mirrors the file-backed protocol JSON (packages/protocol-schema/examples/...).
Kept separate from HTTP session DTOs — see models/session.py.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

ObjectId = Literal["mug", "kettle", "tea_bag", "spoon", "tray"]
ActionId = Literal["place", "pour", "add", "stir"]
SurfaceId = Literal["counter", "tray", "inside_mug"]
CriterionType = Literal[
    "object_on_surface",
    "liquid_in_object",
    "component_added",
    "stirred",
]
FailureType = Literal[
    "missing_object",
    "wrong_object",
    "wrong_surface",
    "spill",
    "sequence_error",
    "other",
]


class SuccessCriterion(BaseModel):
    model_config = {"extra": "forbid"}

    criterion_type: CriterionType
    object_id: ObjectId | None = None
    related_object_id: ObjectId | None = None
    surface_id: SurfaceId | None = None
    description: str = Field(min_length=1)


class FailureMode(BaseModel):
    model_config = {"extra": "forbid"}

    failure_type: FailureType
    object_id: ObjectId | None = None
    description: str = Field(min_length=1)


class ExpectedObject(BaseModel):
    model_config = {"extra": "forbid"}

    object_id: ObjectId
    label: str = Field(min_length=1)


class ExpectedAction(BaseModel):
    model_config = {"extra": "forbid"}

    action_id: ActionId
    label: str = Field(min_length=1)
    target_object_id: ObjectId | None = None
    instrument_object_id: ObjectId | None = None


class ProtocolStep(BaseModel):
    model_config = {"extra": "forbid"}

    step_id: str = Field(min_length=1)
    order: int | None = Field(default=None, ge=0)
    title: str = Field(min_length=1)
    instruction: str = Field(min_length=1)
    expected_objects: list[ExpectedObject] = Field(min_length=1)
    expected_action: ExpectedAction
    success_criteria: list[SuccessCriterion] = Field(min_length=1)
    failure_modes: list[FailureMode]


class ProtocolDocument(BaseModel):
    """Root type for kitchen-tea-v1.json and compatible protocol files."""

    model_config = {"extra": "forbid"}

    protocol_id: str = Field(min_length=1)
    protocol_version: str = Field(min_length=1)
    name: str = Field(min_length=1)
    description: str | None = None
    steps: list[ProtocolStep] = Field(min_length=1)
