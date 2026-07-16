import { sensorBridge } from "../../ai/sensor-bridge.js";
import {
  BUTTON_CONFIRM_ACTION,
  KitchenButtonConfirmService,
} from "../../ai/kitchen/application/button-confirm-service.js";
import { protocolTracker } from "../../ai/kitchen/index.js";
import { getLabOSFeatureFlags } from "../../config/features.js";
import { playAudioCue, prepareAudioCueTransport } from "../../lib/audio-cues.js";
import { extractButtonMappings, fetchLabosSettings } from "../../lib/labos-settings.js";
import { createKitchenRunService } from "./run-service-adapter.js";

let registered = false;
let cachedMappings: Record<string, string> | null = null;
let cachedMappingsAt = 0;
let mappingRefresh: Promise<Record<string, string>> | null = null;

const BUTTON_MAPPING_CACHE_MS = 30_000;

function refreshButtonMappings() {
  if (!mappingRefresh) {
    mappingRefresh = fetchLabosSettings(500)
      .then((settings) => {
        cachedMappings = extractButtonMappings(settings);
        cachedMappingsAt = Date.now();
        return cachedMappings;
      })
      .finally(() => {
        mappingRefresh = null;
      });
  }
  return mappingRefresh;
}

async function getButtonMappingsForPress() {
  if (cachedMappings && Date.now() - cachedMappingsAt < BUTTON_MAPPING_CACHE_MS) {
    return cachedMappings;
  }
  if (cachedMappings) {
    void refreshButtonMappings().catch(() => {});
    return cachedMappings;
  }
  return refreshButtonMappings();
}

const buttonConfirmService = new KitchenButtonConfirmService({
  tracker: protocolTracker,
  runService: createKitchenRunService(),
  featureFlags: getLabOSFeatureFlags,
  getButtonMappings: getButtonMappingsForPress,
  playCue: playAudioCue,
});

export function registerKitchenButtonConfirmBridge() {
  if (registered) return;
  registered = true;
  void prepareAudioCueTransport().catch(() => {});
  void refreshButtonMappings().catch(() => {});
  sensorBridge.onButtonPress(async (event) => {
    await buttonConfirmService.handleButtonPress(event);
  });
}

export async function kitchenButtonConfirmStatus() {
  void prepareAudioCueTransport().catch(() => {});
  const mappings = await refreshButtonMappings().catch(() => cachedMappings);
  const status = buttonConfirmService.status();
  return {
    ...status,
    action: BUTTON_CONFIRM_ACTION,
    sensorBridgeConnected: sensorBridge.connected,
    mappings,
    mapped: mappings?.camera_short === BUTTON_CONFIRM_ACTION,
    ready: status.enabled && sensorBridge.connected && mappings?.camera_short === BUTTON_CONFIRM_ACTION,
  };
}
