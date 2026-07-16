import { getProtocol, protocolTracker } from "../../ai/kitchen/index.js";
import {
  KitchenHandsFreeService,
  KitchenHandsFreeServiceError,
  type KitchenHandsFreeServicePorts,
} from "../../ai/kitchen/application/hands-free-service.js";
import { workflowPresetForProtocol } from "../../ai/workflows/index.js";
import { getLabOSFeatureFlags } from "../../config/features.js";
import { badRequest, notFound } from "../../lib/http.js";
import { getKitchenRouteDeps } from "./deps.js";
import { recordKitchenRunEvent } from "./events.js";
import { sendLiveCoachHandsFreeStartContext } from "./live-coach-context.js";
import { kitchenRealtimeSupervisor } from "./realtime-supervisor.js";
import { createKitchenRunService } from "./run-service-adapter.js";

export function createKitchenHandsFreeService() {
  const deps = getKitchenRouteDeps();
  const ports: KitchenHandsFreeServicePorts = {
    tracker: protocolTracker,
    runService: createKitchenRunService(),
    getProtocol,
    featureFlags: getLabOSFeatureFlags,
    enableWifiProxy: deps.enableWifiProxy,
    startGlassesAudioBridge: deps.startGlassesAudioBridge,
    stopGlassesAudioBridge: deps.stopGlassesAudioBridge,
    getGlassesAudioBridgeStatus: deps.getGlassesAudioBridgeStatus,
    startNativeRecording: deps.startNativeRecording,
    stopNativeRecording: deps.stopNativeRecording,
    refreshNativeRecordingStatus: deps.refreshNativeRecordingStatus,
    saveKitchenSessionManifest: deps.saveKitchenSessionManifest,
    supervisorDefaults: (protocolId) => workflowPresetForProtocol(protocolId).supervisor,
    startRealtimeSupervisor: (opts) => kitchenRealtimeSupervisor.start(opts),
    stopRealtimeSupervisor: (reason) => kitchenRealtimeSupervisor.stop(reason),
    recordEvent: recordKitchenRunEvent,
    sendLiveCoachHandsFreeStartContext,
    liveCoachStop: deps.liveCoachStop,
  };
  return new KitchenHandsFreeService(ports);
}

export function throwKitchenHandsFreeServiceHttpError(error: unknown): never {
  if (error instanceof KitchenHandsFreeServiceError) {
    if (error.status === 404) notFound(error.message);
    badRequest(error.message);
  }
  throw error;
}
