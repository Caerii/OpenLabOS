from __future__ import annotations

from openlabos_eval import hybrid_validator as hybrid


def _judgment(
    *,
    action: str | None,
    complete: bool,
    issue: str | None,
    objects: list[str] | None = None,
):
    return hybrid.JudgmentRow(
        judgment_id="j",
        session_id="s",
        clip_id="c",
        step_id="pour-water-into-mug",
        judgment_schema_version="1",
        objects_seen=objects or ["mug"],
        action_detected=action,
        step_complete=complete,
        possible_issue=issue,
        confidence=0.9,
        reason="test",
        model_id="m",
        created_at="2026-05-02T00:00:00+00:00",
    )


def _constraint():
    return hybrid.StepConstraint(
        step_id="pour-water-into-mug",
        expected_action="pour",
        allowed_issues=frozenset({"missing_object", "spill"}),
        expected_objects=frozenset({"mug", "kettle"}),
    )


def test_sft_action_wins_when_it_matches_expected_action():
    baseline = _judgment(action=None, complete=False, issue=None)
    sft = _judgment(action="pour", complete=True, issue=None)

    action, rule = hybrid._choose_action(baseline=baseline, sft=sft, constraint=_constraint())

    assert action == "pour"
    assert rule == "sft_action_matches_expected_action"


def test_protocol_allowed_issue_forces_incomplete():
    baseline = _judgment(action=None, complete=True, issue="spill")
    sft = _judgment(action="pour", complete=True, issue=None)

    issue, _issue_rule = hybrid._choose_issue(baseline=baseline, constraint=_constraint())
    complete, rule = hybrid._choose_step_complete(
        baseline=baseline,
        sft=sft,
        chosen_issue=issue,
        chosen_action="pour",
        constraint=_constraint(),
    )

    assert issue == "spill"
    assert complete is False
    assert rule == "protocol_allowed_issue_forces_incomplete"


def test_out_of_protocol_baseline_issue_can_be_dropped_and_sft_completion_used():
    baseline = _judgment(action=None, complete=False, issue="other")
    sft = _judgment(action="pour", complete=True, issue="spill")

    issue, issue_rule = hybrid._choose_issue(baseline=baseline, constraint=_constraint())
    action, action_rule = hybrid._choose_action(baseline=baseline, sft=sft, constraint=_constraint())
    complete, complete_rule = hybrid._choose_step_complete(
        baseline=baseline,
        sft=sft,
        chosen_issue=issue,
        chosen_action=action,
        constraint=_constraint(),
    )

    assert issue is None
    assert issue_rule == "baseline_issue_dropped_not_protocol_failure_mode"
    assert action == "pour"
    assert action_rule == "sft_action_matches_expected_action"
    assert complete is True
    assert complete_rule == "sft_complete_expected_action_overrides_baseline_out_of_protocol_issue"
