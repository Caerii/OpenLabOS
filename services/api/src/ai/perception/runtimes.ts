import { buildRunPodCostGuardStatus, loadRunPodCostGuardConfig } from "../runpod/cost-guard.js";

export type PerceptionAdherenceRole =
  | "conversational_context"
  | "object_evidence"
  | "interaction_evidence"
  | "spatial_evidence"
  | "world_model"
  | "benchmarking";

export type PerceptionRuntimeKind =
  | "gemini-live"
  | "segmentation-sidecar"
  | "labclaw-skill"
  | "b3d-runtime"
  | "benchmark-toolkit";

export type PerceptionRuntimeReadiness =
  | "available"
  | "mock"
  | "configured"
  | "not_configured"
  | "deferred";

export interface PerceptionRuntimeCapability {
  id: string;
  name: string;
  kind: PerceptionRuntimeKind;
  source: {
    label: string;
    url: string;
    license?: string;
  };
  adherenceRole: PerceptionAdherenceRole;
  readiness: PerceptionRuntimeReadiness;
  runpodEligible: boolean;
  envKeys: string[];
  inputs: string[];
  outputs: string[];
  givesUs: string[];
  caveats: string[];
}

export interface PerceptionRuntimeStatus {
  configured: boolean;
  runpod: ReturnType<typeof buildRunPodCostGuardStatus>;
  endpoints: {
    unifiedRuntimeUrl?: string;
    segmentationSidecarUrl?: string;
    labclawVisionRuntimeUrl?: string;
    b3dRuntimeUrl?: string;
  };
  capabilities: PerceptionRuntimeCapability[];
  nextRuntimeSlice: string[];
}

function envValue(env: NodeJS.ProcessEnv, key: string) {
  return String(env[key] || "").trim() || undefined;
}

function hasAnyEnv(env: NodeJS.ProcessEnv, keys: string[]) {
  return keys.some((key) => !!envValue(env, key));
}

function segmentationReadiness(env: NodeJS.ProcessEnv): PerceptionRuntimeReadiness {
  const mode = String(env.LABOS_ENTITY_SEGMENTATION_MODE || "").trim().toLowerCase();
  if (mode === "off" || mode === "disabled" || mode === "none") return "not_configured";
  if (hasAnyEnv(env, ["LABOS_SEGMENTATION_SIDECAR_URL", "SEGMENTATION_SIDECAR_URL"])) return "configured";
  if (mode === "mock" || !mode) return "mock";
  return "not_configured";
}

function labclawVisionReadiness(env: NodeJS.ProcessEnv): PerceptionRuntimeReadiness {
  return hasAnyEnv(env, ["LABOS_LABCLAW_VISION_RUNTIME_URL", "LABOS_PERCEPTION_RUNTIME_URL"])
    ? "configured"
    : "not_configured";
}

function b3dReadiness(env: NodeJS.ProcessEnv): PerceptionRuntimeReadiness {
  return hasAnyEnv(env, ["LABOS_B3D_RUNTIME_URL", "LABOS_PERCEPTION_RUNTIME_URL"])
    ? "configured"
    : "not_configured";
}

export function buildPerceptionRuntimeStatus(env = process.env): PerceptionRuntimeStatus {
  const runpod = buildRunPodCostGuardStatus(loadRunPodCostGuardConfig(env));
  const unifiedRuntimeUrl = envValue(env, "LABOS_PERCEPTION_RUNTIME_URL");
  const segmentationSidecarUrl =
    envValue(env, "LABOS_SEGMENTATION_SIDECAR_URL") || envValue(env, "SEGMENTATION_SIDECAR_URL");
  const labclawVisionRuntimeUrl = envValue(env, "LABOS_LABCLAW_VISION_RUNTIME_URL") || unifiedRuntimeUrl;
  const b3dRuntimeUrl = envValue(env, "LABOS_B3D_RUNTIME_URL") || unifiedRuntimeUrl;

  const capabilities: PerceptionRuntimeCapability[] = [
    {
      id: "gemini-live-semantic-scene",
      name: "Gemini Live semantic scene context",
      kind: "gemini-live",
      source: {
        label: "Google Gemini Live",
        url: "https://ai.google.dev/gemini-api/docs/live",
      },
      adherenceRole: "conversational_context",
      readiness: hasAnyEnv(env, ["GOOGLE_GENERATIVE_AI_API_KEY", "GEMINI_API_KEY"]) ? "available" : "not_configured",
      runpodEligible: false,
      envKeys: ["GOOGLE_GENERATIVE_AI_API_KEY", "GEMINI_API_KEY"],
      inputs: ["microphone audio", "1 FPS JPEG frames", "current protocol step context"],
      outputs: ["spoken guidance", "soft visual description", "operator Q&A"],
      givesUs: [
        "Natural answers to questions like what do I do next.",
        "Coarse semantic awareness of visible objects and operator intent.",
        "Friendly recovery prompts when the view is unclear.",
      ],
      caveats: [
        "Use as soft context only; it should not be the pass/fail authority.",
        "It can miss fine-grained hand-object contact or hallucinate if frames are ambiguous.",
      ],
    },
    {
      id: "entity-segmentation",
      name: "Object/entity segmentation contract",
      kind: "segmentation-sidecar",
      source: {
        label: "OpenLabOS perception service",
        url: "services/perception",
      },
      adherenceRole: "object_evidence",
      readiness: segmentationReadiness(env),
      runpodEligible: true,
      envKeys: ["LABOS_SEGMENTATION_SIDECAR_URL", "SEGMENTATION_SIDECAR_URL", "LABOS_SEGMENTATION_SIDECAR_TOKEN"],
      inputs: ["JPEG frame", "object prompts", "session/frame ids"],
      outputs: ["entity labels", "boxes", "masks", "tracks", "missing prompts"],
      givesUs: [
        "Structured object presence evidence for protocol steps.",
        "Masks/tracks that can be recorded as replayable adherence evidence.",
      ],
      caveats: ["Mock mode validates API shape only; real evidence needs the sidecar."],
    },
    {
      id: "labclaw-handtracking",
      name: "LabClaw hand detection",
      kind: "labclaw-skill",
      source: {
        label: "LabClaw handtracking skill",
        url: "https://github.com/wu-yc/LabClaw/tree/main/skills/vision/handtracking",
        license: "MIT",
      },
      adherenceRole: "interaction_evidence",
      readiness: labclawVisionReadiness(env),
      runpodEligible: true,
      envKeys: ["LABOS_LABCLAW_VISION_RUNTIME_URL", "LABOS_PERCEPTION_RUNTIME_URL"],
      inputs: ["egocentric video frames"],
      outputs: ["hand boxes", "left/right hand labels", "confidence scores"],
      givesUs: [
        "Fast evidence that hands entered the workspace.",
        "Cheap prefilter before expensive pose or segmentation models.",
      ],
      caveats: ["Bounding boxes alone cannot prove contact, grasp quality, or object identity."],
    },
    {
      id: "labclaw-egohos-segmentation",
      name: "LabClaw EgoHOS hand-object segmentation",
      kind: "labclaw-skill",
      source: {
        label: "LabClaw EgoHOS skill",
        url: "https://github.com/wu-yc/LabClaw/tree/main/skills/vision/egohos-segmentation",
        license: "MIT",
      },
      adherenceRole: "interaction_evidence",
      readiness: labclawVisionReadiness(env),
      runpodEligible: true,
      envKeys: ["LABOS_LABCLAW_VISION_RUNTIME_URL", "LABOS_PERCEPTION_RUNTIME_URL"],
      inputs: ["egocentric RGB frames"],
      outputs: ["hand masks", "object masks", "contact metrics"],
      givesUs: [
        "Pixel-level evidence for hand-object contact.",
        "Better adherence signals for grasp, stir, place, transfer, and manipulation steps.",
      ],
      caveats: ["GPU recommended; mask flicker needs temporal smoothing before pass/fail use."],
    },
    {
      id: "labclaw-hands-3d-pose",
      name: "LabClaw 3D hand pose",
      kind: "labclaw-skill",
      source: {
        label: "LabClaw hands-3d-pose skill",
        url: "https://github.com/wu-yc/LabClaw/tree/main/skills/vision/hands-3d-pose",
        license: "MIT",
      },
      adherenceRole: "interaction_evidence",
      readiness: labclawVisionReadiness(env),
      runpodEligible: true,
      envKeys: ["LABOS_LABCLAW_VISION_RUNTIME_URL", "LABOS_PERCEPTION_RUNTIME_URL"],
      inputs: ["egocentric frames", "optional camera intrinsics"],
      outputs: ["21-keypoint hand skeletons", "2D projections", "gesture features"],
      givesUs: [
        "Finger-level pose features for grasp, pinch, stir, pour, and handover motions.",
        "A bridge from raw video to reusable interaction features for model training.",
      ],
      caveats: ["Single-view 3D is approximate without calibration/depth."],
    },
    {
      id: "b3d-scene-graph",
      name: "B3D Bayesian 3D scene graph",
      kind: "b3d-runtime",
      source: {
        label: "probcomp/b3d",
        url: "https://github.com/probcomp/b3d",
        license: "Apache-2.0",
      },
      adherenceRole: "world_model",
      readiness: b3dReadiness(env),
      runpodEligible: true,
      envKeys: ["LABOS_B3D_RUNTIME_URL", "LABOS_PERCEPTION_RUNTIME_URL"],
      inputs: ["video frames", "object hypotheses", "optional depth/camera calibration"],
      outputs: ["3D object hypotheses", "pose estimates", "uncertainty", "persistent scene state"],
      givesUs: [
        "Object permanence through occlusion and camera motion.",
        "Uncertainty-aware spatial evidence such as mug moved from counter to tray.",
        "A proper world-model layer above single-frame detections.",
      ],
      caveats: [
        "This is a GPU sidecar candidate, not a dashboard dependency.",
        "Quality depends on calibration, object priors, and runtime tuning.",
      ],
    },
    {
      id: "labclaw-hot3d-toolkit",
      name: "HOT3D and hand-tracking evaluation",
      kind: "benchmark-toolkit",
      source: {
        label: "LabClaw HOT3D / hand tracking toolkit skills",
        url: "https://github.com/wu-yc/LabClaw/tree/main/skills/vision",
        license: "CC-BY-NC 4.0 / Apache-2.0",
      },
      adherenceRole: "benchmarking",
      readiness: "deferred",
      runpodEligible: true,
      envKeys: ["LABOS_LABCLAW_VISION_RUNTIME_URL"],
      inputs: ["multi-view egocentric sequences", "predicted hand/object tracks"],
      outputs: ["3D tracking metrics", "visualizations", "benchmark reports"],
      givesUs: [
        "Regression tests for hand tracking quality once we collect richer data.",
        "A training/evaluation bridge for model upgrades.",
      ],
      caveats: [
        "HOT3D is oriented around Aria/Quest-style multi-view data, not a direct Mentra-only runtime.",
        "Non-commercial licensing constraints must be respected.",
      ],
    },
  ];

  return {
    configured: capabilities.some((capability) =>
      capability.readiness === "available" || capability.readiness === "configured" || capability.readiness === "mock"
    ),
    runpod,
    endpoints: {
      ...(unifiedRuntimeUrl ? { unifiedRuntimeUrl } : {}),
      ...(segmentationSidecarUrl ? { segmentationSidecarUrl } : {}),
      ...(labclawVisionRuntimeUrl ? { labclawVisionRuntimeUrl } : {}),
      ...(b3dRuntimeUrl ? { b3dRuntimeUrl } : {}),
    },
    capabilities,
    nextRuntimeSlice: [
      "Keep Gemini Live as conversational semantic context, not deterministic pass/fail.",
      "Host object/hand/B3D adapters as a GPU sidecar on RunPod behind normalized JSON contracts.",
      "Persist every primitive output into replay manifests so adherence bugs can be regression-tested.",
    ],
  };
}
