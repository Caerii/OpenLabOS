"""
Immutable in-memory registry of validated protocol documents. Loaded once at startup.

Instances are constructed in FastAPI lifespan and attached to ``app.state.registry`` only.
There is no module-level singleton and no supported mutation after construction.
"""

from __future__ import annotations

from pathlib import Path

from openlabos_inference.models.protocol import ProtocolDocument
from openlabos_inference.services.protocol_loader import load_protocol_from_path


class ProtocolRegistry:
    """Boring registry: no hot reload, no mutation after construction."""

    __slots__ = ("_by_id",)

    def __init__(self, protocols: dict[str, ProtocolDocument]) -> None:
        # Defensive copy so callers cannot retain a shared mutable dict reference.
        self._by_id: dict[str, ProtocolDocument] = dict(protocols)

    @classmethod
    def from_single_path(cls, path: Path) -> ProtocolRegistry:
        doc = load_protocol_from_path(path)
        return cls({doc.protocol_id: doc})

    def count(self) -> int:
        return len(self._by_id)

    def list_protocol_ids(self) -> list[str]:
        return sorted(self._by_id.keys())

    def list_summaries(self) -> list[ProtocolDocument]:
        return list(self._by_id.values())

    def get(self, protocol_id: str) -> ProtocolDocument | None:
        return self._by_id.get(protocol_id)
