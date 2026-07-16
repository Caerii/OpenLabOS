from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from openlabos_inference.api.deps import get_registry
from openlabos_inference.models.session import ProtocolSummaryResponse
from openlabos_inference.services.protocol_registry import ProtocolRegistry

router = APIRouter(prefix="/protocols", tags=["protocols"])


@router.get("", response_model=list[ProtocolSummaryResponse])
def list_protocols(
    registry: ProtocolRegistry = Depends(get_registry),
) -> list[ProtocolSummaryResponse]:
    return [
        ProtocolSummaryResponse(
            protocol_id=p.protocol_id,
            protocol_version=p.protocol_version,
            name=p.name,
        )
        for p in registry.list_summaries()
    ]


@router.get("/{protocol_id}")
def get_protocol(
    protocol_id: str,
    registry: ProtocolRegistry = Depends(get_registry),
) -> dict:
    doc = registry.get(protocol_id)
    if doc is None:
        raise HTTPException(status_code=404, detail="Protocol not found")
    return doc.model_dump()
