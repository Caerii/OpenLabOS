from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, Request

from openlabos_inference.api.deps import get_registry
from openlabos_inference.models.session import HealthResponse
from openlabos_inference.services.protocol_registry import ProtocolRegistry

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
def health(
    request: Request,
    registry: ProtocolRegistry = Depends(get_registry),
) -> HealthResponse:
    sqlite_path: Path = request.app.state.sqlite_path
    return HealthResponse(
        status="ok",
        protocol_count=registry.count(),
        protocol_ids=registry.list_protocol_ids(),
        sqlite_path=str(sqlite_path),
    )
