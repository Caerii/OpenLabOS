import { postJson, request } from "./core";

export interface RunPodCostGuardStatus {
  configured: boolean;
  inferenceConfigured: boolean;
  lifecycleConfigured: boolean;
  baseUrl?: string;
  podId?: string;
  endpointId?: string;
  recommendations: string[];
  safeActions: Array<"stop_pod">;
}

export interface RunPodStopResult {
  success: boolean;
  podId: string;
  statusCode: number;
  response: unknown;
}

export const runpodGuardStatus = () =>
  request<RunPodCostGuardStatus>("/api/runpod/guard");

export const runpodStopPaidGpu = () =>
  postJson<RunPodStopResult>("/api/runpod/stop", { confirm: "stop-paid-gpu" });

