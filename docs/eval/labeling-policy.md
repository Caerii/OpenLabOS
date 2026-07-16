# Labeling policy (MVP)

This policy defines how humans label clips into the **frozen JSONL dataset** used by `services/eval`.

## Core principle

When evidence is insufficient, **label conservatively**:

- prefer `action_detected: null` over guessing
- prefer `possible_issue: null` over guessing
- set `step_complete: false` unless you can clearly see completion

## Field definitions

### `objects_seen` (set)

Include an object id if the object is **clearly visible** in at least one frame for the clip.

- Do not include objects you infer are present but cannot see.
- `objects_seen` is a set; order does not matter.

### `action_detected`

Set to the single action id if the clip shows that action clearly; otherwise `null`.

If the clip contains multiple actions, label the **dominant** action for the step or set `null` if ambiguous.

### `step_complete`

`true` only if the step’s success condition is clearly satisfied by the end of the clip.

If the clip is too short or the view is occluded, set `false`.

### `possible_issue`

`null` if no issue is detected.

If an issue is detected, choose one of the closed issue ids. If you cannot commit to a specific issue type, use `other`.

## Ambiguity handling

- Occluded/unclear: do not guess structured fields.
- Prefer `null` for `action_detected` and `possible_issue` if uncertain.
- Prefer `step_complete: false` unless the evidence is clear.

## Immutability policy (critical)

Once a **test split** has been used to generate a baseline report, it must not change.

- If labels must change due to a confirmed labeling error, create a **new dataset version** (new freeze id).

