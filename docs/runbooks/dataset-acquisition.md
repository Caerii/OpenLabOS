# Runbook: Dataset acquisition for Qwen3.5 live vision

This runbook defines the clean acquisition path for testing **Qwen/Qwen3.5-9B** on step-conditioned kitchen judgments.

For the researched external egocentric dataset shortlist, see:

- `docs/runbooks/egocentric-dataset-shortlist.md`

## Goal

Build a dataset that is useful for three things at once:

- short-clip video comprehension with **Qwen3.5-9B**
- high-quality teacher labels from **Gemini Robotics ER 1.6**
- later **SFT / preference / GRPO** training loops without redoing ingestion

## Recommended source order

### 1. First-party LabOS captures

This remains the highest-value source.

- It exactly matches the POV, device optics, and task framing we care about.
- It contains the real failure modes we need to solve.
- It lets us compare `student vs teacher vs human` on the same clip inventory.

Use this repo's existing import path first for all real glasses captures:

```bash
python scripts/import_labos_data.py --labos-data "F:\Github\OpenLabOS\OpenLabOS\dashboard\data"
```

### 2. Task-targeted YouTube seeds

Use YouTube for fast coverage expansion of procedural behaviors that our own glasses data does not yet cover deeply.

Good primary targets are tutorial-style videos with an ordered procedure:

- complete teabag tea tutorials
- complete loose-leaf tea tutorials
- explicit numbered steps such as fill kettle, boil water, add tea bag, pour, steep, stir
- kettle + mug + tray co-visibility across multiple steps
- near-miss or wrong-order tutorials when available

This is best for:

- quick qualitative Qwen3.5 clip testing
- building teacher/student comparison pairs
- enriching visual diversity before we have enough first-party data

Isolated single-action videos, such as a close-up of stirring, are auxiliary action-recognition
sources only. Do not use them as the main protocol-extraction seed because they do not contain
enough ordered context for step-deviance judgment.

This repo now supports that path directly with:

```bash
cd services/training
uv run labos-ingest-video-sources ^
  --sources-csv ..\..\data\sources\youtube_tea_seed.csv ^
  --out-root ..\..\data\raw\youtube_qwen35_seed ^
  --fps 2 ^
  --clip-length-seconds 1.5 ^
  --clip-stride-seconds 0.75 ^
  --max-frames 12
```

### 3. Official egocentric datasets

These are the right way to add real first-person motion, hand-object interaction, and kitchen variation without relying only on our own recordings.

Keep the first external pass simple:

1. HoloAssist for physical-assistant mistakes/interventions.
2. EPIC-KITCHENS-100 for kitchen action/object grounding.
3. VISOR only if active-object/hand grounding remains a blocker.
4. Ego-Exo4D / Ego4D-family datasets only after the small pipeline is stable.

#### EGTEA Gaze+

Best small, high-signal option for kitchen procedure bootstrapping.

- Official source: https://cbs.ic.gatech.edu/fpv/
- Contains **28 hours** of egocentric cooking activities from **86 sessions** and **32 subjects**
- Includes **10,325** fine-grained action annotations
- Includes meal preparation activities and short object-action clips

Why it matters here:

- closest fit to tea / food-prep style hand-object actions
- manageable size
- good for early action-sensitive clip evaluation

#### EPIC-KITCHENS-100

Best large kitchen-specific egocentric source.

- Official source: https://epic-kitchens.github.io/
- Official EPIC-KITCHENS-100 page: https://epic-kitchens.github.io/2020-100
- Contains **100 hours** of unscripted egocentric kitchen video
- About **89.9K** action segments across **45 kitchens**

Why it matters here:

- strong kitchen realism
- dense action boundaries
- large enough to stress-test generalization

#### Ego4D

Best broad first-person world model source.

- Official source: https://ego4d-data.org/
- Docs: https://ego4d-data.org/docs/
- Contains over **3,600 hours** of egocentric video

Why it matters here:

- excellent for broad hand-object and motion diversity
- useful once we move beyond kitchen-only visual priors
- less kitchen-focused than EPIC-KITCHENS / EGTEA, so use selectively

#### Ego-Exo4D

Useful secondary source when we want paired ego/exo procedural activities.

- Official docs: https://docs.ego-exo4d-data.org/

Why it matters here:

- includes procedural activities such as cooking
- useful for future cross-view supervision and visualization
- not the first dataset to ingest for tea-step judgments

### 4. YouCook2

Third-person cooking only. Use as auxiliary data, not as the backbone.

- Official source: https://youcook2.eecs.umich.edu/
- Contains **176 hours** across **2,000** YouTube cooking videos and **89 recipes**

Why it matters here:

- helpful for recipe step diversity and clip segmentation experiments
- viewpoint mismatch means it should not dominate training data for glasses inference

## Acquisition policy

### Manual-approval datasets

For **Ego4D**, **Ego-Exo4D**, and often **EPIC-KITCHENS**, you should:

1. accept the official license terms
2. download the official files manually or with their official tooling
3. keep the raw videos outside git
4. ingest only the relevant local video paths into this repo's manifests

Do not try to bolt license-gated datasets into an ad hoc downloader.

### YouTube seeds

For YouTube-derived sources:

- curate a small, auditable CSV first
- keep notes on why each source was chosen
- prefer short procedural videos with visible hands and objects
- avoid using YouTube as the only data source

## Ingestion contract

The generalized ingester accepts both downloaded URLs and already-local videos.

CSV columns:

- required: `url` or `local_path`
- optional: `source`, `query`, `split`, `protocol_id`, `recipe`, `step_hint`, `label_hint`, `notes`

Outputs:

- `videos/` copied or downloaded originals
- `clips/` short MP4 windows for native video-comprehension evaluation
- `frames/` sampled JPEGs per clip
- `manifests/sources.jsonl` one record per source video and its source-level metadata
- `manifests/samples.jsonl` one record per clip window, referencing `source_id`
- `manifests/frames.jsonl` one minimal record per frame, referencing `sample_id` and `source_id`

Keep manifests normalized. Do not repeat source title, uploader, URL, protocol, recipe, or notes on every frame row. Join by `source_id` and `sample_id` when building eval tables or dashboard static assets.

## Qwen3.5 clip policy

`Qwen/Qwen3.5-9B` supports native video inputs, and official/open deployments show it can be used on recurring live video clips. For this repo, start conservative and explicit:

- static presence checks: single frame or low-rate polling
- default clip testing: **1.0 to 1.5s** clips at **2 FPS**
- action-sensitive steps like `pour` and `stir`: **4 to 6 FPS**
- cap sampled frames per clip around **8 to 12** for latency discipline

This keeps the dataset aligned with the real inference loop we want to build, instead of collecting arbitrary long-form videos that are expensive to evaluate.

## Recommended first acquisition pass

1. Import all existing LabOS glasses captures.
2. Build a small YouTube seed CSV for tea/coffee-specific steps.
3. Download **EGTEA Gaze+** and ingest only the cooking activities we care about.
4. Add a selective **EPIC-KITCHENS-100** subset for extra kitchen diversity.
5. Hold **Ego4D** and **YouCook2** as expansion sources once the first evaluation harness is stable.

## References

- Qwen3.5-9B official model card: https://huggingface.co/Qwen/Qwen3.5-9B
- Ego4D: https://ego4d-data.org/
- Ego4D docs: https://ego4d-data.org/docs/
- Ego-Exo4D docs: https://docs.ego-exo4d-data.org/
- EPIC-KITCHENS: https://epic-kitchens.github.io/
- EPIC-KITCHENS-100: https://epic-kitchens.github.io/2020-100
- EGTEA Gaze+: https://cbs.ic.gatech.edu/fpv/
- YouCook2: https://youcook2.eecs.umich.edu/
