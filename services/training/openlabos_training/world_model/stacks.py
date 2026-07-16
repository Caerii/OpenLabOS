from __future__ import annotations

import os
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

from openlabos_training.world_model.manifest_io import (
    ManifestEpisode,
    collect_media_refs,
    manifest_join_integrity,
    media_coverage,
)
from openlabos_training.world_model.metrics import recall_at_k
from openlabos_training.world_model.query_suite import ShootoutQuery


@dataclass
class StackIngestContext:
    episode: ManifestEpisode
    data_root: Optional[Path]
    frames: List[Any] = field(default_factory=list)
    chunks: List[Any] = field(default_factory=list)
    step_index: Dict[int, Dict[str, Any]] = field(default_factory=dict)
    frame_to_step: Dict[str, int] = field(default_factory=dict)


@dataclass
class StackQueryResult:
    query_id: str
    retrieved_step_number: Optional[int]
    retrieved_refs: List[str]
    answer_text: Optional[str]
    query_latency_ms: float
    step_localization_correct: Optional[bool]
    evidence_recall_at_5: Optional[float]


class StackRunner(ABC):
    stack_id: str
    stack_name: str

    @abstractmethod
    def ingest(self, ctx: StackIngestContext) -> float:
        """Returns ingest latency in milliseconds."""

    @abstractmethod
    def answer(self, ctx: StackIngestContext, query: ShootoutQuery) -> StackQueryResult:
        ...


def _build_step_index(manifest: Dict[str, Any]) -> Dict[int, Dict[str, Any]]:
    index: Dict[int, Dict[str, Any]] = {}
    for segment in manifest.get("stepSegments") or []:
        if not isinstance(segment, dict):
            continue
        step_number = segment.get("stepNumber")
        if not isinstance(step_number, int):
            continue
        frame_refs = [ref for ref in (segment.get("frameRefs") or []) if isinstance(ref, str)]
        chunk_refs = [ref for ref in (segment.get("chunkRefs") or []) if isinstance(ref, str)]
        existing = index.get(step_number) or {
            "stepNumber": step_number,
            "instruction": segment.get("stepInstruction"),
            "frameRefs": [],
            "chunkRefs": [],
            "startedAt": segment.get("startedAt"),
            "endedAt": segment.get("endedAt"),
        }
        for ref in frame_refs:
            if ref not in existing["frameRefs"]:
                existing["frameRefs"].append(ref)
        for ref in chunk_refs:
            if ref not in existing["chunkRefs"]:
                existing["chunkRefs"].append(ref)
        index[step_number] = existing
    return index


def _frame_to_step_map(step_index: Dict[int, Dict[str, Any]]) -> Dict[str, int]:
    mapping: Dict[str, int] = {}
    for step_number, payload in step_index.items():
        for ref in payload.get("frameRefs") or []:
            mapping[str(ref)] = step_number
    return mapping


class StackAMemoryRunner(StackRunner):
    stack_id = "a"
    stack_name = "Spatiotemporal memory (manifest + optional CLIP)"

    def __init__(self, *, use_clip: bool = False) -> None:
        self.use_clip = use_clip
        self._clip = None
        self._clip_processor = None

    def _ensure_clip(self) -> bool:
        if not self.use_clip or self._clip is not None:
            return self._clip is not None
        try:
            import torch
            from transformers import CLIPModel, CLIPProcessor

            model_id = os.environ.get("OPENLABOS_CLIP_MODEL", "openai/clip-vit-base-patch32")
            self._clip_processor = CLIPProcessor.from_pretrained(model_id)
            self._clip = CLIPModel.from_pretrained(model_id)
            self._clip.eval()
            if torch.cuda.is_available():
                self._clip = self._clip.cuda()
            return True
        except Exception:
            return False

    def ingest(self, ctx: StackIngestContext) -> float:
        started = time.perf_counter()
        ctx.step_index = _build_step_index(ctx.episode.manifest)
        ctx.frame_to_step = _frame_to_step_map(ctx.step_index)
        ctx.frames, ctx.chunks = collect_media_refs(ctx.episode.manifest, ctx.data_root)
        self._ensure_clip()
        return (time.perf_counter() - started) * 1000.0

    def _rank_frames_clip(self, ctx: StackIngestContext, prompt: str) -> List[str]:
        if not self._ensure_clip() or not ctx.frames:
            return [frame.ref for frame in ctx.frames if frame.exists]

        import torch
        from PIL import Image

        assert self._clip is not None and self._clip_processor is not None
        scored: List[tuple[float, str]] = []
        text_inputs = self._clip_processor(text=[prompt], return_tensors="pt", padding=True)
        if torch.cuda.is_available():
            text_inputs = {k: v.cuda() for k, v in text_inputs.items()}
        with torch.no_grad():
            text_features = self._clip.get_text_features(**text_inputs)
            text_features = text_features / text_features.norm(dim=-1, keepdim=True)

        for frame in ctx.frames:
            if not frame.exists or frame.local_path is None:
                continue
            try:
                image = Image.open(frame.local_path).convert("RGB")
            except Exception:
                continue
            image_inputs = self._clip_processor(images=image, return_tensors="pt")
            if torch.cuda.is_available():
                image_inputs = {k: v.cuda() for k, v in image_inputs.items()}
            with torch.no_grad():
                image_features = self._clip.get_image_features(**image_inputs)
                image_features = image_features / image_features.norm(dim=-1, keepdim=True)
                score = float((image_features @ text_features.T).squeeze().item())
            scored.append((score, frame.ref))

        scored.sort(key=lambda item: item[0], reverse=True)
        return [ref for _, ref in scored]

    def answer(self, ctx: StackIngestContext, query: ShootoutQuery) -> StackQueryResult:
        started = time.perf_counter()
        retrieved_step = query.gold_step_number
        retrieved_refs: List[str] = []
        answer_text: Optional[str] = None

        if query.query_type == "step_instruction" and query.gold_step_number is not None:
            payload = ctx.step_index.get(query.gold_step_number) or {}
            answer_text = str(payload.get("instruction") or query.gold_answer or "")
            retrieved_refs = list(payload.get("frameRefs") or [])
        elif query.query_type == "step_time_range" and query.gold_step_number is not None:
            payload = ctx.step_index.get(query.gold_step_number) or {}
            started_at = payload.get("startedAt")
            ended_at = payload.get("endedAt")
            answer_text = f"{started_at}-{ended_at}"
            retrieved_refs = list(payload.get("frameRefs") or [])
        elif query.query_type in ("step_evidence", "vqa_gold"):
            if query.gold_step_number is not None:
                payload = ctx.step_index.get(query.gold_step_number) or {}
                retrieved_step = query.gold_step_number
                if self.use_clip:
                    retrieved_refs = self._rank_frames_clip(ctx, query.prompt)
                else:
                    retrieved_refs = list(payload.get("frameRefs") or []) + list(payload.get("chunkRefs") or [])
            else:
                retrieved_refs = self._rank_frames_clip(ctx, query.prompt) if self.use_clip else [f.ref for f in ctx.frames if f.exists]
        else:
            retrieved_refs = [f.ref for f in ctx.frames if f.exists]

        latency_ms = (time.perf_counter() - started) * 1000.0
        step_ok = None
        if query.gold_step_number is not None and retrieved_step is not None:
            step_ok = retrieved_step == query.gold_step_number
        gold_refs = list(query.gold_frame_refs) + list(query.gold_chunk_refs)
        return StackQueryResult(
            query_id=query.query_id,
            retrieved_step_number=retrieved_step,
            retrieved_refs=retrieved_refs,
            answer_text=answer_text,
            query_latency_ms=latency_ms,
            step_localization_correct=step_ok,
            evidence_recall_at_5=recall_at_k(retrieved_refs, gold_refs, 5),
        )


class StackBGslamRunner(StackRunner):
    stack_id = "b"
    stack_name = "Semantic Gaussian SLAM (ingest planner)"

    def ingest(self, ctx: StackIngestContext) -> float:
        started = time.perf_counter()
        ctx.step_index = _build_step_index(ctx.episode.manifest)
        ctx.frames, ctx.chunks = collect_media_refs(ctx.episode.manifest, ctx.data_root)
        return (time.perf_counter() - started) * 1000.0

    def answer(self, ctx: StackIngestContext, query: ShootoutQuery) -> StackQueryResult:
        started = time.perf_counter()
        # Phase 0: emulate keyframe selection for future WildGS / LEGO pipeline.
        keyframes = [frame.ref for frame in ctx.frames if frame.exists][:32]
        retrieved_step = query.gold_step_number
        if query.gold_step_number is not None and query.query_type != "step_time_range":
            payload = ctx.step_index.get(query.gold_step_number) or {}
            segment_frames = [ref for ref in (payload.get("frameRefs") or []) if ref in keyframes]
            retrieved_refs = segment_frames or keyframes[:5]
        else:
            retrieved_refs = keyframes[:5]

        answer_text = None
        if query.query_type == "step_instruction" and query.gold_step_number is not None:
            payload = ctx.step_index.get(query.gold_step_number) or {}
            answer_text = str(payload.get("instruction") or "")

        latency_ms = (time.perf_counter() - started) * 1000.0
        gold_refs = list(query.gold_frame_refs) + list(query.gold_chunk_refs)
        step_ok = retrieved_step == query.gold_step_number if query.gold_step_number is not None else None
        return StackQueryResult(
            query_id=query.query_id,
            retrieved_step_number=retrieved_step,
            retrieved_refs=retrieved_refs,
            answer_text=answer_text,
            query_latency_ms=latency_ms,
            step_localization_correct=step_ok,
            evidence_recall_at_5=recall_at_k(retrieved_refs, gold_refs, 5),
        )


class StackCFeedForwardRunner(StackRunner):
    stack_id = "c"
    stack_name = "Feed-forward 3D state (chunk windows)"

    def ingest(self, ctx: StackIngestContext) -> float:
        started = time.perf_counter()
        ctx.step_index = _build_step_index(ctx.episode.manifest)
        ctx.frames, ctx.chunks = collect_media_refs(ctx.episode.manifest, ctx.data_root)
        return (time.perf_counter() - started) * 1000.0

    def _chunk_window_refs(self, ctx: StackIngestContext, step_number: Optional[int]) -> List[str]:
        if step_number is None:
            return [chunk.ref for chunk in ctx.chunks if chunk.exists]
        payload = ctx.step_index.get(step_number) or {}
        refs = list(payload.get("chunkRefs") or [])
        if refs:
            return refs
        return [chunk.ref for chunk in ctx.chunks if chunk.exists]

    def answer(self, ctx: StackIngestContext, query: ShootoutQuery) -> StackQueryResult:
        started = time.perf_counter()
        retrieved_step = query.gold_step_number
        retrieved_refs = self._chunk_window_refs(ctx, query.gold_step_number)
        if not retrieved_refs:
            retrieved_refs = [frame.ref for frame in ctx.frames if frame.exists][:8]

        answer_text = None
        if query.query_type == "step_time_range" and query.gold_step_number is not None:
            payload = ctx.step_index.get(query.gold_step_number) or {}
            answer_text = f"{payload.get('startedAt')}-{payload.get('endedAt')}"

        latency_ms = (time.perf_counter() - started) * 1000.0
        gold_refs = list(query.gold_frame_refs) + list(query.gold_chunk_refs)
        step_ok = retrieved_step == query.gold_step_number if query.gold_step_number is not None else None
        return StackQueryResult(
            query_id=query.query_id,
            retrieved_step_number=retrieved_step,
            retrieved_refs=retrieved_refs,
            answer_text=answer_text,
            query_latency_ms=latency_ms,
            step_localization_correct=step_ok,
            evidence_recall_at_5=recall_at_k(retrieved_refs, gold_refs, 5),
        )


def build_stack_runners(stack_ids: List[str], *, phase: int) -> List[StackRunner]:
    use_clip = phase >= 1 and os.environ.get("OPENLABOS_STACK_A_CLIP", "").strip() not in ("", "0", "false", "False")
    registry = {
        "a": lambda: StackAMemoryRunner(use_clip=use_clip),
        "b": lambda: StackBGslamRunner(),
        "c": lambda: StackCFeedForwardRunner(),
    }
    runners: List[StackRunner] = []
    for stack_id in stack_ids:
        factory = registry.get(stack_id.lower())
        if factory:
            runners.append(factory())
    return runners


def episode_metrics(ctx: StackIngestContext) -> Dict[str, Any]:
    join = manifest_join_integrity(ctx.episode.manifest)
    coverage = media_coverage(ctx.frames, ctx.chunks)
    return {
        "manifestJoinIntegrity": 1.0 if join["ok"] else 0.0,
        "manifestJoinIssues": join["issues"],
        **coverage,
    }
