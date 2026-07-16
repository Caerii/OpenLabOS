import { getProtocol, protocolTracker } from "../../ai/kitchen/index.js";
import { queueKitchenStepSegmentAnalysis } from "../../ai/kitchen/async-step-analysis.js";
import { materializeRecentPreviewChunk } from "../../ai/kitchen/live-chunks.js";
import {
  KitchenRunService,
  KitchenRunServiceError,
  type KitchenRunServicePorts,
} from "../../ai/kitchen/application/run-service.js";
import { KitchenRecordingService } from "../../ai/kitchen/application/recording-service.js";
import { KitchenStepSegmentService } from "../../ai/kitchen/application/step-segment-service.js";
import { getLabOSFeatureFlags } from "../../config/features.js";
import { badRequest, notFound } from "../../lib/http.js";
import { getKitchenRouteDeps } from "./deps.js";
import { recordKitchenRunEvent } from "./events.js";
import {
  sendLiveCoachRunCompleteContext,
  sendLiveCoachSetupContext,
  sendLiveCoachStepContext,
} from "./live-coach-context.js";
import { kitchenRealtimeSupervisor } from "./realtime-supervisor.js";

export function createKitchenRunService() {
  const deps = getKitchenRouteDeps();
  const recording = new KitchenRecordingService({
    startNativeRecording: deps.startNativeRecording,
    stopNativeRecording: deps.stopNativeRecording,
    refreshNativeRecordingStatus: deps.refreshNativeRecordingStatus,
  });
  const ports: KitchenRunServicePorts = {
    tracker: protocolTracker,
    getProtocol,
    featureFlags: getLabOSFeatureFlags,
    recording,
    stepSegments: new KitchenStepSegmentService({
      recording,
      captureFrame: deps.captureFrame,
      saveKitchenFrame: deps.saveKitchenFrame,
      materializeRecentPreviewChunk,
    }),
    appendKitchenStepSegment: async (segment) => {
      await deps.appendKitchenStepSegment(segment);
      if (getLabOSFeatureFlags().asyncStepAnalysisEnabled) {
        void queueKitchenStepSegmentAnalysis(segment).catch(() => {});
      }
    },
    runAdherenceTick: async (body) => {
      const { runKitchenAdherenceTick } = await import("./adherence-runner.js");
      return runKitchenAdherenceTick(body as any);
    },
    saveKitchenSessionManifest: deps.saveKitchenSessionManifest,
    recordEvent: recordKitchenRunEvent,
    warmCamera: deps.warmKitchenProtocolCamera,
    stopRealtimeSupervisor: (reason) => {
      kitchenRealtimeSupervisor.stop(reason);
    },
    sendLiveCoachSetupContext,
    sendLiveCoachStepContext,
    sendLiveCoachRunCompleteContext,
  };
  return new KitchenRunService(ports);
}

export function throwKitchenRunServiceHttpError(error: unknown): never {
  if (error instanceof KitchenRunServiceError) {
    if (error.status === 404) notFound(error.message);
    badRequest(error.message);
  }
  throw error;
}
