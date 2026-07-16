import { Router } from "express";
import {
  getProviderStatuses,
  listAvailableModels,
  loadProvidersFromEnv,
} from "../ai/providers.js";
import { buildTogetherProfiles, listTogetherModelIds, type TogetherModelProfile } from "../ai/together.js";
import {
  analyzeFrame,
  captureFrame,
  AnalysisPipeline,
  type AnalysisPipelineConfig,
} from "../ai/frame-analyzer.js";
import { compareFrameAcrossModels, selectRichestSuccessfulAnalysis } from "../ai/comparison.js";
import { dataStore, saveExperiment, loadExperiments, type Experiment } from "../ai/data-store.js";
import {
  fetchLmStudioModels,
  fetchOllamaModels,
  getLmStudioStatus,
  getOllamaStatus,
  pullOllamaModel,
} from "../ai/model-hosts.js";
import { listModuleInfos, getModule, moduleToInfo } from "../ai/modules/registry.js";
import { sensorBridge } from "../ai/sensor-bridge.js";
import { asyncRoute, badGateway, badRequest, notFound } from "../lib/http.js";
import { getToken } from "../wifi-proxy.js";

const router = Router();

loadProvidersFromEnv();

const pipelines = new Map<string, { pipeline: AnalysisPipeline; experiment: Experiment | null }>();
const DEFAULT_PIPELINE_ID = "default";
const MAX_HISTORY = 100;
const analysisHistory: any[] = [];

function pushHistory(item: any) {
  analysisHistory.push(item);
  if (analysisHistory.length > MAX_HISTORY) analysisHistory.shift();
}

function getPipelineId(value: unknown) {
  return typeof value === "string" && value.trim() ? value : DEFAULT_PIPELINE_ID;
}

function requireModule(moduleId?: string) {
  if (moduleId && !getModule(moduleId)) {
    badRequest(`Module "${moduleId}" not found`);
  }
}

function buildSensorConnectOptions(body: any) {
  const options: { host?: string; port?: number; token?: string } = {};
  if (body?.host) options.host = body.host;
  if (body?.port) options.port = body.port;
  if (body?.token) options.token = body.token;
  else if (getToken()) options.token = getToken() || undefined;
  return Object.keys(options).length > 0 ? options : undefined;
}

function parseInteger(value: unknown, fallback: number) {
  const parsed =
    typeof value === "number" ? value :
    typeof value === "string" && value.trim() ? Number(value) :
    NaN;
  return Number.isFinite(parsed) ? Math.floor(parsed) : fallback;
}

function parseNumberQuery(value: unknown) {
  if (typeof value !== "string" || value.trim() === "") return undefined;
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function requireModelId(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    badRequest("modelId is required");
  }
  return value;
}

function requireModelIds(value: unknown) {
  if (!Array.isArray(value) || value.length < 2) {
    badRequest("modelIds must be an array of 2+ model IDs");
  }
  if (value.some((modelId) => typeof modelId !== "string" || !modelId.trim())) {
    badRequest("modelIds must contain only non-empty strings");
  }
  return value as string[];
}

function getSensorSnapshot() {
  return sensorBridge.connected ? sensorBridge.snapshot() : undefined;
}

function createExperiment(config: {
  experimentName?: string;
  intervalMs: number;
  maxConcurrent: number;
  modelId: string;
  saveToDataset: boolean;
}) {
  return {
    id: `exp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: config.experimentName,
    startedAt: Date.now(),
    config: {
      modelId: config.modelId,
      intervalMs: config.intervalMs,
      maxConcurrent: config.maxConcurrent,
      saveToDataset: config.saveToDataset,
    },
    metrics: { framesAnalyzed: 0, errors: 0, avgLatencyMs: 0, totalLatencyMs: 0 },
  } satisfies Experiment;
}

async function finalizeExperiment(
  pipelineId: string,
  entry: { pipeline: AnalysisPipeline; experiment: Experiment | null },
) {
  const stats = entry.pipeline.stats;
  entry.pipeline.stop();

  if (entry.experiment) {
    entry.experiment.endedAt = Date.now();
    try {
      await saveExperiment(entry.experiment);
      console.log(
        `[AI:${pipelineId}] Experiment ${entry.experiment.id} saved: ${entry.experiment.metrics.framesAnalyzed} frames`,
      );
    } catch (e: any) {
      console.error(`[AI:${pipelineId}] Failed to save experiment: ${e.message}`);
    }
  }

  return stats;
}

function listPipelineSnapshots() {
  return Array.from(pipelines.entries()).map(([pipelineId, entry]) => ({
    pipelineId,
    ...entry.pipeline.stats,
    experimentId: entry.experiment?.id,
  }));
}

function listCurrentExperiments() {
  return Array.from(pipelines.entries()).flatMap(([pipelineId, entry]) =>
    entry.experiment ? [{ pipelineId, ...entry.experiment }] : [],
  );
}

router.get("/providers", asyncRoute(async (_req, res) => {
  res.json({ providers: await getProviderStatuses() });
}));

router.get("/models", asyncRoute(async (_req, res) => {
  res.json({ models: await listAvailableModels() });
}));

router.get("/together/models", asyncRoute(async (_req, res) => {
  const key = process.env.TOGETHER_API_KEY?.trim();
  if (!key) {
    res.json({
      configured: false,
      profiles: [] as TogetherModelProfile[],
      hint: "Set TOGETHER_API_KEY. Use model ids like together:<id> with the same Vercel AI SDK stack as OpenAI.",
    });
    return;
  }

  const { ids, error } = await listTogetherModelIds(key);
  res.json({
    configured: true,
    error: error || undefined,
    count: ids.length,
    profiles: buildTogetherProfiles(ids),
  });
}));

router.get("/modules", (_req, res) => {
  res.json({ modules: listModuleInfos() });
});

router.get("/modules/:id", asyncRoute(async (req, res) => {
  const moduleInfo = getModule(req.params.id);
  if (!moduleInfo) notFound(`Module "${req.params.id}" not found`);
  res.json(moduleToInfo(moduleInfo));
}));

router.post("/sensors/connect", asyncRoute(async (req, res) => {
  const { startImu } = req.body || {};
  sensorBridge.connect(buildSensorConnectOptions(req.body));

  if (startImu) {
    setTimeout(() => sensorBridge.sendImuStart().catch(() => {}), 1000);
  }

  res.json({ success: true, message: "Sensor bridge connecting..." });
}));

router.post("/sensors/disconnect", asyncRoute(async (req, res) => {
  const { stopImu } = req.body || {};
  if (stopImu) {
    await sensorBridge.sendImuStop().catch(() => {});
  }
  sensorBridge.disconnect();
  res.json({ success: true });
}));

router.get("/sensors/status", (_req, res) => {
  res.json({
    connected: sensorBridge.connected,
    stats: sensorBridge.getStats(),
  });
});

router.get("/sensors/snapshot", (req, res) => {
  if (!sensorBridge.connected) {
    res.json({ connected: false, snapshot: null });
    return;
  }

  const toleranceMs = parseInteger(req.query.toleranceMs, 50);
  res.json({
    connected: true,
    snapshot: sensorBridge.snapshot(toleranceMs),
  });
});

router.get("/sensors/imu-history", (req, res) => {
  const durationMs = parseInteger(req.query.duration, 5000);
  const history = sensorBridge.getImuHistory(durationMs);
  res.json({
    connected: sensorBridge.connected,
    history,
    sampleCount: history.length,
  });
});

router.post("/sensors/imu/start", asyncRoute(async (_req, res) => {
  await sensorBridge.sendImuStart();
  res.json({ success: true });
}));

router.post("/sensors/imu/stop", asyncRoute(async (_req, res) => {
  await sensorBridge.sendImuStop();
  res.json({ success: true });
}));

router.post("/analyze", asyncRoute(async (req, res) => {
  const { modelId, moduleId, saveToDataset, tags } = req.body || {};
  const resolvedModelId = requireModelId(modelId);
  requireModule(moduleId);

  const frame = await captureFrame();
  const result = await analyzeFrame(frame, resolvedModelId, { moduleId });

  if (saveToDataset) {
    await dataStore.saveAnnotation(frame, result, tags, { sensorSnapshot: getSensorSnapshot() });
  }

  pushHistory(result);
  res.json(result);
}));

router.post("/pipeline/start", asyncRoute(async (req, res) => {
  const {
    pipelineId: rawPipelineId,
    modelId = "ollama:llava:7b",
    moduleId,
    intervalMs = 3000,
    maxConcurrent = 1,
    saveToDataset = true,
    tags,
    experimentName,
  } = req.body || {};

  const pipelineId = getPipelineId(rawPipelineId);
  const existing = pipelines.get(pipelineId);
  if (existing?.pipeline.running) {
    res.json({
      success: true,
      message: `Pipeline "${pipelineId}" already running`,
      pipelineId,
      ...existing.pipeline.stats,
    });
    return;
  }

  const resolvedModelId = requireModelId(modelId);
  requireModule(moduleId);

  const normalizedIntervalMs = Math.max(500, parseInteger(intervalMs, 3000));
  const normalizedMaxConcurrent = Math.max(1, parseInteger(maxConcurrent, 1));
  const experiment = createExperiment({
    experimentName,
    intervalMs: normalizedIntervalMs,
    maxConcurrent: normalizedMaxConcurrent,
    modelId: resolvedModelId,
    saveToDataset,
  });

  const config: AnalysisPipelineConfig = {
    modelId: resolvedModelId,
    moduleId,
    intervalMs: normalizedIntervalMs,
    maxConcurrent: normalizedMaxConcurrent,
    onResult: async (result, frameBuffer) => {
      pushHistory(result);
      const scenePreview = (result.scene || "").slice(0, 80);
      console.log(`[AI:${pipelineId}] Frame analyzed: ${scenePreview}... (${result.latencyMs}ms)`);

      experiment.metrics.framesAnalyzed++;
      experiment.metrics.totalLatencyMs += result.latencyMs;
      experiment.metrics.avgLatencyMs = Math.round(
        experiment.metrics.totalLatencyMs / experiment.metrics.framesAnalyzed,
      );

      if (!saveToDataset) {
        return;
      }

      try {
        await dataStore.saveAnnotation(frameBuffer, result, tags, {
          experimentId: experiment.id,
          sensorSnapshot: getSensorSnapshot(),
        });
      } catch (e: any) {
        console.error(`[AI:${pipelineId}] Failed to save annotation: ${e.message}`);
      }
    },
    onError: (error) => {
      console.error(`[AI:${pipelineId}] Pipeline error: ${error.message}`);
      pushHistory({ error: error.message, timestamp: Date.now(), pipelineId });
      experiment.metrics.errors++;
    },
  };

  const pipeline = new AnalysisPipeline(config);
  pipelines.set(pipelineId, { pipeline, experiment });
  pipeline.start();

  res.json({ success: true, pipelineId, ...pipeline.stats });
}));

router.post("/pipeline/stop", asyncRoute(async (req, res) => {
  const { pipelineId: rawPipelineId, stopAll } = req.body || {};

  if (stopAll) {
    const stopped = await Promise.all(
      Array.from(pipelines.entries()).map(async ([pipelineId, entry]) => ({
        pipelineId,
        ...(await finalizeExperiment(pipelineId, entry)),
      })),
    );
    pipelines.clear();
    res.json({ success: true, stopped });
    return;
  }

  const pipelineId = getPipelineId(rawPipelineId);
  const entry = pipelines.get(pipelineId);
  if (!entry) {
    res.json({ success: true, message: `Pipeline "${pipelineId}" not running` });
    return;
  }

  const stats = await finalizeExperiment(pipelineId, entry);
  pipelines.delete(pipelineId);
  res.json({ success: true, pipelineId, ...stats });
}));

router.get("/pipeline/status", (_req, res) => {
  const snapshots = listPipelineSnapshots();
  res.json({
    pipelines: snapshots,
    activePipelineCount: snapshots.filter((pipeline) => pipeline.running).length,
    recentHistory: analysisHistory.slice(-10),
  });
});

router.put("/pipeline/config", asyncRoute(async (req, res) => {
  const { pipelineId: rawPipelineId, modelId, intervalMs, maxConcurrent } = req.body || {};
  const pipelineId = getPipelineId(rawPipelineId);
  const entry = pipelines.get(pipelineId);
  if (!entry) badRequest(`Pipeline "${pipelineId}" not running. Start it first.`);

  entry.pipeline.updateConfig({
    ...(modelId ? { modelId: requireModelId(modelId) } : {}),
    ...(intervalMs !== undefined ? { intervalMs: Math.max(500, parseInteger(intervalMs, 3000)) } : {}),
    ...(maxConcurrent !== undefined ? { maxConcurrent: Math.max(1, parseInteger(maxConcurrent, 1)) } : {}),
  });

  res.json({ success: true, pipelineId, ...entry.pipeline.stats });
}));

router.get("/data/stats", asyncRoute(async (_req, res) => {
  res.json(await dataStore.getStats());
}));

router.get("/data/annotations", asyncRoute(async (req, res) => {
  res.json(await dataStore.getAnnotations({
    limit: parseNumberQuery(req.query.limit),
    offset: parseNumberQuery(req.query.offset),
    modelId: req.query.modelId as string,
    tag: req.query.tag as string,
    verified: req.query.verified !== undefined ? req.query.verified === "true" : undefined,
  }));
}));

router.get("/data/export/coco", asyncRoute(async (req, res) => {
  const moduleId = req.query.moduleId as string;
  const filename = moduleId ? `labos-${moduleId}-coco.json` : "labos-coco.json";
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", `attachment; filename=${filename}`);
  res.json(await dataStore.exportCOCO());
}));

router.get("/data/export/jsonl", asyncRoute(async (_req, res) => {
  res.setHeader("Content-Type", "application/x-ndjson");
  res.setHeader("Content-Disposition", "attachment; filename=labos-annotations.jsonl");
  res.send(await dataStore.exportJSONL());
}));

router.post("/data/verify/:id", asyncRoute(async (req, res) => {
  res.json({ success: await dataStore.verifyAnnotation(req.params.id) });
}));

router.delete("/data", asyncRoute(async (_req, res) => {
  await dataStore.clearAll();
  res.json({ success: true });
}));

router.get("/experiments", asyncRoute(async (_req, res) => {
  res.json({
    experiments: await loadExperiments(),
    current: listCurrentExperiments(),
  });
}));

router.post("/compare", asyncRoute(async (req, res) => {
  const { modelIds, moduleId, saveToDataset } = req.body || {};
  const resolvedModelIds = requireModelIds(modelIds);
  requireModule(moduleId);

  const frame = await captureFrame();
  const { analyses, agreement } = await compareFrameAcrossModels(frame, resolvedModelIds, moduleId);

  if (saveToDataset) {
    const best = selectRichestSuccessfulAnalysis(analyses);
    if (best?.result) {
      await dataStore.saveAnnotation(frame, best.result, ["multi-model"], {
        qualityScore: agreement?.objectOverlap ?? 0,
      });
    }
  }

  res.json({ analyses, agreement });
}));

router.get("/ollama/status", asyncRoute(async (_req, res) => {
  res.json(await getOllamaStatus());
}));

router.get("/ollama/models", asyncRoute(async (_req, res) => {
  try {
    res.json({ models: await fetchOllamaModels() });
  } catch (e: any) {
    badGateway(`Ollama not reachable: ${e.message}`);
  }
}));

router.post("/ollama/pull", asyncRoute(async (req, res) => {
  const { model } = req.body || {};
  if (typeof model !== "string" || !model.trim()) {
    badRequest("model name is required");
  }

  res.json({
    success: true,
    model,
    result: await pullOllamaModel(model),
  });
}));

router.get("/lmstudio/status", asyncRoute(async (_req, res) => {
  res.json(await getLmStudioStatus());
}));

router.get("/lmstudio/models", asyncRoute(async (_req, res) => {
  try {
    const models = await fetchLmStudioModels();
    res.json({ models: models.map((model) => ({ name: model.id })) });
  } catch (e: any) {
    badGateway(`LM Studio not reachable: ${e.message}`);
  }
}));

export default router;
