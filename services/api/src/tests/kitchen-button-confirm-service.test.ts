import assert from "node:assert/strict";
import { getProtocol } from "../ai/kitchen/index.js";
import {
  BUTTON_CONFIRM_ACTION,
  KitchenButtonConfirmService,
} from "../ai/kitchen/application/button-confirm-service.js";
import { KitchenRecordingService } from "../ai/kitchen/application/recording-service.js";
import { KitchenRunService, type KitchenRunServicePorts } from "../ai/kitchen/application/run-service.js";
import { KitchenStepSegmentService } from "../ai/kitchen/application/step-segment-service.js";
import { ProtocolTracker } from "../ai/kitchen/tracker.js";
import { getLabOSFeatureFlags } from "../config/features.js";

function createRunService(tracker: ProtocolTracker, calls: string[], opts: { recordingActive?: boolean } = {}) {
  const recordingActive = opts.recordingActive !== false;
  const recording = new KitchenRecordingService({
    startNativeRecording: async () => ({ state: { active: true } }),
    stopNativeRecording: async () => recordingActive
      ? ({ state: { active: false } })
      : ({ alreadyStopped: true, state: { active: false } }),
    refreshNativeRecordingStatus: async () => recordingActive
      ? ({ state: { active: true }, health: { recording: true } })
      : ({ state: { active: false }, health: { recording: false } }),
  });
  const ports: KitchenRunServicePorts = {
    tracker,
    getProtocol,
    featureFlags: () => getLabOSFeatureFlags({}),
    recording,
    stepSegments: new KitchenStepSegmentService({
      recording,
      captureFrame: async () => Buffer.from("jpeg"),
      saveKitchenFrame: async () => "kitchen/frames/button-confirm.jpg",
      materializeRecentPreviewChunk: async () => ({ chunkRef: "kitchen/chunks/test.mp4" }),
    }),
    appendKitchenStepSegment: async () => {
      calls.push("segment");
    },
    runAdherenceTick: async () => ({ stepAdvanced: false }),
    saveKitchenSessionManifest: async (runId) => ({ manifestRef: `kitchen/manifests/${runId}.json` }),
    recordEvent: async (type) => {
      calls.push(type);
    },
    warmCamera: async () => {},
    stopRealtimeSupervisor: async () => {},
    sendLiveCoachSetupContext: async () => {},
    sendLiveCoachStepContext: async (_run, step, phase) => {
      calls.push(`step:${step.step.number}:${phase}`);
    },
    sendLiveCoachRunCompleteContext: async () => {
      calls.push("complete");
    },
  };
  return new KitchenRunService(ports);
}

function createHarness(opts: {
  enabled?: boolean;
  mapped?: boolean;
  recordingActive?: boolean;
  now?: () => number;
} = {}) {
  const tracker = new ProtocolTracker();
  const calls: string[] = [];
  const cues: string[] = [];
  const runService = createRunService(tracker, calls, { recordingActive: opts.recordingActive });
  const service = new KitchenButtonConfirmService({
    tracker,
    runService,
    featureFlags: () => getLabOSFeatureFlags({
      LABOS_BUTTON_CONFIRM_ENABLED: opts.enabled === false ? "false" : "true",
      LABOS_PROTOCOL_MODE: "manual",
      LABOS_STEP_SEGMENTS_ENABLED: "true",
      LABOS_CONFIRM_STEP_VALIDATION_ENABLED: "false",
    }),
    getButtonMappings: async () => ({
      camera_short: opts.mapped === false ? "take_photo" : BUTTON_CONFIRM_ACTION,
    }),
    playCue: async (cue) => {
      cues.push(cue);
    },
    now: opts.now,
  });
  return { tracker, calls, cues, runService, service };
}

async function main() {
  let clock = 10_000;
  const harness = createHarness({ now: () => clock });
  await harness.runService.beginRun({ protocolId: "kitchen-tea-v1", suppressStepCoach: true });
  const result = await harness.service.handleButtonPress({
    timestamp: clock,
    buttonId: "camera",
    isLongPress: false,
  });
  assert.equal(result.handled, true);
  assert.equal(result.stepNumber, 1);
  assert.equal(result.completedManually, true);
  assert.equal(typeof result.timingsMs?.total, "number");
  assert.equal(harness.tracker.summary?.currentStep, 2);
  assert.ok(harness.calls.includes("confirm_step"));
  assert.ok(harness.calls.includes("complete_step"));
  assert.deepEqual(harness.cues, ["step_start", "verify_success"]);

  const debounced = await harness.service.handleButtonPress({
    timestamp: clock + 100,
    buttonId: "camera",
    isLongPress: false,
  });
  assert.equal(debounced.handled, false);
  assert.equal(debounced.ignoredReason, "debounced");
  assert.deepEqual(harness.cues, ["step_start", "verify_success"]);

  const unmapped = createHarness({ mapped: false });
  await unmapped.runService.beginRun({ protocolId: "kitchen-tea-v1", suppressStepCoach: true });
  const unmappedResult = await unmapped.service.handleButtonPress({
    timestamp: Date.now(),
    buttonId: "camera",
    isLongPress: false,
  });
  assert.equal(unmappedResult.handled, false);
  assert.equal(unmappedResult.ignoredReason, "button_not_mapped_to_confirm_step");
  assert.equal(unmapped.tracker.summary?.currentStep, 1);
  assert.deepEqual(unmapped.cues, ["step_start", "verify_fail"]);

  const disabled = createHarness({ enabled: false });
  await disabled.runService.beginRun({ protocolId: "kitchen-tea-v1", suppressStepCoach: true });
  const disabledResult = await disabled.service.handleButtonPress({
    timestamp: Date.now(),
    buttonId: "camera",
    isLongPress: false,
  });
  assert.equal(disabledResult.handled, false);
  assert.equal(disabledResult.ignoredReason, "feature_disabled");

  const noActive = createHarness();
  const noActiveResult = await noActive.service.handleButtonPress({
    timestamp: Date.now(),
    buttonId: "camera",
    isLongPress: false,
  });
  assert.equal(noActiveResult.handled, false);
  assert.equal(noActiveResult.ignoredReason, "no_active_running_step");
  assert.deepEqual(noActive.cues, ["verify_fail"]);

  const inactiveRecording = createHarness({ recordingActive: false });
  await inactiveRecording.runService.beginRun({ protocolId: "kitchen-tea-v1", suppressStepCoach: true });
  const inactiveRecordingResult = await inactiveRecording.service.handleButtonPress({
    timestamp: Date.now(),
    buttonId: "camera",
    isLongPress: false,
  });
  assert.equal(inactiveRecordingResult.handled, false);
  assert.equal(inactiveRecordingResult.ignoredReason, "native_recording_inactive");
  assert.equal(inactiveRecording.tracker.summary?.currentStep, 1);
  assert.deepEqual(inactiveRecording.cues, ["step_start", "verify_fail"]);

  clock += 2_000;
  const longPress = await harness.service.handleButtonPress({
    timestamp: clock,
    buttonId: "camera",
    isLongPress: true,
  });
  assert.equal(longPress.handled, false);
  assert.equal(longPress.ignoredReason, "long_press_ignored");

  console.log("[kitchen-button-confirm-service] all checks passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
