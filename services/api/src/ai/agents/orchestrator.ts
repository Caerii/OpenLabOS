import { LABOS_COSCIENTIST_GAPS } from "./gap-analysis.js";
import { LABOS_TOOL_OCEAN } from "./tool-ocean.js";
import type { CoscientistPlan, CoscientistPlanMode, CoscientistPlanRequest, CoscientistPlanStage } from "./types.js";

function inferMode(req: CoscientistPlanRequest): CoscientistPlanMode {
  if (req.mode) return req.mode;
  const text = `${req.objective} ${req.domain || ""}`.toLowerCase();
  if (text.includes("train") || text.includes("eval") || text.includes("fine-tune") || text.includes("grpo")) return "training_eval";
  if (text.includes("protocol") || text.includes("glasses") || text.includes("kitchen") || text.includes("live")) return "physical_protocol";
  return "digital_analysis";
}

function missing(ids: string[]) {
  const toolIds = new Set(LABOS_TOOL_OCEAN.map((tool) => tool.id));
  return ids.filter((id) => !toolIds.has(id));
}

function physicalProtocolStages(protocolId?: string): CoscientistPlanStage[] {
  const stages: CoscientistPlanStage[] = [
    {
      id: "scope-protocol",
      title: "Protocol and success criteria",
      ownerAgent: "manager",
      supportingAgents: ["protocol", "critic"],
      objective: "Confirm the target protocol, required objects, step criteria, and acceptable recovery policy.",
      requiredTools: ["physical.protocol-tracker"],
      exitCriteria: ["Protocol is selected or generated", "Every step has success criteria", "Critical hazards are named"],
      produces: ["protocol execution brief"],
    },
    {
      id: "plan-validation",
      title: "Multiscale validation plan",
      ownerAgent: "perception",
      supportingAgents: ["protocol", "critic"],
      objective: "Map each protocol step to frame, short-chunk, step-window, and session checks.",
      requiredTools: ["physical.multiscale-validation"],
      exitCriteria: ["Each step has required checks", "Temporal steps require chunk evidence", "Unsafe states block advancement"],
      produces: ["validation plan"],
    },
    {
      id: "capture-session",
      title: "Capture and evidence buffer",
      ownerAgent: "perception",
      supportingAgents: ["documentarian"],
      objective: "Capture egocentric evidence from glasses and keep it attached to the active run.",
      requiredTools: ["physical.frame-capture"],
      exitCriteria: ["Preview is streaming", "Frames are timestamped", "Evidence references are persisted"],
      produces: ["frame/chunk evidence refs"],
    },
    {
      id: "execute-and-critique",
      title: "Step execution with critic gate",
      ownerAgent: "critic",
      supportingAgents: ["perception", "protocol", "documentarian"],
      objective: "Accept, retry, or escalate step completion based on multiscale evidence.",
      requiredTools: ["physical.multiscale-validation", "physical.gemini-live-coach"],
      exitCriteria: ["Pass/advance only with sufficient confidence", "Failures generate recovery guidance", "Decision is logged"],
      produces: ["step decision", "voice feedback", "run event"],
    },
    {
      id: "document-export",
      title: "Documentation and training handoff",
      ownerAgent: "documentarian",
      supportingAgents: ["training-eval"],
      objective: "Create a replayable session manifest and export supervision/eval artifacts.",
      requiredTools: ["training.supervision-pairs"],
      exitCriteria: ["Run manifest includes protocol, evidence, judgments, and deviations", "Training repo can consume export"],
      produces: ["session manifest", "training export"],
    },
  ];
  return stages.map((stage) => ({
    ...stage,
    objective: protocolId ? `${stage.objective} Protocol: ${protocolId}.` : stage.objective,
  }));
}

function trainingEvalStages(): CoscientistPlanStage[] {
  return [
    {
      id: "define-rubric",
      title: "Define evaluation rubric",
      ownerAgent: "critic",
      supportingAgents: ["training-eval", "manager"],
      objective: "Freeze metrics for protocol alignment, step completion, deviation detection, and safety.",
      requiredTools: ["training.supervision-pairs"],
      exitCriteria: ["Metrics are reproducible", "Baseline and post-train use same eval inputs"],
      produces: ["evaluation rubric"],
    },
    {
      id: "export-dataset",
      title: "Export captured evidence",
      ownerAgent: "documentarian",
      supportingAgents: ["training-eval"],
      objective: "Export normalized frame/video/session evidence from dashboard into training repo schema.",
      requiredTools: ["training.supervision-pairs"],
      exitCriteria: ["Every row has source/session/sample/frame keys", "No duplicated large metadata per frame"],
      produces: ["dataset manifest"],
    },
    {
      id: "run-baseline-and-train",
      title: "Baseline, train, re-evaluate",
      ownerAgent: "training-eval",
      supportingAgents: ["developer", "critic"],
      objective: "Run baseline model, train/update student, and report before/after metrics.",
      requiredTools: ["digital.tool-creation"],
      exitCriteria: ["Baseline report exists", "Training command/artifact recorded", "Post-train report exists"],
      produces: ["metrics table", "training report"],
    },
  ];
}

function digitalAnalysisStages(): CoscientistPlanStage[] {
  return [
    {
      id: "decompose-objective",
      title: "Decompose scientific objective",
      ownerAgent: "manager",
      supportingAgents: ["developer", "critic"],
      objective: "Turn the question into data, analysis, validation, and reporting tasks.",
      requiredTools: ["ai.provider-routing"],
      exitCriteria: ["Plan has executable subtasks", "Inputs and outputs are named"],
      produces: ["analysis plan"],
    },
    {
      id: "execute-analysis",
      title: "Execute analysis tools",
      ownerAgent: "developer",
      supportingAgents: ["critic", "toolsmith"],
      objective: "Run existing tools and identify missing tools that need safe wrappers.",
      requiredTools: ["ai.provider-routing", "digital.labclaw-skill-browser"],
      exitCriteria: ["Artifacts are produced", "Failures are classified", "Tool gaps are logged"],
      produces: ["analysis artifacts", "tool gap list"],
    },
    {
      id: "critique-report",
      title: "Critique and report",
      ownerAgent: "critic",
      supportingAgents: ["documentarian", "manager"],
      objective: "Evaluate outputs, uncertainty, and next experiments.",
      requiredTools: ["ai.provider-routing"],
      exitCriteria: ["Claims cite evidence", "Known limitations are explicit"],
      produces: ["critic report"],
    },
  ];
}

export function buildCoscientistPlan(req: CoscientistPlanRequest): CoscientistPlan {
  const mode = inferMode(req);
  const stages =
    mode === "physical_protocol"
      ? physicalProtocolStages(req.protocolId)
      : mode === "training_eval"
        ? trainingEvalStages()
        : digitalAnalysisStages();
  const requiredToolIds = [...new Set(stages.flatMap((stage) => stage.requiredTools))];
  const missingCapabilities = [
    ...missing(requiredToolIds),
    ...LABOS_COSCIENTIST_GAPS
      .filter((gap) => gap.priority === "p0")
      .map((gap) => gap.id)
      .filter((id) => ["agent-core", "tool-ocean", "realtime-vlm-loop", "protocol-alignment"].includes(id)),
  ];

  return {
    objective: req.objective,
    mode,
    protocolId: req.protocolId,
    stages,
    missingCapabilities: [...new Set(missingCapabilities)],
    notes: [
      "This is a deterministic co-scientist plan, not autonomous execution.",
      "Autonomous agent tool calls should come after task state, tool registry, and critic gates are durable.",
      "XR HUD, 3D reconstruction, and robotics remain deferred for the current demo path.",
    ],
  };
}
