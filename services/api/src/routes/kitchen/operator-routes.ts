import { Router } from "express";
import { getLabOSFeatureConfig } from "../../config/features.js";
import { asyncRoute, badRequest } from "../../lib/http.js";
import { protocolTracker } from "../../ai/kitchen/index.js";
import { BUTTON_CONFIRM_ACTION } from "../../ai/kitchen/application/button-confirm-service.js";
import { KitchenOperatorRunService } from "../../ai/kitchen/application/operator-run-service.js";
import { extractButtonMappings, fetchLabosSettings, updateLabosSettings } from "../../lib/labos-settings.js";
import { getKitchenRouteDeps } from "./deps.js";
import {
  ensureKitchenButtonConfirmBridge,
  kitchenOperatorReadiness,
} from "./operator-readiness-adapter.js";
import { createKitchenRunService, throwKitchenRunServiceHttpError } from "./run-service-adapter.js";

let restoreButtonMappingsAfterRun: Record<string, string> | null = null;

function restoreMappingsForOperatorMode(mappings: Record<string, string>) {
  return {
    ...mappings,
    camera_short: mappings.camera_short === BUTTON_CONFIRM_ACTION ? "take_photo" : mappings.camera_short,
  };
}

async function configureButtonConfirmForRun() {
  const settings = await fetchLabosSettings(500);
  const mappings = extractButtonMappings(settings);
  if (!restoreButtonMappingsAfterRun) {
    restoreButtonMappingsAfterRun = restoreMappingsForOperatorMode(mappings);
  }
  if (mappings.camera_short === BUTTON_CONFIRM_ACTION) return mappings;
  return updateLabosSettings({
    button_actions: {
      ...mappings,
      camera_short: BUTTON_CONFIRM_ACTION,
    },
  }, 500);
}

async function restoreButtonConfirmAfterRun() {
  const mappings = restoreButtonMappingsAfterRun;
  restoreButtonMappingsAfterRun = null;
  if (!mappings) return null;
  return updateLabosSettings({ button_actions: mappings }, 500);
}

function createKitchenOperatorRunService() {
  const deps = getKitchenRouteDeps();
  return new KitchenOperatorRunService({
    featureFlags: () => getLabOSFeatureConfig().effectiveFlags,
    ensureButtonConfirmBridge: ensureKitchenButtonConfirmBridge,
    getOperatorReadiness: kitchenOperatorReadiness,
    getCurrentRunId: () => protocolTracker.getCurrentRun()?.id || protocolTracker.summary?.id,
    runService: createKitchenRunService(),
    configureButtonConfirmForRun,
    restoreButtonConfirmAfterRun,
    saveKitchenSessionManifest: deps.saveKitchenSessionManifest,
  });
}

async function withOperatorRunService<T>(call: (service: KitchenOperatorRunService) => Promise<T>): Promise<T> {
  try {
    return await call(createKitchenOperatorRunService());
  } catch (error) {
    throwKitchenRunServiceHttpError(error);
  }
}

export function registerKitchenOperatorRoutes(router: Router) {
  router.get("/operator/readiness", asyncRoute(async (_req, res) => {
    res.json(await kitchenOperatorReadiness());
  }));

  router.post("/operator/begin", asyncRoute(async (req, res) => {
    const { protocolId, suppressStepCoach } = req.body || {};
    if (!protocolId) {
      badRequest("protocolId is required");
    }
    res.json(await withOperatorRunService((service) => service.beginRun({
      protocolId,
      suppressStepCoach: suppressStepCoach !== false,
    })));
  }));

  router.post("/operator/confirm-step", asyncRoute(async (req, res) => {
    res.json(await withOperatorRunService((service) => service.confirmCurrentStep(req.body || {})));
  }));

  router.post("/operator/abort", asyncRoute(async (req, res) => {
    res.json(await withOperatorRunService((service) => service.abortRun(req.body?.reason)));
  }));

  router.post("/operator/save-package", asyncRoute(async (req, res) => {
    res.json(await withOperatorRunService((service) => service.saveEvidencePackage(req.body?.runId)));
  }));
}
