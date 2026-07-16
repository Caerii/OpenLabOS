import { deleteJson, postJson, putJson, request, withQuery } from "./core";

export interface AIProviderStatus {
  name: string;
  available: boolean;
  configured: boolean;
  models: string[];
  error?: string;
}

export interface FrameAnalysisResult {
  timestamp: number;
  modelId: string;
  latencyMs: number;
  scene: string;
  objects: { label: string; confidence?: number; region?: string }[];
  hands?: { side: "left" | "right"; gesture?: string; holding?: string }[];
  text?: string[];
  activity?: string;
  gazeTarget?: string;
  environment?: string;
  rawResponse?: string;
  moduleId?: string;
  moduleVersion?: string;
  moduleOutput?: any;
}

export interface PipelineInstanceStatus {
  pipelineId: string;
  running: boolean;
  totalAnalyzed: number;
  totalErrors: number;
  activeCount: number;
  modelId: string;
  intervalMs: number;
  moduleId?: string;
  experimentId?: string;
}

export interface PipelineStatus {
  pipelines: PipelineInstanceStatus[];
  activePipelineCount: number;
  recentHistory?: FrameAnalysisResult[];
}

export interface ScientificModuleInfo {
  id: string;
  name: string;
  description: string;
  version: string;
  pipelineDefaults: {
    intervalMs: number;
    maxConcurrent: number;
    preferredModels?: string[];
  };
  requiredSensors?: { sensor: string; reason: string; critical: boolean }[];
  cocoCategories?: { name: string; supercategory: string }[];
  hasPreprocess: boolean;
  hasPostprocess: boolean;
}

export interface SensorBridgeStatus {
  connected: boolean;
  stats: {
    connected: boolean;
    targetUrl: string | null;
    imuRate: number;
    totalImuReadings: number;
    totalGestures: number;
    totalButtonPresses: number;
    latestButtonPress: { timestamp: number; buttonId: string; isLongPress: boolean } | null;
    reconnectCount: number;
    lastEventTime: number | null;
    ringBufferSize: number;
  };
}

export interface SensorSnapshot {
  imu?: { timestamp: number; accel: [number, number, number]; gyro: [number, number, number] };
  imuAgeMs?: number;
  gesture?: { timestamp: number; gesture: string };
  gestureAgeMs?: number;
  battery?: { level: number; voltage?: number };
  mcuConnected?: boolean;
  orientation?: { pitchDeg: number; rollDeg: number };
  motionMagnitude?: number;
  isStill?: boolean;
}

export interface DatasetStats {
  totalFrames: number;
  totalAnnotations: number;
  diskUsageMB: number;
  models: Record<string, number>;
  recentAnnotations: any[];
}

export interface OllamaStatus {
  available: boolean;
  url: string;
  version?: string;
  models?: { name: string; size: number; modified_at: string }[];
  error?: string;
  installHint?: string;
  gpuNote?: string;
}

export interface LmStudioStatus {
  available: boolean;
  url: string;
  models?: { name: string; type?: string }[];
  error?: string;
  installHint?: string;
}

export interface TogetherModelProfileClient {
  id: string;
  labosModelId: string;
  vision: boolean;
  reasoning: boolean;
  fastPath: boolean;
}

export type TogetherModelsResponse =
  | { configured: false; profiles: []; hint: string }
  | { configured: true; profiles: TogetherModelProfileClient[]; count: number; error?: string };

export interface ExperimentRecord {
  id: string;
  name?: string;
  startedAt: number;
  endedAt?: number;
  config: {
    modelId: string;
    intervalMs: number;
    maxConcurrent: number;
    saveToDataset: boolean;
  };
  metrics: {
    framesAnalyzed: number;
    errors: number;
    avgLatencyMs: number;
  };
}

const aiGet = <T>(path: string) => request<T>(`/api/ai/${path}`);
const aiPost = <T>(path: string, body?: unknown) => postJson<T>(`/api/ai/${path}`, body);
const aiPut = <T>(path: string, body?: unknown) => putJson<T>(`/api/ai/${path}`, body);

export const aiProviders = () => aiGet<{ providers: AIProviderStatus[] }>("providers");
export const aiModels = () => aiGet<{ models: string[] }>("models");
export const aiTogetherModelCatalog = () => aiGet<TogetherModelsResponse>("together/models");

export const aiModules = () => aiGet<{ modules: ScientificModuleInfo[] }>("modules");
export const aiModule = (id: string) => aiGet<ScientificModuleInfo>(`modules/${id}`);

export const aiSensorsConnect = (opts?: { host?: string; port?: number; token?: string; startImu?: boolean }) =>
  aiPost<{ success: boolean }>("sensors/connect", opts || {});
export const aiSensorsDisconnect = (opts?: { stopImu?: boolean }) =>
  aiPost<{ success: boolean }>("sensors/disconnect", opts || {});
export const aiSensorsStatus = () => aiGet<SensorBridgeStatus>("sensors/status");
export const aiSensorsSnapshot = (toleranceMs?: number) =>
  request<{ connected: boolean; snapshot: SensorSnapshot | null }>(
    withQuery("/api/ai/sensors/snapshot", { toleranceMs }),
  );
export const aiSensorsImuHistory = (durationMs = 5000) =>
  request<{ connected: boolean; history: any[]; sampleCount: number }>(
    withQuery("/api/ai/sensors/imu-history", { duration: durationMs }),
  );
export const aiSensorsImuStart = () => aiPost<{ success: boolean }>("sensors/imu/start");
export const aiSensorsImuStop = () => aiPost<{ success: boolean }>("sensors/imu/stop");

export const aiAnalyzeFrame = (
  modelId: string,
  opts?: { moduleId?: string; saveToDataset?: boolean; tags?: string[] },
) => aiPost<FrameAnalysisResult>("analyze", { modelId, ...opts });

export const aiPipelineStart = (config: {
  pipelineId?: string;
  modelId?: string;
  moduleId?: string;
  intervalMs?: number;
  maxConcurrent?: number;
  saveToDataset?: boolean;
  tags?: string[];
  experimentName?: string;
}) => aiPost<PipelineInstanceStatus>("pipeline/start", config);

export const aiPipelineStop = (opts?: { pipelineId?: string; stopAll?: boolean }) =>
  aiPost<any>("pipeline/stop", opts || {});
export const aiPipelineStatus = () => aiGet<PipelineStatus>("pipeline/status");
export const aiPipelineConfig = (config: {
  pipelineId?: string;
  modelId?: string;
  intervalMs?: number;
  maxConcurrent?: number;
}) => aiPut<any>("pipeline/config", config);

export const aiDataStats = () => aiGet<DatasetStats>("data/stats");
export const aiDataAnnotations = (opts?: { limit?: number; offset?: number; modelId?: string }) =>
  request<{ annotations: any[]; total: number }>(withQuery("/api/ai/data/annotations", opts));
export const aiDataExportCOCO = () => "/api/ai/data/export/coco";
export const aiDataExportJSONL = () => "/api/ai/data/export/jsonl";
export const aiDataClear = () => deleteJson<{ success: boolean }>("/api/ai/data");
export const aiDataVerify = (id: string) =>
  aiPost<{ success: boolean }>(`data/verify/${id}`);

export const ollamaStatus = () => aiGet<OllamaStatus>("ollama/status");
export const ollamaModels = () => aiGet<{ models: any[] }>("ollama/models");
export const ollamaPull = (model: string) =>
  aiPost<{ success: boolean; model: string }>("ollama/pull", { model });

export const lmstudioStatus = () => aiGet<LmStudioStatus>("lmstudio/status");
export const lmstudioModels = () => aiGet<{ models: { name: string }[] }>("lmstudio/models");

export const aiCompare = (modelIds: string[], saveToDataset = false) =>
  aiPost<{ analyses: any[]; agreement: any }>("compare", { modelIds, saveToDataset });

export const aiExperiments = () =>
  aiGet<{ experiments: ExperimentRecord[]; current: (ExperimentRecord & { pipelineId: string })[] }>(
    "experiments",
  );
