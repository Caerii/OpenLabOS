# 0014 — Media storage layout

- Status: accepted
- Scope: `services/api`, `services/inference`, `services/training`

## Context

Frames, sensor snapshots, recorded audio, and rendered judgment overlays
all live for a long time and travel between services. If we don't pin a
layout, every consumer invents a different path scheme and the references
in old manifests rot.

## Decision

A single canonical layout, identical between Tier 1 (filesystem) and
Tier 2 (object store):

```
data/
  sessions/
    <session_id>/
      manifest.json                   the RunManifest, written at finalize
      events.jsonl                    append-only event log
      frames/
        <step_id>/<frame_seq>.jpg     1-indexed within step
      sensors/
        <step_id>/<frame_seq>.json    aligned with frame_seq when present
      judgments/
        <judgment_id>.json
      audio/
        cues/<step_id>.mp3            cue payload sent to the operator
        capture/<step_id>.opus        rolling capture per step (optional)
      overlays/
        <step_id>/<frame_seq>.png     model annotations, lazily rendered
  protocols/
    <protocol_id>/<version>/protocol.json
  datasets/
    <dataset_hash>/                   immutable training artefacts
```

URIs in events and judgments are absolute (`file://…` or `s3://…`); never
relative paths. The repository layer is the only place that constructs
these.

## Consequences

- Old manifests resolve forever; nothing under a session id ever moves.
- Bulk export is `tar`-friendly: one folder is one self-contained run.
- A migration to Tier 2 is a `s3 cp -r` and a config flip, not a rewrite.

## Alternatives considered

- **Database BLOB storage.** Inflates the database, complicates backup,
  and does not solve the long-term-stability problem.
- **Per-service path schemes.** What we left behind. Six string patterns
  for six readers — unsustainable.
