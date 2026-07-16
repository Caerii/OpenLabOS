from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
TRAINING_ROOT = ROOT / "services" / "training"
API_ROOT = ROOT / "services" / "api"
for path in (str(TRAINING_ROOT), str(API_ROOT), str(ROOT)):
    if path not in sys.path:
        sys.path.insert(0, path)

from openlabos_training.train_grpo import (
    compute_group_advantages,
    compute_grpo_policy_loss,
    score_candidate_text,
)


def test_score_candidate_text_rewards_perfect_judgment():
    target = {
        "step_id": "add-tea-bag",
        "judgment_schema_version": "1",
        "objects_seen": ["mug", "tea_bag"],
        "action_detected": "add",
        "step_complete": True,
        "possible_issue": None,
        "confidence": 0.9,
        "reason": "ok",
    }
    text = (
        '{"step_id":"add-tea-bag","judgment_schema_version":"1","objects_seen":["mug","tea_bag"],'
        '"action_detected":"add","step_complete":true,"possible_issue":null,"confidence":0.9,"reason":"ok"}'
    )

    result = score_candidate_text(text, target_step_id="add-tea-bag", target_json=target)

    assert result.parse_error is None
    assert result.components["schema_valid"] == 1.0
    assert result.components["step_id"] == 1.0
    assert result.components["step_complete"] == 1.0
    assert result.components["action_detected"] == 1.0
    assert result.components["possible_issue"] == 1.0
    assert result.components["objects_f1"] == 1.0
    assert result.score == 1.0


def test_score_candidate_text_zeroes_parse_failures():
    target = {
        "step_id": "add-tea-bag",
        "judgment_schema_version": "1",
        "objects_seen": ["mug", "tea_bag"],
        "action_detected": "add",
        "step_complete": True,
        "possible_issue": None,
        "confidence": 0.9,
        "reason": "ok",
    }

    result = score_candidate_text("not json", target_step_id="add-tea-bag", target_json=target)

    assert result.score == 0.0
    assert result.parse_error is not None
    assert all(value == 0.0 for value in result.components.values())


def test_group_advantages_center_rewards_within_group():
    adv = compute_group_advantages([0.1, 0.4, 0.7])

    assert len(adv) == 3
    assert round(sum(adv), 6) == 0.0
    assert adv[0] < adv[1] < adv[2]


def test_compute_grpo_policy_loss_prefers_higher_advantage_sequences():
    import torch

    rewards = [0.2, 0.5, 0.8]
    seq_mean_logprobs = [torch.tensor(-0.5), torch.tensor(-1.0), torch.tensor(-1.5)]

    loss, advantages = compute_grpo_policy_loss(seq_mean_logprobs, rewards=rewards)

    assert advantages[0] < advantages[1] < advantages[2]
    assert torch.isfinite(loss)
    expected = sum(-(advantages[i] * float(seq_mean_logprobs[i])) for i in range(3)) / 3.0
    assert loss.item() == round(expected, 7) or abs(loss.item() - expected) < 1e-6


def test_compute_grpo_policy_loss_applies_kl_penalty():
    import torch

    seq_mean_logprobs = [torch.tensor(-1.0), torch.tensor(-1.2)]
    ref_mean_logprobs = [torch.tensor(-1.4), torch.tensor(-1.3)]

    no_kl_loss, _ = compute_grpo_policy_loss(seq_mean_logprobs, rewards=[0.2, 0.8])
    kl_loss, _ = compute_grpo_policy_loss(
        seq_mean_logprobs,
        rewards=[0.2, 0.8],
        ref_mean_logprobs=ref_mean_logprobs,
        kl_beta=0.5,
    )

    assert torch.isfinite(no_kl_loss)
    assert torch.isfinite(kl_loss)
    assert kl_loss.item() != no_kl_loss.item()
