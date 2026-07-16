# A Literate Architecture of OpenLabOS

> *Read this top-to-bottom and you will know how OpenLabOS thinks. Each section
> tells one story; each diagram is a sentence in that story.*

## 1. The thing we are building

A laboratory protocol is a sequence of small, observable acts: *place this on
that, pour that into this, wait, measure, record.* When you watch a careful
operator at the bench, almost all of the work is happening at the level of
visible objects on visible surfaces. OpenLabOS is the substrate that turns a
camera pointed at a bench — plus a model that can describe what it sees — into
a system that knows when the operator has done the next step, and can say so
in time to be useful.

The system has four jobs:

> Tell the operator what to do next, watch them try, decide whether they
> succeeded, and remember what happened so we can do it better next time.

That is the entire product. Everything else is plumbing.

## 2. Why a monorepo, and why these languages

The natural shape of this work is polyglot. Web UI is best in TypeScript. ML
is best in Python. Device-side code is whatever the device speaks. A monorepo
is the only place where a change to a shared schema can land atomically across
all three.

We use **pnpm** for the JavaScript/TypeScript workspace and **uv** for each
Python project. Turbo coordinates builds across the TS half. The Python halves
are independent uv projects so they can pin different ML dependencies without
fighting. The cost is a small bootstrapping ritual; the benefit is that each
service evolves at its own cadence without dragging the others behind it.

## 3. The protocol schema is the spine

If you read only one folder of this repository, read `packages/protocol`.
Everything else is an interpreter of it.

A `Protocol` is a list of `Step`s. A `Step` declares the objects it expects to
see, the action the operator is about to perform, and a list of
`SuccessCriteria` — each a small typed predicate the system can evaluate
against the scene. A `Session` is one operator running one `Protocol` once,
producing an append-only list of `SessionEvent`s. A `Judgment` is the model's
verdict on one `Frame` against one `Step`. A `RunManifest` closes over the
session: protocol hash, every event, every judgment, every artifact pointer.

These are the only nouns the rest of the system is allowed to invent contracts
around. They are defined once, in TypeScript with Zod, and **generated** —
never re-typed — into Python via JSON Schema codegen during `uv sync`. If
those generated files diverge from the source, the build breaks, on purpose.

## 4. The four planes again, slowly

The repository's services partition into four planes, in order of how often
they run.

**The Presentation plane** runs on the operator's device. It shows the next
step, captures frames, and streams them outward. It does not know how
judgments are produced — only how to display them. The web app is a React +
Vite + TypeScript single-page app. The reference device app is a small
Android client; other devices are adapters.

**The Coordination plane** runs as `services/api`. It is a Hono server that
holds the *truth* about a session: which protocol is active, which step is
current, which artifacts belong to which session. It is forbidden from calling
a model or speaking a device wire protocol; it is not interesting on purpose.
This is where reliability lives.

**The Reasoning plane** runs as `services/inference` and `services/perception`.
Inference is a Python FastAPI service that owns one job: given a step and a
frame, return a `Judgment`. It hides the routing between cloud providers,
local runtimes (Ollama, LM Studio, vLLM) and any specialised reasoner you
plug in. Perception is the cheaper sibling: segmentations, trackers, spatial
summaries — small models that prepare evidence for the larger ones.

**The Learning plane** runs as `services/training` and `services/eval`.
Training consumes manifests, freezes datasets, and runs SFT / DPO / GRPO /
judgment-LoRA jobs. Eval consumes the resulting checkpoints (or any judgment
producer at all, including humans) and produces metric reports. Neither plane
runs in the request path; both are reproducible from a manifest hash.

## 5. The device is an adapter

The easiest way to ruin a system like this is to bake a particular device into
its core: route paths that mention a specific HMD, package names that hint at
a vendor, prebuilt artefacts that only run on one rig. OpenLabOS refuses that
trap. Devices are polymorphic: an adapter
is a small package that exposes a `DeviceAdapter` interface (capabilities,
preview stream, sensor stream, shell). The Coordination plane talks to
adapters by ID; it does not know whether the adapter is an Android phone, a
laptop webcam, a ROS 2 station, or a serial-attached fixture. Adding a new
device family is a new package under `adapters/`, not a change to the API.

## 6. Modules are how labs add their world

A *module* is a package that contributes vocabulary (object kinds, actions,
reagents) and prompt fragments to the reasoning plane. We ship a small set
(`biotech`, `chemistry`, `materials`, `field-bio`, `nanotech`) as references.
A lab with private workflows ships its own module package without forking
core. Modules cannot patch the protocol schema; they can only register new
success-criterion *kinds* with a Zod validator and a verifier.

This rule is the whole reason a closed-world DSL still feels open.

## 7. Telemetry is non-optional

OpenTelemetry is initialised at the first line of every service. A
`protocol_run_id` propagates from web → api → inference → perception so a
single run is one waterfall. Without this, a confusing judgment has no
explanation; with it, you click into a trace and see the model call, the
prompt, the segmentation evidence, and the criterion evaluation in the order
they happened.

## 8. Reproducibility is a *property*, not a slogan

Every training run takes a frozen dataset hash, a protocol version, and a base
model id, and emits a manifest. Eval consumes that manifest. A reviewer asks
"which run produced this number" and the answer is one hash. We commit
representative manifests as test fixtures so a regression in a downstream
component shows up as a diff, not a story.

## 9. What we deliberately do not do

We do not host models for users; you bring your own weights or your own
provider keys. We do not build hardware; we adapt to yours. We do not run a
SaaS; we publish what you would self-host. We do not keep a hidden config
plane that production depends on; the open-source repo is the production
artefact.

## 10. How to read the rest of the docs

Architecture lives here in `docs/architecture/`. Decisions live in
`docs/decisions/`. Operations live in `docs/runbooks/`. Per-service contracts live
next to their services in `services/<name>/README.md`. Tests are described in
`docs/TESTING.md` and the catalog is in `docs/test-catalog.md`.

If you ever feel lost, come back to *Section 1* of this file and remember
what the system is for. Almost every design choice falls out of those four
sentences.
