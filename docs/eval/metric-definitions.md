# Metric definitions (MVP)

All metrics operate at the **clip** level against frozen labels (one record per `clip_id`).

**Important:** we score only **structured judgment fields**. We do not score free-text `reason`.

## JSON / judgment validity rate

For each labeled clip:

- **valid** if a stored judgment exists for the clip and its structured fields are schema-valid / vocab-valid
- **invalid** if missing (no judgment for the clip), or if the latest stored row is malformed/unusable

In this harness, since predictions come from SQLite, this metric is reported as **`judgment_coverage_rate`** (schema-valid judgment coverage).

## Objects micro precision/recall/F1

`objects_seen` is treated as a set. We compute micro precision/recall/F1 over all object ids across all clips.

## Step completion accuracy

Exact match of `step_complete` boolean.

## Action detection accuracy

Exact match of `action_detected`, including `null`.

## Issue detection precision/recall/F1 (type-aware)

`possible_issue` is single-label (or null). Scoring is:

- gold null + pred null = TN
- gold null + pred non-null = FP
- gold non-null + pred null = FN
- gold non-null + pred non-null same type = TP
- gold non-null + pred non-null wrong type = FP + FN

