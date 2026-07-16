import { Request, Response, Router } from "express";
import {
  protocolTracker,
  successCheckMode,
} from "../../ai/kitchen/index.js";
import { sensorBridge } from "../../ai/sensor-bridge.js";
import { asyncRoute, badRequest } from "../../lib/http.js";
import { getKitchenRouteDeps } from "./deps.js";
import {
  getCurrentRunOrThrow,
  getCurrentStepOrThrow,
  getRunByIdOrThrow,
  resolveFrameInput,
  saveFrameIfPresent,
  sendLiveCoachVerificationContext,
  serializeCurrentStepState,
} from "./shared.js";
import {
  buildVerificationResult,
  buildWorkspaceVerificationMode,
  composeVerifyStepPrompt,
  summarizeWorkspaceDetections,
} from "../../ai/kitchen/verification.js";
import { runKitchenAdherenceTick } from "./adherence-runner.js";
import { createKitchenRunService, throwKitchenRunServiceHttpError } from "./run-service-adapter.js";

async function withKitchenRunService<T>(call: (service: ReturnType<typeof createKitchenRunService>) => Promise<T>): Promise<T> {
  try {
    return await call(createKitchenRunService());
  } catch (error) {
    throwKitchenRunServiceHttpError(error);
  }
}

export function registerKitchenRunRoutes(router: Router) {
  router.post("/run/begin", asyncRoute(async (req, res) => {
    const { protocolId, suppressStepCoach } = req.body || {};
    if (!protocolId) {
      badRequest("protocolId is required");
    }
    const result = await withKitchenRunService((service) => service.beginRun({
      protocolId,
      suppressStepCoach: suppressStepCoach === true,
    }));
    res.json(result);
  }));

  router.post("/run/start", asyncRoute(async (req, res) => {
    const { protocolId } = req.body || {};
    if (!protocolId) {
      badRequest("protocolId is required");
    }
    res.json(await withKitchenRunService((service) => service.startSetupRun({ protocolId })));
  }));

  router.post("/run/force-start", asyncRoute(async (req, res) => {
    const suppressStepCoach = req.body?.suppressStepCoach === true;
    res.json(await withKitchenRunService((service) => service.forceStartRun({ suppressStepCoach })));
  }));

  router.post("/run/pause", asyncRoute(async (_req, res) => {
    res.json(await withKitchenRunService((service) => service.pauseRun()));
  }));

  router.post("/run/resume", asyncRoute(async (_req, res) => {
    res.json(await withKitchenRunService((service) => service.resumeRun()));
  }));

  router.post("/run/abort", asyncRoute(async (req, res) => {
    const { reason } = req.body || {};
    const result = await withKitchenRunService((service) => service.abortRun(reason));
    res.json({ success: result.success });
  }));

  router.get("/run/status", (_req: Request, res: Response) => {
    const run = protocolTracker.getCurrentRun();
    if (!run) {
      return res.json({ active: false, run: null });
    }

    const currentStep = protocolTracker.getCurrentStep();
    const protocol = protocolTracker.getCurrentProtocol();
    const serializedStep = currentStep ? serializeCurrentStepState(currentStep) : null;
    const currentStepForRun = protocolTracker.isActive ? serializedStep : null;

    res.json({
      active: protocolTracker.isActive,
      run: protocolTracker.summary,
      currentStep: currentStepForRun,
      reviewStep: !protocolTracker.isActive ? serializedStep : null,
      protocol: protocol
        ? { id: protocol.id, name: protocol.name, totalSteps: protocol.steps.length }
        : null,
      sensorBridge: {
        connected: sensorBridge.connected,
        imuActive: sensorBridge.getStats().totalImuReadings > 0,
      },
    });
  });

  router.get("/run/history", (_req: Request, res: Response) => {
    res.json({ runs: protocolTracker.getHistory() });
  });

  router.get("/run/:id", asyncRoute(async (req, res) => {
    res.json(getRunByIdOrThrow(req.params.id));
  }));

  router.post("/run/workspace-check", asyncRoute(async (req, res) => {
    const run = getCurrentRunOrThrow();
    const protocol = protocolTracker.getCurrentProtocol();
    if (!protocol) badRequest("No active protocol");
    const { modelId, frameBuffer, testImageUrl } = await resolveFrameInput(req.body);

    const mode = buildWorkspaceVerificationMode(protocol);
    const result = await getKitchenRouteDeps().runERMode(mode, { modelId, frameBuffer, testImageUrl });
    const frameRef = await saveFrameIfPresent(frameBuffer, `workspace-${run.id}`);
    const { detections, missingItems, detectedItems, passed } = summarizeWorkspaceDetections(result.parsed);
    await withKitchenRunService((service) => service.applyWorkspaceCheck({
      run,
      passed,
      missingItems,
      detectedItems,
      eventPayload: {
        passed,
        missingItems,
        detectedItems,
        frameRef,
        latencyMs: result.latencyMs,
      },
    }));

    res.json({
      success: true,
      passed,
      missingItems,
      detectedItems,
      detections,
      frameRef,
      latencyMs: result.latencyMs,
    });
  }));

  router.post("/run/verify-step", asyncRoute(async (req, res) => {
    const run = getCurrentRunOrThrow();
    const currentStep = getCurrentStepOrThrow();
    const { modelId, frameBuffer, testImageUrl } = await resolveFrameInput(req.body);

    const mode = successCheckMode(composeVerifyStepPrompt(currentStep.step));
    const result = await getKitchenRouteDeps().runERMode(mode, { modelId, frameBuffer, testImageUrl });
    const frameRef = await saveFrameIfPresent(frameBuffer, `verify-step${currentStep.step.number}-${run.id}`);

    const verification = buildVerificationResult(result, frameRef);
    const progression = await withKitchenRunService((service) => service.applyStepEvidence({
      run,
      currentStep,
      verification,
      eventPayload: {
        stepNumber: currentStep.step.number,
        verification,
        latencyMs: result.latencyMs,
      },
      onRecorded: () => sendLiveCoachVerificationContext(run, currentStep, verification),
    }));

    res.json({
      verification,
      stepAdvanced: progression.stepAdvanced,
      runCompleted: progression.runCompleted,
      currentStep: progression.currentStep,
      frameRef,
      latencyMs: result.latencyMs,
    });
  }));

  router.post("/run/confirm-step", asyncRoute(async (req, res) => {
    res.json(await withKitchenRunService((service) => service.confirmStep(req.body || {})));
  }));

  router.post("/run/adherence-tick", asyncRoute(async (req, res) => {
    res.json(await runKitchenAdherenceTick(req.body || {}));
  }));

  router.post("/run/skip-step", asyncRoute(async (_req, res) => {
    res.json(await withKitchenRunService((service) => service.skipStep()));
  }));

  router.post("/run/complete-step", asyncRoute(async (_req, res) => {
    res.json(await withKitchenRunService((service) => service.completeStep()));
  }));

  router.post("/run/undo-step", asyncRoute(async (req, res) => {
    res.json(await withKitchenRunService((service) => service.undoStep(req.body?.reason)));
  }));
}
