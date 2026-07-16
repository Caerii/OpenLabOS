import {
  appendKitchenEvent,
  appendKitchenStepSegment,
  saveCurrentRunSnapshot,
  saveKitchenFrame,
} from "../../ai/kitchen/run-store.js";
import { extractEROptions, runERMode } from "../../ai/kitchen/er-runtime.js";
import { saveKitchenSessionManifest } from "../../ai/kitchen/session-manifest.js";
import { saveSupervisionPair } from "../../ai/supervision-store.js";
import { captureFrame } from "../../ai/frame-analyzer.js";
import { liveCoach } from "../../live-coach/singleton.js";
import {
  previewHealthSnapshot,
  refreshNativeRecordingStatus,
  startNativeRecording,
  stopNativeRecording,
  warmKitchenProtocolCamera,
} from "../preview.js";
import {
  getGlassesAudioBridgeStatus,
  startGlassesAudioBridge,
  stopGlassesAudioBridge,
} from "../../live-coach/glasses-audio.js";
import { enableWifiProxy, getWifiProxyStatus } from "../../wifi-proxy.js";

export type KitchenRouteTestDeps = {
  runERMode: typeof runERMode;
  extractEROptions: typeof extractEROptions;
  captureFrame: typeof captureFrame;
  saveKitchenFrame: typeof saveKitchenFrame;
  appendKitchenEvent: typeof appendKitchenEvent;
  appendKitchenStepSegment: typeof appendKitchenStepSegment;
  saveCurrentRunSnapshot: typeof saveCurrentRunSnapshot;
  warmKitchenProtocolCamera: typeof warmKitchenProtocolCamera;
  startNativeRecording: typeof startNativeRecording;
  stopNativeRecording: typeof stopNativeRecording;
  refreshNativeRecordingStatus: typeof refreshNativeRecordingStatus;
  previewHealthSnapshot: typeof previewHealthSnapshot;
  enableWifiProxy: typeof enableWifiProxy;
  getWifiProxyStatus: typeof getWifiProxyStatus;
  startGlassesAudioBridge: typeof startGlassesAudioBridge;
  stopGlassesAudioBridge: typeof stopGlassesAudioBridge;
  getGlassesAudioBridgeStatus: typeof getGlassesAudioBridgeStatus;
  liveCoachStop: (opts?: { drainMs?: number; maxDrainMs?: number }) => Promise<unknown>;
  saveKitchenSessionManifest: typeof saveKitchenSessionManifest;
  liveCoachSetActiveProtocol: (protocolId: string) => unknown;
  liveCoachSendText: (text: string) => Promise<unknown>;
  liveCoachSendJpegFrame: (frame: Buffer) => Promise<boolean>;
  saveSupervisionPair: typeof saveSupervisionPair;
};

const defaultKitchenRouteTestDeps: KitchenRouteTestDeps = {
  runERMode,
  extractEROptions,
  captureFrame,
  saveKitchenFrame,
  appendKitchenEvent,
  appendKitchenStepSegment,
  saveCurrentRunSnapshot,
  warmKitchenProtocolCamera,
  startNativeRecording,
  stopNativeRecording,
  refreshNativeRecordingStatus,
  previewHealthSnapshot,
  enableWifiProxy,
  getWifiProxyStatus,
  startGlassesAudioBridge,
  stopGlassesAudioBridge,
  getGlassesAudioBridgeStatus,
  liveCoachStop: (opts) => liveCoach.stop(opts),
  saveKitchenSessionManifest,
  liveCoachSetActiveProtocol: (protocolId) => liveCoach.setActiveProtocol(protocolId),
  liveCoachSendText: (text) => liveCoach.sendText(text),
  liveCoachSendJpegFrame: (frame) => liveCoach.sendJpegFrame(frame),
  saveSupervisionPair,
};

let kitchenRouteTestDeps: KitchenRouteTestDeps = { ...defaultKitchenRouteTestDeps };

export function getKitchenRouteDeps() {
  return kitchenRouteTestDeps;
}

export function setKitchenRouteDepsForTests(overrides: Partial<KitchenRouteTestDeps>) {
  kitchenRouteTestDeps = { ...defaultKitchenRouteTestDeps, ...overrides };
}

export function resetKitchenRouteDepsForTests() {
  kitchenRouteTestDeps = { ...defaultKitchenRouteTestDeps };
}
