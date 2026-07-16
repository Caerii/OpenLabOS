"""Vision-language model loading helpers for LabOS training.

The primary model target is Qwen/Qwen3.5-9B. Qwen2.5-VL remains supported as a
smaller smoke-test baseline, but callers should not import a Qwen2.5-specific
class directly anymore.
"""

from __future__ import annotations

from typing import Any

DEFAULT_VLM_MODEL_ID = "Qwen/Qwen3.5-9B"
SMOKE_TEST_VLM_MODEL_ID = "Qwen/Qwen2.5-VL-3B-Instruct"


def _candidate_model_class_names(model_id: str) -> list[str]:
    model_l = model_id.lower()
    if "qwen2.5" in model_l or "qwen2_5" in model_l:
        return [
            "Qwen2_5_VLForConditionalGeneration",
            "AutoModelForImageTextToText",
            "AutoModelForVision2Seq",
            "AutoModelForCausalLM",
        ]
    return [
        "AutoModelForImageTextToText",
        "AutoModelForVision2Seq",
        "AutoModelForCausalLM",
    ]


def load_vlm_for_generation(model_id: str, **kwargs: Any) -> Any:
    """Load a Qwen-family VLM using the best available Transformers entrypoint."""
    import transformers

    errors: list[str] = []
    for class_name in _candidate_model_class_names(model_id):
        model_cls = getattr(transformers, class_name, None)
        if model_cls is None:
            errors.append(f"{class_name}: unavailable in installed transformers")
            continue
        try:
            return model_cls.from_pretrained(model_id, **kwargs)
        except Exception as e:
            errors.append(f"{class_name}: {e}")

    raise RuntimeError(
        f"Failed to load VLM model {model_id!r}. Tried: "
        + "; ".join(errors)
        + ". For Qwen3.5, use a recent Transformers build or serve the model through vLLM/SGLang.",
    )


__all__ = ["DEFAULT_VLM_MODEL_ID", "SMOKE_TEST_VLM_MODEL_ID", "load_vlm_for_generation"]
