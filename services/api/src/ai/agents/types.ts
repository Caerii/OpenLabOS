export type LabosAgentLane = "digital_lab" | "physical_lab" | "training_eval" | "cross_cutting";

export type LabosAgentRoleId =
  | "manager"
  | "developer"
  | "critic"
  | "toolsmith"
  | "perception"
  | "protocol"
  | "documentarian"
  | "training-eval";

export type ImplementationStatus = "available" | "partial" | "missing" | "deferred";

export interface LabosAgentRole {
  id: LabosAgentRoleId;
  name: string;
  lane: LabosAgentLane;
  purpose: string;
  responsibilities: string[];
  inputs: string[];
  outputs: string[];
  implementationStatus: ImplementationStatus;
  currentImplementation: string[];
  gaps: string[];
}

export interface ToolCapability {
  id: string;
  name: string;
  ownerAgent: LabosAgentRoleId;
  lane: LabosAgentLane;
  status: ImplementationStatus;
  description: string;
  route?: string;
  module?: string;
  gaps: string[];
}

export interface LabosGapItem {
  id: string;
  paperCapability: string;
  currentState: string;
  gap: string;
  priority: "p0" | "p1" | "p2" | "defer";
  recommendedSlice: string;
}

export type CoscientistPlanMode = "physical_protocol" | "digital_analysis" | "training_eval";

export interface CoscientistPlanRequest {
  objective: string;
  mode?: CoscientistPlanMode;
  protocolId?: string;
  domain?: string;
  evidenceRefs?: string[];
  constraints?: string[];
}

export interface CoscientistPlanStage {
  id: string;
  title: string;
  ownerAgent: LabosAgentRoleId;
  supportingAgents: LabosAgentRoleId[];
  objective: string;
  requiredTools: string[];
  exitCriteria: string[];
  produces: string[];
}

export interface CoscientistPlan {
  objective: string;
  mode: CoscientistPlanMode;
  protocolId?: string;
  stages: CoscientistPlanStage[];
  missingCapabilities: string[];
  notes: string[];
}

export type CoscientistRunStatus = "active" | "blocked" | "completed" | "aborted";
export type CoscientistRunStageStatus = "pending" | "in_progress" | "blocked" | "completed" | "skipped";
export type CoscientistRunEventType =
  | "run_created"
  | "stage_started"
  | "stage_completed"
  | "stage_blocked"
  | "stage_skipped"
  | "evidence_linked"
  | "critic_decision"
  | "note"
  | "run_aborted";

export interface CoscientistRunEvent {
  id: string;
  type: CoscientistRunEventType;
  timestamp: number;
  stageId?: string;
  agentId?: LabosAgentRoleId;
  message?: string;
  evidenceRefs?: string[];
  payload?: Record<string, unknown>;
}

export interface CoscientistRunStage extends CoscientistPlanStage {
  status: CoscientistRunStageStatus;
  startedAt?: number;
  completedAt?: number;
  blockedAt?: number;
  evidenceRefs: string[];
  notes: string[];
}

export interface CoscientistRun {
  id: string;
  createdAt: number;
  updatedAt: number;
  status: CoscientistRunStatus;
  request: CoscientistPlanRequest;
  plan: CoscientistPlan;
  currentStageId?: string;
  stages: CoscientistRunStage[];
  events: CoscientistRunEvent[];
}
