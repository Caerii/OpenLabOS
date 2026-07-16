import { request } from "./core";

export interface WorkflowSupervisorDefaults {
  minIntervalMs: number;
  intervalMs: number;
  sampleIntervalMs: number;
  maxChecks: number;
  maxChecksLimit: number;
  immediate: boolean;
}

export interface LabOSWorkflowPreset {
  id: string;
  title: string;
  domain: string;
  defaultProtocolId: string;
  protocolAliases?: string[];
  supervisor: WorkflowSupervisorDefaults;
  fallbackStepPrefix?: string;
  voice: {
    contextLabel: string;
    operatorRole: string;
    openingExample: string;
  };
}

export const workflowPresets = () =>
  request<{ presets: LabOSWorkflowPreset[]; defaultPresetId: string }>("/api/workflows");

export const defaultWorkflowPreset = () =>
  request<LabOSWorkflowPreset>("/api/workflows/default");

export const workflowPresetByProtocol = (protocolId: string) =>
  request<LabOSWorkflowPreset>(`/api/workflows/by-protocol/${encodeURIComponent(protocolId)}`);
