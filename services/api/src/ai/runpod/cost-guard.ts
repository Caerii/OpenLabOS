export interface RunPodCostGuardConfig {
  apiKey?: string;
  podId?: string;
  baseUrl?: string;
  endpointId?: string;
}

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

const RUNPOD_REST_BASE_URL = "https://rest.runpod.io/v1";

export function loadRunPodCostGuardConfig(env = process.env): RunPodCostGuardConfig {
  return {
    apiKey: env.RUNPOD_API_KEY?.trim() || undefined,
    podId: env.RUNPOD_POD_ID?.trim() || undefined,
    baseUrl: env.RUNPOD_BASE_URL?.trim() || undefined,
    endpointId: env.RUNPOD_ENDPOINT_ID?.trim() || undefined,
  };
}

export function buildRunPodCostGuardStatus(config = loadRunPodCostGuardConfig()): RunPodCostGuardStatus {
  const inferenceConfigured = !!config.baseUrl;
  const lifecycleConfigured = !!config.apiKey && !!config.podId;
  const recommendations: string[] = [];

  if (!inferenceConfigured) {
    recommendations.push("Set RUNPOD_BASE_URL only while a remote vLLM endpoint is intentionally active.");
  }
  if (!config.apiKey) {
    recommendations.push("Set RUNPOD_API_KEY locally to allow the dashboard to stop a paid pod.");
  }
  if (!config.podId) {
    recommendations.push("Set RUNPOD_POD_ID locally so the dashboard can target the exact pod to stop.");
  }
  if (inferenceConfigured && !lifecycleConfigured) {
    recommendations.push("Inference is configured but lifecycle stop is not; this is a cost-control gap.");
  }
  if (config.endpointId) {
    recommendations.push("RUNPOD_ENDPOINT_ID is present. Prefer serverless for idle-safe inference when cold start is acceptable.");
  }

  return {
    configured: inferenceConfigured || lifecycleConfigured || !!config.endpointId,
    inferenceConfigured,
    lifecycleConfigured,
    baseUrl: config.baseUrl,
    podId: config.podId,
    endpointId: config.endpointId,
    recommendations,
    safeActions: lifecycleConfigured ? ["stop_pod"] : [],
  };
}

export async function stopRunPodPod(
  config = loadRunPodCostGuardConfig(),
  fetchImpl: typeof fetch = fetch,
): Promise<RunPodStopResult> {
  if (!config.apiKey) throw new Error("RUNPOD_API_KEY is required to stop a pod.");
  if (!config.podId) throw new Error("RUNPOD_POD_ID is required to stop a pod.");

  const response = await fetchImpl(`${RUNPOD_REST_BASE_URL}/pods/${encodeURIComponent(config.podId)}/stop`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
    },
  });
  const text = await response.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {}

  if (!response.ok) {
    throw new Error(`RunPod stop failed (${response.status}): ${typeof body === "string" ? body : JSON.stringify(body)}`);
  }

  return {
    success: true,
    podId: config.podId,
    statusCode: response.status,
    response: body,
  };
}

