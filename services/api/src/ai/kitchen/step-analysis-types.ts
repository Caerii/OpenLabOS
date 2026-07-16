export type KitchenStepAnalysisStatus = "queued" | "running" | "completed" | "error";

export interface KitchenStepAnalysisDecision {
  performedCorrectly: boolean;
  confidence: number;
  summary: string;
  deviation: string | null;
  visibleEvidence: string[];
  missingEvidence: string[];
}

export interface KitchenStepAnalysisRecord extends Partial<KitchenStepAnalysisDecision> {
  id: string;
  status: KitchenStepAnalysisStatus;
  runId: string;
  protocolId: string;
  segmentId: string;
  attemptId?: string;
  attemptNumber?: number;
  stepNumber: number;
  modelId: string;
  queuedAt?: string;
  startedAt?: string;
  completedAt?: string;
  latencyMs?: number;
  evidenceRefs: string[];
  rawText?: string;
  error?: string;
}
