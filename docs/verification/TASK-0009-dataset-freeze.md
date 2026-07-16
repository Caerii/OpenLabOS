# TASK-0009: dataset-freeze

## Scope

Implement an explicit local workflow for:

- exporting deterministic candidate clips for labeling
- validating labeled datasets in the **TASK-0008** JSONL format
- freezing train/val/test splits into `data/splits/` with a machine-readable `manifest.json`

No labeling UI, no training, no cloud tools.

## Files created / changed (key)

- `services/eval/labos_eval/dataset_freeze.py`
- `services/eval/labos_eval/run_metrics.py` (adds `dataset` subcommands)
- `docs/eval/labeling-policy.md`
- `docs/eval/dataset-spec.md` (note: provenance lives in manifest)
- `docs/journals/day-09.md`

## CLI workflow

### 1) Export candidates

From `services/eval`:

```bash
uv run labos-eval-metrics dataset export-candidates --sqlite ..\\..\\apps\\api\\var\\labos_sessions.sqlite --dataset-name kitchen-demo
```

Default output:

```text
data/labels/candidates/kitchen-demo/candidates.jsonl
```

Candidate rows include relative media refs (`clip_relative_path`, `frames_relative_dir`) plus ids and time bounds.

### 2) Create in-progress split label files

Manually create:

- `train.jsonl`
- `val.jsonl`
- `test.jsonl`

Each line must match `docs/eval/dataset-spec.md`.

### 3) Validate

```bash
uv run labos-eval-metrics dataset validate --sqlite ..\\..\\apps\\api\\var\\labos_sessions.sqlite --train train.jsonl --val val.jsonl --test test.jsonl
```

Validation includes:
- schema + closed vocab
- no duplicates within split
- no overlap across splits
- clip ids exist in DB (default on)

### 4) Freeze

```bash
uv run labos-eval-metrics dataset freeze --sqlite ..\\..\\apps\\api\\var\\labos_sessions.sqlite --dataset-name kitchen-demo --freeze-id 20260422-initial --train train.jsonl --val val.jsonl --test test.jsonl
```

Output:

```text
data/splits/kitchen-demo/20260422-initial/
  train.jsonl
  val.jsonl
  test.jsonl
  manifest.json
```

Freeze refuses to overwrite an existing directory unless `--force` is provided.

## Policies

- Test split is immutable once a baseline report exists; new revisions require a new freeze id.

