import type { LabosGapItem } from "./types.js";

export const LABOS_COSCIENTIST_GAPS: LabosGapItem[] = [
  {
    id: "agent-core",
    paperCapability: "Manager, Developer, Critic, and Tool-Creation agents coordinate digital lab work.",
    currentState: "Current LabOS has routes/modules and WIP validation, but no first-class agent task graph.",
    gap: "Need typed agent roles, plan stages, durable task state, and critic-gated execution.",
    priority: "p0",
    recommendedSlice: "Add deterministic agent architecture endpoints and then persist agent runs before autonomous tool calls.",
  },
  {
    id: "tool-ocean",
    paperCapability: "Shared Tool Ocean stores validated tools, databases, APIs, and generated modules.",
    currentState: "LabClaw can browse local skills; inference and kitchen tools exist as code routes.",
    gap: "No unified capability registry with validation status, owner agent, or safe execution contract.",
    priority: "p0",
    recommendedSlice: "Define a Tool Ocean registry over existing routes/modules before adding generated tools.",
  },
  {
    id: "realtime-vlm-loop",
    paperCapability: "XR glasses stream egocentric data and invoke VLM agent every 5-10s.",
    currentState: "Glasses MJPEG preview, frame capture, and manual verify routes exist.",
    gap: "No continuous scheduler that samples frames/chunks, selects validation checks, and sends feedback.",
    priority: "p0",
    recommendedSlice: "Wire multiscale validation into a run-bound scheduler after the planner/critic contracts are stable.",
  },
  {
    id: "protocol-alignment",
    paperCapability: "Protocol alignment with gold-standard procedures and issue/deviation labels.",
    currentState: "Kitchen protocols and teacher judgment schemas exist; public proxy clips are normalized.",
    gap: "No full-session step segment alignment store or deviation taxonomy tied to protocol evidence.",
    priority: "p0",
    recommendedSlice: "Add run/session evidence schema with step segments, issue events, and validation outputs.",
  },
  {
    id: "training-eval-loop",
    paperCapability: "SFT plus GRPO improves a lab-specialized VLM from expert annotations and rewards.",
    currentState: "Supervision pair store and sibling training repo exist; no completed baseline/train/re-eval loop in dashboard.",
    gap: "Need export/import bridge, reward rubric, baseline metrics, and before/after report artifacts.",
    priority: "p1",
    recommendedSlice: "Freeze a small demo eval schema and export real glasses runs into the training repo.",
  },
  {
    id: "documentation-memory",
    paperCapability: "All streams are timestamped and logged with metadata for automated documentation.",
    currentState: "Kitchen run events, frames, and Gemini Live recordings are persisted separately.",
    gap: "No unified co-scientist session manifest connecting video, frames, audio, judgments, and agent decisions.",
    priority: "p1",
    recommendedSlice: "Create a session manifest schema and writer owned by the Documentarian agent.",
  },
  {
    id: "xr-hud",
    paperCapability: "XR app renders stepwise protocol and feedback on glasses.",
    currentState: "Dashboard/tablet UX and browser audio are primary; glasses are POV capture device.",
    gap: "On-glasses HUD and dynamic voice routing are not implemented.",
    priority: "p2",
    recommendedSlice: "Defer until capture/validation loop is reliable; keep tablet-first fallback.",
  },
  {
    id: "spatial-3d",
    paperCapability: "3D/4D reconstruction and robotics handoff for spatially grounded lab automation.",
    currentState: "No 3D reconstruction or robotics stack in current demo path.",
    gap: "Large scope not required for the immediate kitchen/glasses validation loop.",
    priority: "defer",
    recommendedSlice: "Explicitly defer; do not block realtime protocol adherence work on XR/3D reconstruction.",
  },
];

export function summarizeGaps() {
  return {
    p0: LABOS_COSCIENTIST_GAPS.filter((gap) => gap.priority === "p0"),
    p1: LABOS_COSCIENTIST_GAPS.filter((gap) => gap.priority === "p1"),
    p2: LABOS_COSCIENTIST_GAPS.filter((gap) => gap.priority === "p2"),
    deferred: LABOS_COSCIENTIST_GAPS.filter((gap) => gap.priority === "defer"),
  };
}
