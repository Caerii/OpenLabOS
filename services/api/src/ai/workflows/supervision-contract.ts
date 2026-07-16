import type { LabOSWorkflowPreset } from "./presets.js";

export interface WorkflowProtocolStepLike {
  number: number;
  instruction: string;
  successCriteria: string;
  verificationPrompt?: string;
  requiredObjects?: string[];
  hazardChecks?: string[];
}

export interface WorkflowProtocolLike {
  id: string;
  name: string;
  steps: WorkflowProtocolStepLike[];
  requiredInventory?: Array<{ name: string }>;
}

export interface WorkflowValidationCheckLike {
  id: string;
  scale: string;
  modeId: string;
  required?: boolean;
}

export interface WorkflowStepPlanLike {
  stepNumber: number;
  stepId: string;
  checks: WorkflowValidationCheckLike[];
  aggregation?: {
    requireTemporalEvidence?: boolean;
  };
}

export interface WorkflowMultiscalePlanLike {
  protocolId: string;
  stepPlans: WorkflowStepPlanLike[];
  workspaceChecks?: WorkflowValidationCheckLike[];
  sessionChecks?: WorkflowValidationCheckLike[];
  realtimePolicy?: {
    frameSampleFps?: number;
    defaultVideoFps?: number;
    shortChunkSeconds?: number;
    stepWindowSeconds?: number;
    minPassesToAdvance?: number;
  };
}

export type WorkflowContractSeverity = "error" | "warning";

export interface WorkflowContractIssue {
  severity: WorkflowContractSeverity;
  code: string;
  message: string;
  stepNumber?: number;
}

export interface WorkflowSupervisionContract {
  schemaVersion: "labos.workflow-supervision-contract.v1";
  workflowId: string;
  protocolId: string;
  protocolName: string;
  stepCount: number;
  inventoryCount: number;
  closedWorldStepIds: string[];
  usesFallbackStepIds: boolean;
  supervisor: {
    intervalMs: number;
    minIntervalMs: number;
    sampleIntervalMs: number;
    maxChecks: number;
    maxChecksLimit: number;
  };
  evidenceContract: {
    workspaceCheckCount: number;
    sessionCheckCount: number;
    frameSampleFps: number;
    defaultVideoFps: number;
    shortChunkSeconds: number;
    stepWindowSeconds: number;
    minPassesToAdvance: number;
  };
  capabilities: {
    deterministicStateTree: true;
    replayFixture: true;
    sessionManifest: true;
    multiscaleEvidence: boolean;
    voiceFeedback: boolean;
  };
  issues: WorkflowContractIssue[];
  ok: boolean;
}

export interface BuildWorkflowSupervisionContractOptions {
  protocol: WorkflowProtocolLike;
  preset: LabOSWorkflowPreset;
  plan: WorkflowMultiscalePlanLike;
}

function issue(
  issues: WorkflowContractIssue[],
  severity: WorkflowContractSeverity,
  code: string,
  message: string,
  stepNumber?: number,
) {
  issues.push({ severity, code, message, stepNumber });
}

function stepIdForPreset(preset: LabOSWorkflowPreset, protocolId: string, stepNumber: number) {
  const mapped = preset.closedWorldStepIds?.[protocolId]?.[stepNumber];
  return mapped || `${preset.fallbackStepPrefix || "step"}-${stepNumber}`;
}

function hasMode(plan: WorkflowStepPlanLike | undefined, modeId: string) {
  return !!plan?.checks.some((check) => check.modeId === modeId);
}

function hasModeAtScale(plan: WorkflowStepPlanLike | undefined, modeId: string, scale: string) {
  return !!plan?.checks.some((check) => check.modeId === modeId && check.scale === scale);
}

function normalizedPolicy(plan: WorkflowMultiscalePlanLike) {
  return {
    frameSampleFps: plan.realtimePolicy?.frameSampleFps ?? 0,
    defaultVideoFps: plan.realtimePolicy?.defaultVideoFps ?? 0,
    shortChunkSeconds: plan.realtimePolicy?.shortChunkSeconds ?? 0,
    stepWindowSeconds: plan.realtimePolicy?.stepWindowSeconds ?? 0,
    minPassesToAdvance: plan.realtimePolicy?.minPassesToAdvance ?? 0,
  };
}

export function buildWorkflowSupervisionContract(
  opts: BuildWorkflowSupervisionContractOptions,
): WorkflowSupervisionContract {
  const { protocol, preset, plan } = opts;
  const issues: WorkflowContractIssue[] = [];
  const expectedStepIds = protocol.steps.map((step) => stepIdForPreset(preset, protocol.id, step.number));
  const mappedStepIds = preset.closedWorldStepIds?.[protocol.id] || {};
  const usesFallbackStepIds = protocol.steps.some((step) => !mappedStepIds[step.number]);
  const policy = normalizedPolicy(plan);

  if (!protocol.id) issue(issues, "error", "protocol-id-missing", "Protocol id is required.");
  if (!protocol.name) issue(issues, "error", "protocol-name-missing", "Protocol name is required.");
  if (!protocol.steps.length) issue(issues, "error", "protocol-empty", "Protocol must contain at least one step.");
  if (!protocol.requiredInventory?.length) {
    issue(issues, "warning", "inventory-empty", "Protocol has no required inventory.");
  }

  const seenNumbers = new Set<number>();
  const seenIds = new Set<string>();
  protocol.steps.forEach((step, index) => {
    const expectedNumber = index + 1;
    if (step.number !== expectedNumber) {
      issue(issues, "error", "step-number-not-contiguous", `Step number should be ${expectedNumber}.`, step.number);
    }
    if (seenNumbers.has(step.number)) {
      issue(issues, "error", "step-number-duplicate", `Duplicate step number ${step.number}.`, step.number);
    }
    seenNumbers.add(step.number);
    if (!step.instruction?.trim()) {
      issue(issues, "error", "step-instruction-missing", "Step instruction is required.", step.number);
    }
    if (!step.successCriteria?.trim()) {
      issue(issues, "error", "step-success-criteria-missing", "Step success criteria is required.", step.number);
    }
    if (!Array.isArray(step.requiredObjects)) {
      issue(issues, "error", "step-required-objects-missing", "Step requiredObjects must be an array.", step.number);
    }
  });

  expectedStepIds.forEach((stepId, index) => {
    if (seenIds.has(stepId)) {
      issue(issues, "error", "step-id-duplicate", `Duplicate closed-world step id "${stepId}".`, index + 1);
    }
    seenIds.add(stepId);
  });

  if (plan.protocolId !== protocol.id) {
    issue(issues, "error", "plan-protocol-mismatch", `Plan protocol id "${plan.protocolId}" does not match "${protocol.id}".`);
  }
  if (plan.stepPlans.length !== protocol.steps.length) {
    issue(issues, "error", "plan-step-count-mismatch", "Plan step count must match protocol step count.");
  }

  for (const step of protocol.steps) {
    const expectedStepId = stepIdForPreset(preset, protocol.id, step.number);
    const stepPlan = plan.stepPlans.find((candidate) => candidate.stepNumber === step.number);
    if (!stepPlan) {
      issue(issues, "error", "plan-step-missing", "Multiscale plan is missing this step.", step.number);
      continue;
    }
    if (stepPlan.stepId !== expectedStepId) {
      issue(
        issues,
        "error",
        "plan-step-id-mismatch",
        `Plan step id "${stepPlan.stepId}" should be "${expectedStepId}".`,
        step.number,
      );
    }
    if (!hasMode(stepPlan, "object-pointing")) {
      issue(issues, "error", "check-object-pointing-missing", "Required object pointing check is missing.", step.number);
    }
    if (!hasMode(stepPlan, "success-check")) {
      issue(issues, "error", "check-success-missing", "Required success check is missing.", step.number);
    }
    if (!hasMode(stepPlan, "before-after")) {
      issue(issues, "error", "check-before-after-missing", "Before/after audit check is missing.", step.number);
    }
    if (step.requiredObjects?.length && !hasMode(stepPlan, "entity-segmentation")) {
      issue(issues, "warning", "check-entity-segmentation-missing", "Object grounding check is missing.", step.number);
    }
    if (step.hazardChecks?.length && !hasMode(stepPlan, "safety-check")) {
      issue(issues, "error", "check-safety-missing", "Hazard step is missing a safety check.", step.number);
    }
    if (stepPlan.aggregation?.requireTemporalEvidence && !hasModeAtScale(stepPlan, "teacher-judgment", "short_chunk")) {
      issue(issues, "error", "check-temporal-missing", "Temporal step requires short-chunk teacher judgment.", step.number);
    }
  }

  if (!plan.workspaceChecks?.some((check) => check.required)) {
    issue(issues, "error", "workspace-required-check-missing", "Plan must include at least one required workspace check.");
  }
  if (!plan.sessionChecks?.some((check) => check.modeId === "order-adherence")) {
    issue(issues, "error", "session-order-check-missing", "Plan must include a session order-adherence check.");
  }

  if (preset.supervisor.intervalMs < preset.supervisor.minIntervalMs) {
    issue(issues, "error", "supervisor-interval-too-low", "Supervisor interval must be greater than or equal to minIntervalMs.");
  }
  if (preset.supervisor.sampleIntervalMs <= 0) {
    issue(issues, "error", "supervisor-sample-invalid", "Supervisor sample interval must be positive.");
  }
  if (preset.supervisor.maxChecks <= 0 || preset.supervisor.maxChecks > preset.supervisor.maxChecksLimit) {
    issue(issues, "error", "supervisor-max-checks-invalid", "Supervisor maxChecks must be within the configured limit.");
  }

  if (policy.frameSampleFps <= 0) issue(issues, "error", "policy-frame-fps-invalid", "Frame sample FPS must be positive.");
  if (policy.defaultVideoFps <= 0) issue(issues, "error", "policy-video-fps-invalid", "Default video FPS must be positive.");
  if (policy.shortChunkSeconds <= 0) issue(issues, "error", "policy-short-chunk-invalid", "Short chunk seconds must be positive.");
  if (policy.stepWindowSeconds <= 0) issue(issues, "error", "policy-step-window-invalid", "Step window seconds must be positive.");
  if (policy.minPassesToAdvance <= 0) issue(issues, "error", "policy-passes-invalid", "Minimum passes to advance must be positive.");

  return {
    schemaVersion: "labos.workflow-supervision-contract.v1",
    workflowId: preset.id,
    protocolId: protocol.id,
    protocolName: protocol.name,
    stepCount: protocol.steps.length,
    inventoryCount: protocol.requiredInventory?.length || 0,
    closedWorldStepIds: expectedStepIds,
    usesFallbackStepIds,
    supervisor: {
      intervalMs: preset.supervisor.intervalMs,
      minIntervalMs: preset.supervisor.minIntervalMs,
      sampleIntervalMs: preset.supervisor.sampleIntervalMs,
      maxChecks: preset.supervisor.maxChecks,
      maxChecksLimit: preset.supervisor.maxChecksLimit,
    },
    evidenceContract: {
      workspaceCheckCount: plan.workspaceChecks?.length || 0,
      sessionCheckCount: plan.sessionChecks?.length || 0,
      ...policy,
    },
    capabilities: {
      deterministicStateTree: true,
      replayFixture: true,
      sessionManifest: true,
      multiscaleEvidence: plan.stepPlans.length === protocol.steps.length,
      voiceFeedback: !!preset.voice.openingExample,
    },
    issues,
    ok: !issues.some((item) => item.severity === "error"),
  };
}
