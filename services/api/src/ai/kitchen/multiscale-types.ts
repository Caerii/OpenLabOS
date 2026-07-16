/**
 * Contracts for multiscale protocol validation.
 *
 * These types describe the evidence graph used by realtime supervision,
 * replay, and training export. They are intentionally independent of ER mode
 * factories and route execution.
 */

export type ValidationScale = "frame" | "short_chunk" | "step_window" | "session";
export type ValidationInputKind = "current-frame" | "test-image" | "before-after" | "video-chunk" | "run-history";
export type ValidationDecisionAction = "advance" | "retry_frame" | "collect_short_chunk" | "manual_review";

export interface MultiscaleValidationCheck {
  id: string;
  scale: ValidationScale;
  modeId: string;
  title: string;
  purpose: string;
  trigger: string;
  cadenceMs?: number;
  inputKinds: ValidationInputKind[];
  priority: number;
  required: boolean;
}

export interface StepValidationPlan {
  protocolId: string;
  protocolName: string;
  stepNumber: number;
  stepId: string;
  instruction: string;
  successCriteria: string;
  requiredObjects: string[];
  checks: MultiscaleValidationCheck[];
  aggregation: {
    minCompletionConfidence: number;
    requireTemporalEvidence: boolean;
    blockOnUnsafeState: boolean;
  };
}

export interface ProtocolMultiscalePlan {
  protocolId: string;
  protocolName: string;
  workspaceChecks: MultiscaleValidationCheck[];
  stepPlans: StepValidationPlan[];
  sessionChecks: MultiscaleValidationCheck[];
  realtimePolicy: {
    frameSampleFps: number;
    defaultVideoFps: number;
    shortChunkSeconds: number;
    stepWindowSeconds: number;
    minPassesToAdvance: number;
  };
}

export interface MultiscaleEvidence {
  checkId: string;
  scale: ValidationScale;
  modeId: string;
  title: string;
  ok: boolean;
  passed?: boolean;
  confidence?: number;
  latencyMs?: number;
  parsed?: unknown;
  raw?: string;
  artifactRef?: string;
  artifactKind?: "frame" | "video_chunk";
  warnings: string[];
  blockers: string[];
  error?: string;
}

export interface MultiscaleDecision {
  stepComplete: boolean;
  confidence: number;
  action: ValidationDecisionAction;
  summary: string;
  supportingCheckIds: string[];
  warnings: string[];
  blockers: string[];
}

