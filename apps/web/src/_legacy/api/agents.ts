import { postJson, request } from "./core";

export type CoscientistPlanMode = "physical_protocol" | "digital_analysis" | "training_eval";

export interface LabosAgentRole {
  id: string;
  name: string;
  lane: string;
  purpose: string;
  responsibilities: string[];
  implementationStatus: string;
  currentImplementation: string[];
  gaps: string[];
}

export interface ToolCapability {
  id: string;
  name: string;
  ownerAgent: string;
  lane: string;
  status: string;
  description: string;
  route?: string;
  module?: string;
  gaps: string[];
}

export interface CoscientistPlanRequest {
  objective: string;
  mode?: CoscientistPlanMode;
  protocolId?: string;
  domain?: string;
  evidenceRefs?: string[];
  constraints?: string[];
}

export interface CoscientistRunStage {
  id: string;
  title: string;
  ownerAgent: string;
  supportingAgents: string[];
  status: "pending" | "in_progress" | "blocked" | "completed" | "skipped";
  evidenceRefs: string[];
  notes: string[];
}

export interface CoscientistRun {
  id: string;
  createdAt: number;
  updatedAt: number;
  status: "active" | "blocked" | "completed" | "aborted";
  request: CoscientistPlanRequest;
  currentStageId?: string;
  stages: CoscientistRunStage[];
  events: unknown[];
}

export const labosAgentArchitecture = () =>
  request<{
    name: string;
    scope: { includedNow: string[]; explicitlyDeferred: string[] };
    roles: LabosAgentRole[];
    tools: ToolCapability[];
    gaps: Record<string, unknown>;
  }>("/api/agents/architecture");

export const labosAgentTools = () =>
  request<{ tools: ToolCapability[] }>("/api/agents/tools");

export const labosAgentGaps = () =>
  request<{ gaps: unknown[]; byPriority: Record<string, unknown> }>("/api/agents/gaps");

export const labosCoscientistPlan = (body: CoscientistPlanRequest) =>
  postJson<unknown>("/api/agents/plan", body);

export const labosAgentRuns = (limit = 20) =>
  request<{ runs: CoscientistRun[] }>(`/api/agents/runs?limit=${limit}`);

export const labosCreateAgentRun = (body: CoscientistPlanRequest) =>
  postJson<{ success: boolean; run: CoscientistRun }>("/api/agents/runs", body);

export const labosAgentRun = (id: string) =>
  request<{ run: CoscientistRun }>(`/api/agents/runs/${encodeURIComponent(id)}`);

export const labosAppendAgentRunEvent = (
  id: string,
  body: {
    type: string;
    stageId?: string;
    agentId?: string;
    message?: string;
    evidenceRefs?: string[];
    payload?: Record<string, unknown>;
  },
) => postJson<{ success: boolean; run: CoscientistRun }>(`/api/agents/runs/${encodeURIComponent(id)}/events`, body);
