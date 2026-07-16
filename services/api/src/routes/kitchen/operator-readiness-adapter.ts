import { getDeviceStatus } from "../../adb.js";
import { sensorBridge } from "../../ai/sensor-bridge.js";
import { KitchenOperatorDeviceService } from "../../ai/kitchen/application/operator-device-service.js";
import { getLabOSFeatureConfig } from "../../config/features.js";
import { enableWifiProxy, getToken } from "../../wifi-proxy.js";
import { getLabosStatus } from "../labos.js";
import { kitchenButtonConfirmStatus } from "./button-confirm-bridge.js";
import { getKitchenRouteDeps } from "./deps.js";

export function createKitchenOperatorDeviceService() {
  const deps = getKitchenRouteDeps();
  return new KitchenOperatorDeviceService({
    featureFlags: () => getLabOSFeatureConfig().effectiveFlags,
    getDeviceStatus,
    getLabosStatus,
    previewHealthSnapshot: deps.previewHealthSnapshot,
    refreshNativeRecordingStatus: deps.refreshNativeRecordingStatus,
    getButtonConfirmStatus: kitchenButtonConfirmStatus,
    enableWifiProxy,
    getToken,
    sensorBridge,
  });
}

export async function ensureKitchenButtonConfirmBridge() {
  return createKitchenOperatorDeviceService().ensureButtonConfirmBridge();
}

export async function kitchenOperatorReadiness() {
  return createKitchenOperatorDeviceService().readiness();
}
