import { Router } from "express";
import { protocolTracker } from "../../ai/kitchen/index.js";
import { runEntitySegmentation } from "../../ai/kitchen/entity-segmentation.js";
import type { KitchenProtocol } from "../../ai/kitchen/protocols.js";
import {
  buildSpatialSummaryFromSegmentation,
  formatSpatialSummaryForVoice,
  type SpatialSummary,
} from "../../ai/kitchen/spatial-summary.js";
import { getLabOSFeatureFlags } from "../../config/features.js";
import { asyncRoute } from "../../lib/http.js";
import { readJpegDimensions } from "../../lib/jpeg.js";
import { getKitchenRouteDeps } from "./deps.js";
import { kitchenRealtimeSupervisor } from "./realtime-supervisor.js";
import type { KitchenHandsFreeInventoryPreflight } from "../../ai/kitchen/application/hands-free-service.js";
import {
  createKitchenHandsFreeService,
  throwKitchenHandsFreeServiceHttpError,
} from "./hands-free-service-adapter.js";
import {
  serializeCurrentStepState,
} from "./shared.js";

type HandsFreeStartBody = {
  protocolId?: string;
  glassesIp?: string;
  token?: string;
  wsUrl?: string;
  playback?: boolean;
  requireVoice?: boolean;
  supervisor?: {
    intervalMs?: number;
    maxChecks?: number;
    immediate?: boolean;
  };
};

function inventoryNames(protocol: KitchenProtocol) {
  return protocol.requiredInventory.map((item) => item.name);
}

async function captureInventoryPreflight(
  protocol: KitchenProtocol,
  run: NonNullable<ReturnType<typeof protocolTracker.getCurrentRun>>,
): Promise<KitchenHandsFreeInventoryPreflight> {
  const deps = getKitchenRouteDeps();
  const prompts = inventoryNames(protocol);
  try {
    const frameBuffer = await deps.captureFrame();
    const frameRef = await deps.saveKitchenFrame(frameBuffer, { prefix: `handsfree-inventory-${run.id}` });
    const dims = readJpegDimensions(frameBuffer);
    const segmentation = await runEntitySegmentation({
      frameBuffer,
      prompts,
      includeMasks: true,
      includeTracks: true,
      sessionId: run.id,
      frameId: `${protocol.id}:inventory-preflight`,
      timestampMs: Date.now(),
    });
    const spatialSummary = buildSpatialSummaryFromSegmentation(segmentation, {
      requiredObjects: prompts,
      frameWidth: dims?.width,
      frameHeight: dims?.height,
      maxObjects: 12,
    });
    const detectedItems = spatialSummary.objects.map((item) => item.label);
    const missingItems = spatialSummary.missing;
    const passed = missingItems.length === 0 && detectedItems.length > 0;
    return {
      passed,
      detectedItems,
      missingItems,
      frameRef,
      spatialSummary,
      latencyMs: segmentation.latencyMs,
      voiceContext: formatSpatialSummaryForVoice(spatialSummary),
    };
  } catch (error: any) {
    const message = error?.message || String(error);
    const missingItems = prompts;
    return {
      passed: false,
      detectedItems: [],
      missingItems,
      spatialSummary: null,
      error: message,
      voiceContext:
        `Inventory preflight: current camera frame was not available (${message}). ` +
        `Ask the operator to look at the workspace and bring these objects into view: ${prompts.join(", ")}.`,
    };
  }
}

async function handsFreeStatus() {
  const deps = getKitchenRouteDeps();
  const flags = getLabOSFeatureFlags();
  const [preview, recording, supervisor] = await Promise.all([
    deps.previewHealthSnapshot().catch(() => null),
    deps.refreshNativeRecordingStatus().catch(() => null),
    Promise.resolve(kitchenRealtimeSupervisor.status()),
  ]);
  const run = protocolTracker.getCurrentRun();
  const currentStep = protocolTracker.getCurrentStep();
  const glassesAudio = await deps.getGlassesAudioBridgeStatus().catch(() => null);
  const wifiProxy = deps.getWifiProxyStatus();

  return {
    enabled: flags.handsFreeEnabled,
    flags,
    ready: {
      frameReachable: preview?.frameReachable === true,
      recordingActive: recording?.state.active === true || recording?.health.recording === true,
      voiceConnected: glassesAudio?.connected === true,
      supervisorRunning: supervisor.running,
      runActive: protocolTracker.isActive,
    },
    wifiProxy,
    glassesAudio,
    preview,
    recording,
    supervisor,
    run: run ? protocolTracker.summary : null,
    currentStep: currentStep ? serializeCurrentStepState(currentStep) : null,
  };
}

async function withKitchenHandsFreeService<T>(
  call: (service: ReturnType<typeof createKitchenHandsFreeService>) => Promise<T>,
): Promise<T> {
  try {
    return await call(createKitchenHandsFreeService());
  } catch (error) {
    throwKitchenHandsFreeServiceHttpError(error);
  }
}

export function registerKitchenHandsFreeRoutes(router: Router) {
  router.get("/hands-free/status", asyncRoute(async (_req, res) => {
    res.json(await handsFreeStatus());
  }));

  router.post("/hands-free/start", asyncRoute(async (req, res) => {
    const body = req.body as HandsFreeStartBody;
    const protocolId = String(body.protocolId || "");
    const result = await withKitchenHandsFreeService((service) => service.startHandsFreeRun({
      ...body,
      protocolId,
      captureInventoryPreflight,
    }));
    res.json({ ...result, status: await handsFreeStatus() });
  }));

  router.post("/hands-free/stop", asyncRoute(async (_req, res) => {
    const result = await withKitchenHandsFreeService((service) => service.stopHandsFreeRun());
    res.json({ ...result, status: await handsFreeStatus() });
  }));
}
