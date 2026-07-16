"""
Media path conventions and safe path resolution.

Contract:
- SQLite stores *relative paths* rooted at repo-local `data/` (or LABOS_DATA_ROOT).
- All resolution to absolute paths is centralized here.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path, PurePosixPath


class MediaPathError(ValueError):
    pass


def parse_data_relative_path(rel: str) -> PurePosixPath:
    """
    Validate and normalize a user-provided relative path (POSIX-ish) that will be stored in SQLite.
    Rejects absolute paths and parent traversal.
    """
    raw = rel.strip().replace("\\", "/")
    if not raw:
        raise MediaPathError("relative_path must be a non-empty string")

    p = PurePosixPath(raw)
    if p.is_absolute():
        raise MediaPathError("relative_path must be relative to data root (not absolute)")
    # Windows drive-ish inputs like "C:..." are confusing; keep the contract strictly data-relative.
    if p.parts and p.parts[0].endswith(":"):
        raise MediaPathError("relative_path must not include a Windows drive prefix (e.g. C:)")
    if any(part in ("..", "") for part in p.parts):
        raise MediaPathError("relative_path must not contain '..'")
    return p


def resolve_data_path(data_root: Path, rel: str) -> Path:
    """
    Resolve a stored (or incoming) data-relative path to an absolute filesystem path under data_root.
    """
    p = parse_data_relative_path(rel)
    abs_path = (data_root / Path(*p.parts)).resolve()
    root = data_root.resolve()
    try:
        abs_path.relative_to(root)
    except ValueError as e:
        raise MediaPathError("relative_path escapes data root") from e
    return abs_path


@dataclass(frozen=True)
class MediaLayout:
    """
    Declarative on-disk layout under `data_root` that keeps raw captures and derived artifacts distinct.
    """

    data_root: Path

    def raw_session_dir(self, session_id: str) -> PurePosixPath:
        return PurePosixPath("raw") / "captures" / session_id

    def processed_session_dir(self, session_id: str) -> PurePosixPath:
        return PurePosixPath("processed") / session_id

    def clips_session_dir(self, session_id: str) -> PurePosixPath:
        return self.processed_session_dir(session_id) / "clips"

    def frames_session_dir(self, session_id: str) -> PurePosixPath:
        return self.processed_session_dir(session_id) / "frames"
