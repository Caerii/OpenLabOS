# Egocentric Dataset Shortlist For LabOS VLM Training

Last researched: 2026-05-02

This document lists external datasets that are useful for improving LabOS step validation without making the data system hard to understand. The goal is not to ingest everything. The goal is to pick a few standard, well-documented sources and map them into the existing LabOS training data contract.

## Recommendation

Use this order:

1. **First-party LabOS captures**: always highest value because they match our device, protocol, and failure modes.
2. **HoloAssist**: best external source for real-world egocentric assistant behavior, interventions, and mistake detection.
3. **EPIC-KITCHENS-100 + VISOR**: best external source for kitchen hand-object actions and object grounding.
4. **Ego-Exo4D**: use selectively for procedural activities, keysteps, expert commentary, and cross-view context.
5. **Ego4D / EgoSchema**: use for broad egocentric pretraining/evaluation, not as the first demo dataset.

Do not start by downloading several terabytes or trying to normalize every dataset. Start with small, auditable subsets and keep a manifest-only ingestion path.

## Shortlist

| Priority | Dataset | Best use for LabOS | Why it fits | Main caution |
|---|---|---|---|---|
| A | HoloAssist | Mistake detection, intervention prediction, physical assistant behavior | Egocentric mixed-reality captures where an instructor guides a performer through physical manipulation tasks | Not lab-specific; task set must be filtered |
| A | EPIC-KITCHENS-100 | Kitchen action/object grounding | Unscripted egocentric kitchen videos with dense action annotations | Non-commercial/license constraints; kitchen domain only |
| A | EPIC-KITCHENS VISOR | Hand/object segmentation and active-object grounding | Pixel annotations for hands and active objects over EPIC-KITCHENS videos | Segmentation labels add complexity; use only for object grounding |
| B | Ego-Exo4D | Procedural keysteps, expert commentary, paired ego/exo context | Skilled procedural tasks include cooking, bike repair, and health; annotations include procedural dependencies | Large and multimodal; too complex for first ingestion |
| B | Ego4D | Broad egocentric robustness and long-form understanding | Largest broad egocentric benchmark suite with narrations and diverse scenarios | Broad domain; needs selective filtering |
| B | EgoSchema | Long-form egocentric VQA evaluation | 5K+ curated multiple-choice questions over Ego4D-derived clips | Evaluation only; not direct step-validation training data |
| B | Assembly101 | Procedural action segmentation and mistake detection | Assembly/disassembly with egocentric views, fine-grained actions, mistakes, hand pose | Toy assembly, not kitchen/lab; non-commercial license |
| C | EGTEA Gaze+ | Small kitchen/cooking action bootstrap | Manageable egocentric cooking/gaze/action dataset | Older/smaller; verify official access and license before use |
| C | EgoTaskQA | Task reasoning, causal dependencies, state-transition QA | Targets action effects, dependencies, intent, and beliefs in egocentric tasks | QA benchmark, not direct visual judgment labels |
| C | EgoObjects | Object detection and instance grounding | Large egocentric object dataset with fine-grained object annotations | Object-centric, not procedural |
| Defer | Charades-Ego | Indoor action/domain robustness | Paired first/third-person indoor activities and temporal labels | Scripted daily activities; less aligned with procedural lab/kitchen steps |

## Dataset Notes

### HoloAssist

Use for:

- mistake detection
- intervention timing
- physical task assistance
- failure/correction examples
- hand, gaze, depth, IMU, and speech-conditioned assistant behavior

Why:

- HoloAssist is explicitly about interactive AI assistants for physical-world tasks.
- It has egocentric captures from a task performer wearing a mixed-reality headset.
- The instructor watches the performer view in real time and gives verbal guidance.
- The project page reports 169 hours from 350 instructor-performer pairs.
- It provides train/val/test splits and labels.
- The project page lists a permissive CDLAv2 license.

LabOS mapping:

- Map action annotations to `action_detected`.
- Map mistakes/interventions to `possible_issue` and `step_complete`.
- Use transcript snippets as candidate rationale text, not as ground truth by itself.

Start small:

- ingest labels first
- sample compressed RGB videos only
- ignore depth/hand/gaze streams until the RGB pipeline is stable

### EPIC-KITCHENS-100

Use for:

- kitchen object/action recognition
- action detection
- action anticipation
- domain diversity across kitchens and participants

Why:

- EPIC-KITCHENS-100 is the strongest kitchen-specific egocentric source.
- The official paper reports 100 hours, 20M frames, about 90K action segments, 700 videos, and 45 kitchen environments.
- The official dataset landing page reports 89.9K actions, 20.5K narrations, and 4.0K action classes.

LabOS mapping:

- Map verb labels to `action_detected`.
- Map noun labels to `objects_seen`.
- Use action segment boundaries to create short clips.
- Do not map recipe intent directly to `step_complete`; use it only as context.

Start small:

- choose tea/coffee/water/mug/kettle/spoon/cup/tray-adjacent clips first
- keep one source manifest row per original video
- keep clip windows short and aligned to action segments

### EPIC-KITCHENS VISOR

Use for:

- hand segmentation
- active-object segmentation
- contact-aware object grounding
- reducing object hallucination in VLM judgments

Why:

- VISOR builds on EPIC-KITCHENS with pixel annotations for hands and active objects.
- The landing page reports 271K manual masks, 9.9M dense masks, 257 objects, and 67K hand relations.

LabOS mapping:

- Use VISOR as an auxiliary object/hand grounding source.
- Convert masks to simple object-presence labels first.
- Do not introduce mask training into the main VLM loop until the judgment path is stable.

### Ego-Exo4D

Use for:

- procedural keystep understanding
- cross-view supervision
- expert commentary and proficiency signals
- future multi-view validation or coaching

Why:

- Ego-Exo4D is synchronized egocentric/exocentric video of skilled human activities.
- The docs describe procedural activities including cooking, bike repair, and health.
- V2 reports 1286.30 video hours, 221.26 ego-hours, and 5035 takes.
- The docs list narrations, play-by-play descriptions, expert commentary, object segmentation masks, keysteps, procedural dependencies, and proficiency ratings.

LabOS mapping:

- Map keysteps to protocol steps.
- Map procedural dependencies to step-order validation.
- Use expert commentary as teacher context for rationales and failure analysis.

Start small:

- use only procedural categories first: cooking, bike repair, health
- avoid full multimodal ingestion until RGB/video labels are useful

### Ego4D

Use for:

- broad egocentric robustness
- long-form video understanding
- hand-object and daily activity diversity
- pretraining/evaluation once LabOS-specific evaluation is stable

Why:

- Ego4D docs describe it as a large egocentric dataset and benchmark suite with 3,600+ hours of densely narrated first-person video across daily-life scenarios.
- It includes benchmarks and annotations across multiple egocentric tasks.

LabOS mapping:

- Use narrations to create weak action/object labels.
- Use GoalStep-style annotations, when relevant, as a source of coarse step/goal structure.
- Keep Ego4D as broad background data, not as the main tea/lab judgment dataset.

### EgoSchema

Use for:

- evaluating long-horizon egocentric video reasoning
- checking whether a VLM can answer questions over multi-minute clips

Why:

- EgoSchema is derived from Ego4D.
- The project page reports 5000+ human-curated multiple-choice QA pairs over 250+ hours of real video.
- Each question uses a three-minute video clip and five answer choices.

LabOS mapping:

- Use as evaluation for temporal reasoning, not direct SFT on `JudgmentResult`.
- Keep separate from kitchen/lab step-validation metrics.

### Assembly101

Use for:

- procedural action segmentation
- anticipation
- mistake detection
- hand-object manipulation transfer

Why:

- Assembly101 has 4321 videos of assembling/disassembling 101 toys.
- It includes simultaneous static and egocentric recordings.
- The project reports more than 100K coarse action segments, 1M fine-grained action segments, and 18M 3D hand poses.
- Mistake detection annotations are available.

LabOS mapping:

- Map fine-grained actions to `action_detected`.
- Map mistake annotations to `possible_issue`.
- Use only as transfer data for procedural manipulation, not as a kitchen/lab proxy.

### EGTEA Gaze+

Use for:

- small kitchen/cooking action bootstrap
- gaze-aware egocentric action examples

Why:

- Public summaries report 28 hours of de-identified cooking activities, 86 sessions, 32 subjects, and 10,325 fine-grained action instances.
- It is much smaller and easier to inspect than Ego4D-family datasets.

LabOS mapping:

- Map action annotations to `action_detected`.
- Use gaze only later; do not make it a required field in the core data contract.

Access caution:

- Verify the official access path and license before using it in any deliverable.

### EgoTaskQA

Use for:

- task reasoning evaluation
- causal dependency QA
- state-transition reasoning

Why:

- The NeurIPS paper targets action dependencies/effects, intents/goals, and agent beliefs in goal-oriented egocentric videos.
- Questions include descriptive, predictive, explanatory, and counterfactual types.

LabOS mapping:

- Use as a diagnostic QA benchmark.
- Do not mix QA labels directly into `JudgmentResult` SFT unless converted through a clear prompt/target adapter.

### EgoObjects

Use for:

- egocentric object detection
- fine-grained object instance grounding
- object-hallucination reduction

Why:

- The paper page reports over 9K videos, 250 participants, 50+ countries, 650K object annotations, 368 object categories, and 14K unique object instances.

LabOS mapping:

- Use for object-presence and object-detection pretraining/eval.
- Do not use it for step completion or protocol validation.

## Minimal Standard Ingestion Contract

Every external dataset should enter LabOS through the same thin contract:

```json
{
  "source_id": "epic-kitchens-100/P01_01",
  "dataset": "epic-kitchens-100",
  "license": "dataset-specific",
  "source_uri": "official-dataset-reference",
  "local_video_path": "external/epic-kitchens/videos/P01_01.mp4",
  "split": "train|val|test|holdout",
  "task_family": "kitchen_action|assistant_mistake|procedural_keystep|object_grounding|qa_eval",
  "notes": "curated subset reason"
}
```

Then derive clip rows:

```json
{
  "sample_id": "epic-kitchens-100/P01_01/clip-000123",
  "source_id": "epic-kitchens-100/P01_01",
  "clip_start_s": 123.4,
  "clip_end_s": 125.0,
  "frame_paths": ["..."],
  "label_projection": {
    "objects_seen": ["mug"],
    "action_detected": "pour",
    "step_complete": null,
    "possible_issue": null
  },
  "projection_status": "direct|weak|human_review_required"
}
```

Keep `step_complete` null unless the external dataset actually says the procedure was correct or incorrect. Action labels are not the same thing as successful protocol completion.

## Standard Practices

Use these rules to keep the system understandable:

1. Keep raw external datasets outside git.
2. Store only manifests, projections, and small reports in the repo.
3. Add `dataset`, `license`, `source_uri`, `source_id`, `sample_id`, and `projection_status` to every derived row.
4. Split by source video, capture run, participant, or task instance. Do not split adjacent clips from the same video across train/test.
5. Keep first-party LabOS captures as the authoritative evaluation set.
6. Treat external labels as weak labels until reviewed or validated against the LabOS schema.
7. Keep external dataset adapters small and dataset-specific. Normalize only into the canonical LabOS clip/label contract.
8. Start RGB-only. Add depth, gaze, hand pose, and IMU only when a specific metric needs them.
9. Document every transformation from external labels into `JudgmentResult` fields.
10. Report external-data results separately from first-party LabOS results.

## Recommended Near-Term Plan

No large download required yet:

1. Add this shortlist to the project docs.
2. Add a manifest schema for external dataset subsets.
3. Pick one HoloAssist compressed-video subset and one EPIC-KITCHENS/VISOR subset.
4. Project only three fields first: `objects_seen`, `action_detected`, and `possible_issue`.
5. Keep `step_complete` human-reviewed for LabOS captures only until external success/failure labels are reliable.

First actual ingestion pass:

1. HoloAssist labels + compressed RGB videos for mistake/intervention examples.
2. EPIC-KITCHENS-100 action segments for kitchen action/object diversity.
3. VISOR object/hand annotations only if object hallucination remains a blocker.

Expansion pass:

1. Ego-Exo4D procedural cooking/health/bike repair keysteps.
2. EgoSchema and EgoTaskQA as separate long-form/task-reasoning evals.
3. Assembly101 for procedural mistake detection transfer.
4. EgoObjects only for object grounding.

## References

- Ego4D docs: https://ego4d-data.org/docs/
- Ego-Exo4D docs: https://docs.ego-exo4d-data.org/
- EPIC-KITCHENS-100 paper: https://link.springer.com/article/10.1007/s11263-021-01531-2
- EPIC-KITCHENS dataset landing page and VISOR: https://epic-kitchens.github.io/VISOR/
- HoloAssist project page: https://holoassist.github.io/
- Assembly101 project page: https://assembly-101.github.io/
- EgoSchema project page: https://egoschema.github.io/
- EgoTaskQA NeurIPS page: https://papers.nips.cc/paper_files/paper/2022/hash/161c94a58ca25bafcaf47893e8233deb-Abstract-Datasets_and_Benchmarks.html
- EgoObjects paper page: https://huggingface.co/papers/2309.08816
- Charades / Charades-Ego project page: https://prior.allenai.org/projects/charades

