"""HTTP and API session shapes — not the file-backed protocol schema."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

# Step status strings must match `StepStatusSchema` in packages/protocol-schema/src/session.ts (Zod enum).
STEP_STATUS_VALUES: frozenset[str] = frozenset(
    ("pending", "active", "completed", "skipped", "issue_flagged"),
)
StepStatus = str  # runtime: one of STEP_STATUS_VALUES; DB writes validated in repository


class CreateSessionRequest(BaseModel):
    model_config = {"extra": "forbid"}

    protocol_id: str = Field(min_length=1)


class ProtocolSummaryResponse(BaseModel):
    protocol_id: str
    protocol_version: str
    name: str


class SessionStepResponse(BaseModel):
    """
    Public step shape for the UI: protocol identity and display fields.
    Internal DB column `step_order` (sort index) is not exposed — use `order` from the protocol JSON.
    """

    step_id: str
    title: str
    order: int | None = Field(
        default=None,
        description="Protocol step `order` from JSON; UI sort hint, may be null if omitted in file.",
    )
    status: str
    notes: str | None = None
    updated_at: datetime


class SessionDetailResponse(BaseModel):
    """Enough context to render a session without an extra protocol fetch."""

    session_id: str
    protocol_id: str
    protocol_version: str
    name: str = Field(description="Protocol display name from the JSON document.")
    created_at: datetime
    updated_at: datetime
    steps: list[SessionStepResponse]


class HealthResponse(BaseModel):
    status: str
    protocol_count: int
    protocol_ids: list[str] = Field(description="Protocol ids loaded into the registry at startup.")
    sqlite_path: str = Field(description="Resolved path to the SQLite session database file.")
