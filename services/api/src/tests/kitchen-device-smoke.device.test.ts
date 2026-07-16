import assert from "node:assert/strict";
import { adb, getDeviceInfo, getDeviceStatus, setTargetDevice } from "../adb.js";
import {
  previewHealthSnapshot,
  refreshNativeRecordingStatus,
  startNativeRecording,
  stopNativeRecording,
  warmKitchenProtocolCamera,
} from "../preview/device-preview.js";
import { BUTTON_CONFIRM_ACTION } from "../ai/kitchen/application/button-confirm-service.js";
import { cueToAsset, playAudioCue, prepareAudioCueTransport } from "../lib/audio-cues.js";
import { extractButtonMappings, fetchLabosSettings } from "../lib/labos-settings.js";
import { getLabosStatus } from "../routes/labos.js";

const DEVICE_IP = process.env.LABOS_DEVICE_IP || process.env.LABOS_GLASSES_IP || "";
const DEVICE_SERIAL = process.env.LABOS_DEVICE_SERIAL || "";
const STRICT = process.env.LABOS_DEVICE_TEST_STRICT === "true";
const ALLOW_STOP_ACTIVE = process.env.LABOS_DEVICE_SMOKE_ALLOW_STOP_ACTIVE === "true";

function skip(reason: string) {
  const message = `[kitchen-device-smoke] skipped: ${reason}`;
  if (STRICT) throw new Error(message);
  console.log(message);
}

function recordingActive(value: any) {
  return value?.state?.active === true || value?.health?.recording === true;
}

async function connectConfiguredDevice() {
  if (DEVICE_SERIAL) {
    setTargetDevice(DEVICE_SERIAL);
  }
  if (DEVICE_IP) {
    const output = await adb(["connect", `${DEVICE_IP}:5555`], 15_000).catch((error: any) => error?.message || String(error));
    console.log(`[kitchen-device-smoke] adb connect ${DEVICE_IP}:5555 -> ${output}`);
  }
}

async function requireConnectedDevice() {
  await connectConfiguredDevice();
  const status = await getDeviceStatus();
  if (!status.connected) {
    skip(`no connected ADB glasses. Set LABOS_DEVICE_IP or LABOS_DEVICE_SERIAL before pnpm --filter @openlabos/api test:device. status=${JSON.stringify(status)}`);
    return null;
  }
  return status;
}

async function assertLabosReady() {
  const status = await getLabosStatus();
  assert.equal(status.isInstalled, true, "LabOS core app must be installed on the glasses");
  assert.equal(status.isRunning, true, "LabOS core app must be running before the kitchen device smoke test");
  assert.equal(status.modules.every((module) => module.installed), true, "All LabOS modules should be installed");
  return status;
}

async function assertButtonMapping() {
  const settings = await fetchLabosSettings(300);
  const mappings = extractButtonMappings(settings);
  assert.equal(
    mappings.camera_short,
    BUTTON_CONFIRM_ACTION,
    `camera_short must be mapped to ${BUTTON_CONFIRM_ACTION}; current=${mappings.camera_short}`,
  );
  return mappings;
}

async function assertPreviewReady() {
  await warmKitchenProtocolCamera();
  const preview = await previewHealthSnapshot();
  assert.equal(
    preview.frameReachable || (preview.streaming && Number(preview.frameCount || 0) > 0),
    true,
    `Preview must provide frames; health=${JSON.stringify(preview)}`,
  );
  return preview;
}

async function assertAudioCueReady() {
  const transport = await prepareAudioCueTransport();
  assert.equal(transport.ready, true, `Audio cue transport must be ready; status=${JSON.stringify(transport)}`);
  const cue = await playAudioCue("step_start");
  assert.notEqual(cue.mode, "silent", `step_start audio cue must play ${cueToAsset("step_start")}; result=${JSON.stringify(cue)}`);
  return cue;
}

async function assertNativeRecordingRoundTrip() {
  const before = await refreshNativeRecordingStatus();
  if (recordingActive(before) && !ALLOW_STOP_ACTIVE) {
    skip("native recording is already active; not stopping a user-started recording. Set LABOS_DEVICE_SMOKE_ALLOW_STOP_ACTIVE=true to allow this smoke test to own it.");
    return null;
  }

  let started = false;
  try {
    const start = await startNativeRecording("device-smoke");
    started = true;
    assert.equal(start?.success, true, `startNativeRecording failed: ${JSON.stringify(start)}`);
    const active = await refreshNativeRecordingStatus();
    assert.equal(recordingActive(active), true, `Native recording should become active; status=${JSON.stringify(active)}`);
    return { start, active };
  } finally {
    if (started) {
      const stop = await stopNativeRecording("device_smoke_cleanup");
      assert.equal(stop?.success, true, `stopNativeRecording cleanup failed: ${JSON.stringify(stop)}`);
      const stopped = await refreshNativeRecordingStatus();
      assert.equal(recordingActive(stopped), false, `Native recording should stop after cleanup; status=${JSON.stringify(stopped)}`);
    }
  }
}

async function main() {
  const device = await requireConnectedDevice();
  if (!device) return;

  const [info, labos, mappings, preview, cue, recording] = await (async () => {
    const deviceInfo = await getDeviceInfo();
    const labosStatus = await assertLabosReady();
    const buttonMappings = await assertButtonMapping();
    const previewStatus = await assertPreviewReady();
    const cueResult = await assertAudioCueReady();
    const recordingResult = await assertNativeRecordingRoundTrip();
    return [deviceInfo, labosStatus, buttonMappings, previewStatus, cueResult, recordingResult] as const;
  })();

  console.log("[kitchen-device-smoke] connected", {
    device: device.device,
    model: info.model,
    ip: info.ipAddress || device.ip,
    labosRunning: labos.isRunning,
    cameraShort: mappings.camera_short,
    frameBytes: preview.frameBytes,
    audioMode: cue.mode,
    recordingChecked: recording !== null,
  });
  console.log("[kitchen-device-smoke] all checks passed");
}

await main();
