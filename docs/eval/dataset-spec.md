# Judged-clip dataset format

The evaluation tools read frozen JSONL files in this format. One line holds the
human label for one clip.

## Format

Use **JSONL** (one JSON object per line). Each line is one labeled example for one clip.

Required fields:

- `session_id` (string)
- `clip_id` (string)
- `step_id` (string)
- `objects_seen` (array of object ids; closed vocab)
- `action_detected` (action id or `null`)
- `step_complete` (boolean)
- `possible_issue` (issue id or `null`)

Optional fields:

- `dataset_schema_version` (string, default `"1"`) — for future-proofing the label format

Closed vocab (kitchen demo):

- objects: `mug`, `kettle`, `tea_bag`, `spoon`, `tray`
- actions: `place`, `pour`, `add`, `stir`
- issues: `missing_object`, `wrong_object`, `wrong_surface`, `spill`, `sequence_error`, `other`

Example line:

```json
{
  "dataset_schema_version": "1",
  "session_id": "f5258485-50a7-497c-ab97-02728cde54d9",
  "clip_id": "767dd4c9-7617-5a88-a3c3-66877d3008f9",
  "step_id": "place-mug-on-counter",
  "objects_seen": ["mug"],
  "action_detected": "place",
  "step_complete": true,
  "possible_issue": null
}
```

Notes:
- `objects_seen` is evaluated as a **set** (order does not matter).
- Labels are **frozen** for an eval run; do not mutate them in place during evaluation.
- Provenance (labeler, notes, freeze timestamp, hashes) belongs in the frozen dataset **manifest.json**, not per-row.

