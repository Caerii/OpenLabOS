from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional


@dataclass(frozen=True)
class ShootoutQuery:
    query_id: str
    run_id: str
    query_type: str
    prompt: str
    gold_step_number: Optional[int]
    gold_frame_refs: tuple[str, ...]
    gold_chunk_refs: tuple[str, ...]
    gold_started_at: Optional[float]
    gold_ended_at: Optional[float]
    gold_answer: Optional[str] = None


def _segment_instruction(segment: Dict[str, Any]) -> str:
    instruction = segment.get("stepInstruction")
    if isinstance(instruction, str) and instruction.strip():
        return instruction.strip()
    step_number = segment.get("stepNumber")
    return f"protocol step {step_number}"


def _string_refs(value: Any) -> List[str]:
    if not isinstance(value, list):
        return []
    return [str(item) for item in value if isinstance(item, str) and item]


def build_query_suite(run_id: str, manifest: Dict[str, Any]) -> List[ShootoutQuery]:
    queries: List[ShootoutQuery] = []
    segments = [seg for seg in (manifest.get("stepSegments") or []) if isinstance(seg, dict)]

    for segment in segments:
        step_number = segment.get("stepNumber")
        if not isinstance(step_number, int):
            continue
        segment_id = str(segment.get("id") or f"step{step_number}")
        frame_refs = tuple(_string_refs(segment.get("frameRefs")))
        chunk_refs = tuple(_string_refs(segment.get("chunkRefs")))
        started_at = segment.get("startedAt")
        ended_at = segment.get("endedAt")
        started = float(started_at) if isinstance(started_at, (int, float)) else None
        ended = float(ended_at) if isinstance(ended_at, (int, float)) else None
        instruction = _segment_instruction(segment)

        queries.append(
            ShootoutQuery(
                query_id=f"{run_id}:{segment_id}:instruction",
                run_id=run_id,
                query_type="step_instruction",
                prompt=f"What is the instruction for step {step_number}?",
                gold_step_number=step_number,
                gold_frame_refs=frame_refs,
                gold_chunk_refs=chunk_refs,
                gold_started_at=started,
                gold_ended_at=ended,
                gold_answer=instruction,
            ),
        )
        queries.append(
            ShootoutQuery(
                query_id=f"{run_id}:{segment_id}:evidence",
                run_id=run_id,
                query_type="step_evidence",
                prompt=f"Show visual evidence for step {step_number}: {instruction}",
                gold_step_number=step_number,
                gold_frame_refs=frame_refs,
                gold_chunk_refs=chunk_refs,
                gold_started_at=started,
                gold_ended_at=ended,
            ),
        )
        if started is not None and ended is not None:
            queries.append(
                ShootoutQuery(
                    query_id=f"{run_id}:{segment_id}:time_range",
                    run_id=run_id,
                    query_type="step_time_range",
                    prompt=f"When did step {step_number} occur?",
                    gold_step_number=step_number,
                    gold_frame_refs=frame_refs,
                    gold_chunk_refs=chunk_refs,
                    gold_started_at=started,
                    gold_ended_at=ended,
                    gold_answer=f"{started}-{ended}",
                ),
            )

    for index, annotation in enumerate(manifest.get("vqaAnnotations") or []):
        if not isinstance(annotation, dict):
            continue
        step_number = annotation.get("stepNumber")
        if not isinstance(step_number, int):
            continue
        step_id = str(annotation.get("stepId") or f"step{step_number}")
        questions = annotation.get("questions") or []
        if not isinstance(questions, list):
            continue
        for q_index, question in enumerate(questions):
            if not isinstance(question, dict):
                continue
            prompt = question.get("question") or question.get("prompt")
            answer = question.get("answer") or question.get("goldAnswer")
            if not isinstance(prompt, str) or not prompt.strip():
                continue
            queries.append(
                ShootoutQuery(
                    query_id=f"{run_id}:vqa:{index}:{q_index}",
                    run_id=run_id,
                    query_type="vqa_gold",
                    prompt=prompt.strip(),
                    gold_step_number=step_number,
                    gold_frame_refs=tuple(),
                    gold_chunk_refs=tuple(),
                    gold_started_at=None,
                    gold_ended_at=None,
                    gold_answer=str(answer).strip() if answer is not None else None,
                ),
            )

    return queries
