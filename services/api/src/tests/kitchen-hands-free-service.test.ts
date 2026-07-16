import assert from "node:assert/strict";
import { getProtocol } from "../ai/kitchen/index.js";
import { KitchenHandsFreeService, type KitchenHandsFreeServicePorts } from "../ai/kitchen/application/hands-free-service.js";
import { KitchenRecordingService } from "../ai/kitchen/application/recording-service.js";
import { KitchenRunService, type KitchenRunServicePorts } from "../ai/kitchen/application/run-service.js";
import { KitchenStepSegmentService } from "../ai/kitchen/application/step-segment-service.js";
import { ProtocolTracker } from "../ai/kitchen/tracker.js";
import { getLabOSFeatureFlags } from "../config/features.js";

function createRunServicePorts(tracker: ProtocolTracker, events: Array<{ type: string; payload?: unknown }>): KitchenRunServicePorts {
  const recording = new KitchenRecordingService({
    startNativeRecording: async () => ({ state: { active: true } }),
    stopNativeRecording: async () => ({ state: { active: false } }),
    refreshNativeRecordingStatus: async () => ({ state: { active: true }, health: { recording: true } }),
  });
  return {
    tracker,
    getProtocol,
    featureFlags: () => getLabOSFeatureFlags({}),
    recording,
    stepSegments: new KitchenStepSegmentService({
      recording,
      captureFrame: async () => Buffer.from("jpeg"),
      saveKitchenFrame: async () => "kitchen/frames/test.jpg",
      materializeRecentPreviewChunk: async () => ({ chunkRef: "kitchen/chunks/test.mp4" }),
    }),
    appendKitchenStepSegment: async () => {},
    runAdherenceTick: async () => null,
    saveKitchenSessionManifest: async (runId) => ({ manifestRef: `kitchen/manifests/${runId}.json` }),
    recordEvent: (type, _run, payload) => {
      events.push({ type, payload });
    },
    warmCamera: async () => {},
    stopRealtimeSupervisor: async () => {},
    sendLiveCoachSetupContext: async () => {
      events.push({ type: "coach_setup" });
    },
    sendLiveCoachStepContext: async (_run, step, phase) => {
      events.push({ type: "coach_step", payload: { stepNumber: step.step.number, phase } });
    },
    sendLiveCoachRunCompleteContext: async () => {
      events.push({ type: "coach_complete" });
    },
  };
}

function createHarness(overrides: Partial<KitchenHandsFreeServicePorts> = {}) {
  const tracker = new ProtocolTracker();
  const events: Array<{ type: string; payload?: unknown }> = [];
  const runService = new KitchenRunService(createRunServicePorts(tracker, events));
  const calls = {
    wifi: 0,
    audioStart: 0,
    audioStop: 0,
    recordingStart: 0,
    recordingStop: 0,
    manifestSave: 0,
    supervisorStart: 0,
    supervisorStop: [] as string[],
    liveCoachStop: 0,
    handsFreeCoach: 0,
  };

  let recordingActive = true;
  const ports: KitchenHandsFreeServicePorts = {
    tracker,
    runService,
    getProtocol,
    featureFlags: () => getLabOSFeatureFlags({
      LABOS_HANDS_FREE_ENABLED: "true",
      LABOS_REALTIME_SUPERVISOR_ENABLED: "true",
    }),
    enableWifiProxy: async () => {
      calls.wifi++;
      return { success: true };
    },
    startGlassesAudioBridge: async () => {
      calls.audioStart++;
      return { running: true };
    },
    stopGlassesAudioBridge: async () => {
      calls.audioStop++;
      return { running: false };
    },
    getGlassesAudioBridgeStatus: async () => ({ connected: true, running: true }),
    startNativeRecording: async () => {
      calls.recordingStart++;
      return { success: true };
    },
    stopNativeRecording: async () => {
      calls.recordingStop++;
      recordingActive = false;
      return { success: true };
    },
    refreshNativeRecordingStatus: async () => ({
      state: { active: recordingActive },
      health: { recording: recordingActive },
    }),
    saveKitchenSessionManifest: async (runId) => {
      calls.manifestSave++;
      return { manifestRef: `kitchen/manifests/${runId}.json` };
    },
    supervisorDefaults: () => ({ intervalMs: 1000, maxChecks: 2 }),
    startRealtimeSupervisor: async () => {
      calls.supervisorStart++;
      return { running: true };
    },
    stopRealtimeSupervisor: (reason) => {
      calls.supervisorStop.push(reason);
      return { running: false };
    },
    recordEvent: (type, _run, payload) => {
      events.push({ type, payload });
    },
    sendLiveCoachHandsFreeStartContext: async () => {
      calls.handsFreeCoach++;
      events.push({ type: "coach_hands_free" });
    },
    liveCoachStop: async () => {
      calls.liveCoachStop++;
      return null;
    },
    ...overrides,
  };

  return {
    service: new KitchenHandsFreeService(ports),
    tracker,
    events,
    calls,
    setRecordingActive: (active: boolean) => {
      recordingActive = active;
    },
  };
}

async function main() {
  const harness = createHarness();
  const start = await harness.service.startHandsFreeRun({
    protocolId: "kitchen-tea-v1",
    glassesIp: "192.168.50.122",
    wsUrl: "ws://127.0.0.1:3847/api/live-coach/ws",
    supervisor: { intervalMs: 3000, maxChecks: 1, immediate: false },
    captureInventoryPreflight: async () => ({
      passed: true,
      detectedItems: ["mug", "tray"],
      missingItems: [],
      frameRef: "kitchen/frames/inventory.jpg",
      spatialSummary: { objects: [{ label: "mug" }] },
      voiceContext: "Inventory preflight: mug is on the tray.",
      latencyMs: 12,
    }),
  });
  assert.equal(start.success, true);
  assert.equal(start.run?.status, "running");
  assert.equal(harness.tracker.summary?.status, "running");
  assert.equal(harness.calls.wifi, 1);
  assert.equal(harness.calls.audioStart, 1);
  assert.equal(harness.calls.recordingStart, 1);
  assert.equal(harness.calls.supervisorStart, 1);
  assert.equal(harness.calls.handsFreeCoach, 1);
  assert.deepEqual(
    harness.events.map((event) => event.type).filter((type) => !type.startsWith("coach_")),
    ["run_start", "workspace_check", "run_force_start"],
  );
  assert.equal(
    harness.events.some((event) => event.type === "coach_step"),
    false,
    "hands-free start should use one hands-free coach message, not duplicate step-context chatter",
  );

  const stop = await harness.service.stopHandsFreeRun();
  assert.equal(stop.success, true);
  assert.equal(stop.cleanup.recordingStopped, true);
  assert.equal(stop.cleanup.manifestSaved, true);
  assert.equal(harness.tracker.summary?.status, "aborted");
  assert.equal(harness.calls.audioStop, 1);
  assert.equal(harness.calls.liveCoachStop, 1);
  assert.equal(harness.calls.supervisorStop.at(-1), "hands_free_stop");
  assert.ok(harness.events.some((event) => event.type === "run_abort"));

  const disabledHarness = createHarness({
    featureFlags: () => getLabOSFeatureFlags({
      LABOS_HANDS_FREE_ENABLED: "false",
      LABOS_REALTIME_SUPERVISOR_ENABLED: "true",
    }),
  });
  await assert.rejects(
    () => disabledHarness.service.startHandsFreeRun({
      protocolId: "kitchen-tea-v1",
      captureInventoryPreflight: async () => ({
        passed: false,
        detectedItems: [],
        missingItems: [],
        voiceContext: "",
      }),
    }),
    /hands-free protocol runs are disabled/i,
  );

  const noRecordingHarness = createHarness();
  noRecordingHarness.setRecordingActive(false);
  await assert.rejects(
    () => noRecordingHarness.service.startHandsFreeRun({
      protocolId: "kitchen-tea-v1",
      captureInventoryPreflight: async () => ({
        passed: false,
        detectedItems: [],
        missingItems: [],
        voiceContext: "",
      }),
    }),
    /native recording did not become active/i,
  );
  assert.equal(noRecordingHarness.calls.recordingStop, 1);
  assert.equal(noRecordingHarness.calls.supervisorStop.at(-1), "hands_free_start_failed");

  console.log("[kitchen-hands-free-service] all checks passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
