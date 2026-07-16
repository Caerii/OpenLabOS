import assert from "node:assert/strict";
import { getProtocol } from "../ai/kitchen/index.js";
import { KitchenRunService, type KitchenRunServicePorts } from "../ai/kitchen/application/run-service.js";
import { KitchenRecordingService } from "../ai/kitchen/application/recording-service.js";
import { KitchenStepSegmentService } from "../ai/kitchen/application/step-segment-service.js";
import type { KitchenStepSegment } from "../ai/kitchen/run-store.js";
import { ProtocolTracker, type VerificationResult } from "../ai/kitchen/tracker.js";
import { getLabOSFeatureFlags } from "../config/features.js";

function passingVerification(frameRef?: string): VerificationResult {
  return {
    timestamp: Date.now(),
    success: true,
    confidence: 0.95,
    reasoning: "test pass",
    rawResponse: { source: "test" },
    frameRef,
  };
}

function createHarness(overrides: Partial<KitchenRunServicePorts> = {}) {
  const tracker = new ProtocolTracker();
  const events: Array<{ type: string; runId?: string | null; payload?: unknown }> = [];
  const segments: KitchenStepSegment[] = [];
  const recording = { active: false, started: 0, stopped: 0 };
  const manifests: string[] = [];
  const liveCoach: string[] = [];

  const startNativeRecording = async () => {
      recording.active = true;
      recording.started++;
      return { state: { active: true } };
    };
  const stopNativeRecording = async () => {
      recording.active = false;
      recording.stopped++;
      return {
        state: {
          active: false,
          activeVideoPath: "",
          lastVideoPath: "/storage/emulated/0/LabOS/media/run.mp4",
          stoppedAt: new Date().toISOString(),
        },
        health: {
          recording: false,
          lastVideoPath: "/storage/emulated/0/LabOS/media/run.mp4",
        },
      };
    };
  const refreshNativeRecordingStatus = async () => ({
      state: {
        active: recording.active,
        activeVideoPath: recording.active ? "/storage/emulated/0/LabOS/media/run.mp4" : "",
      },
      health: {
        recording: recording.active,
        activeVideoPath: recording.active ? "/storage/emulated/0/LabOS/media/run.mp4" : "",
      },
    });
  const defaultRecordingService = new KitchenRecordingService({
    startNativeRecording,
    stopNativeRecording,
    refreshNativeRecordingStatus,
  });
  const recordingService = overrides.recording ?? defaultRecordingService;
  const stepSegments = overrides.stepSegments ?? new KitchenStepSegmentService({
    recording: recordingService,
    captureFrame: async () => Buffer.from("jpeg"),
    saveKitchenFrame: async (_frame, opts) => `kitchen/frames/${opts?.prefix || "frame"}.jpg`,
    materializeRecentPreviewChunk: async () => ({ chunkRef: "kitchen/chunks/test.mp4" }),
  });

  const ports: KitchenRunServicePorts = {
    tracker,
    getProtocol,
    featureFlags: () => getLabOSFeatureFlags({}),
    recording: recordingService,
    stepSegments,
    appendKitchenStepSegment: async (segment) => {
      segments.push(segment);
    },
    runAdherenceTick: async () => ({ adherence: { action: "confirming" } }),
    saveKitchenSessionManifest: async (runId) => {
      manifests.push(runId || "");
      return { manifestRef: `kitchen/manifests/${runId}.json` };
    },
    recordEvent: (type, run, payload) => {
      events.push({ type, runId: run?.id ?? null, payload });
    },
    warmCamera: async () => {},
    stopRealtimeSupervisor: async (reason) => {
      liveCoach.push(`stop-realtime:${reason}`);
    },
    sendLiveCoachSetupContext: async () => {
      liveCoach.push("setup");
    },
    sendLiveCoachStepContext: async (_run, step, reason) => {
      liveCoach.push(`step:${step.step.number}:${reason}`);
    },
    sendLiveCoachRunCompleteContext: async () => {
      liveCoach.push("complete");
    },
    ...overrides,
  };

  return {
    service: new KitchenRunService(ports),
    tracker,
    events,
    segments,
    recording,
    manifests,
    liveCoach,
  };
}

async function main() {
  const teaProtocol = getProtocol("kitchen-tea-v1")!;
  const harness = createHarness();
  const begin = await harness.service.beginRun({ protocolId: "kitchen-tea-v1", suppressStepCoach: true });
  assert.equal(begin.success, true);
  assert.equal(begin.run?.status, "running");
  assert.equal(harness.tracker.getCurrentStep()?.step.number, 1);
  assert.equal(harness.tracker.getCurrentStep()?.step.instruction, teaProtocol.steps[0].instruction);
  assert.equal(harness.recording.active, true);
  assert.deepEqual(harness.events.map((event) => event.type), ["run_start", "run_force_start"]);

  const confirm1 = await harness.service.confirmStep({
    requireNativeRecording: true,
    captureFrame: true,
    captureChunk: true,
    validate: false,
  });
  assert.equal(confirm1.segment.stepNumber, 1);
  assert.equal(confirm1.segment.attemptNumber, 1);
  assert.equal(confirm1.segment.frameRefs.length, 1);
  assert.equal(confirm1.segment.chunkRefs.length, 1);

  await harness.service.completeStep();
  assert.equal(harness.tracker.summary?.currentStep, 2);
  assert.equal(harness.tracker.getCurrentStep()?.step.instruction, teaProtocol.steps[1].instruction);

  const undo = await harness.service.undoStep("operator redo");
  assert.equal(undo.attempt?.attemptNumber, 2);
  assert.equal(harness.tracker.summary?.currentStep, 1);

  const confirm2 = await harness.service.confirmStep({
    requireNativeRecording: true,
    captureFrame: false,
    captureChunk: false,
    validate: false,
  });
  assert.equal(confirm2.segment.attemptNumber, 2);
  assert.equal(confirm2.segment.supersedesAttemptId, confirm1.segment.attemptId);

  const abort = await harness.service.abortRun("test cleanup");
  assert.equal(abort.cleanup.recordingStopped, true);
  assert.equal(abort.cleanup.manifestSaved, true);
  assert.equal(harness.recording.active, false);
  assert.equal(harness.tracker.summary?.status, "aborted");
  assert.ok(harness.manifests.includes(begin.run!.id));

  const noRecordingHarness = createHarness({
    recording: new KitchenRecordingService({
      startNativeRecording: async () => ({ state: { active: true } }),
      stopNativeRecording: async () => ({ state: { active: false } }),
      refreshNativeRecordingStatus: async () => ({ state: { active: false }, health: { recording: false } }),
    }),
  });
  await noRecordingHarness.service.beginRun({ protocolId: "kitchen-tea-v1", suppressStepCoach: true });
  await assert.rejects(
    () => noRecordingHarness.service.confirmStep({ requireNativeRecording: true }),
    /Native recording is not active/,
  );

  const segmentStopHarness = createHarness();
  await segmentStopHarness.service.beginRun({ protocolId: "kitchen-tea-v1", suppressStepCoach: true });
  const stoppedSegment = await segmentStopHarness.service.confirmStep({
    requireNativeRecording: true,
    captureFrame: false,
    stopRecordingForSegment: true,
    validate: false,
  });
  assert.equal(segmentStopHarness.recording.active, false);
  assert.equal(segmentStopHarness.recording.stopped, 1);
  assert.equal(stoppedSegment.segment.nativeRecording?.active, false);
  assert.equal(stoppedSegment.segment.nativeRecording?.lastVideoPath, "/storage/emulated/0/LabOS/media/run.mp4");
  await segmentStopHarness.service.completeStep();
  assert.equal(segmentStopHarness.recording.active, true);
  assert.equal(segmentStopHarness.recording.started, 2);

  const workspaceHarness = createHarness();
  await workspaceHarness.service.startSetupRun({ protocolId: "kitchen-tea-v1" });
  const setupRun = workspaceHarness.tracker.getCurrentRun()!;
  assert.equal(workspaceHarness.tracker.summary?.status, "setup");
  const workspace = await workspaceHarness.service.applyWorkspaceCheck({
    run: setupRun,
    passed: true,
    missingItems: [],
    detectedItems: ["mug", "tray"],
    eventPayload: {
      passed: true,
      detectedItems: ["mug", "tray"],
      missingItems: [],
    },
  });
  assert.equal(workspace.success, true);
  assert.equal(workspace.currentStep?.number, 1);
  assert.equal(workspaceHarness.tracker.summary?.status, "running");
  assert.equal(workspaceHarness.events.at(-1)?.type, "workspace_check");
  assert.equal(workspaceHarness.liveCoach.at(-1), "step:1:start");

  const progressionHarness = createHarness();
  await progressionHarness.service.beginRun({ protocolId: "kitchen-tea-v1", suppressStepCoach: true });
  const firstRun = progressionHarness.tracker.getCurrentRun()!;
  const firstStep = progressionHarness.tracker.getCurrentStep()!;
  const firstProgression = await progressionHarness.service.applyStepEvidence({
    run: firstRun,
    currentStep: firstStep,
    verification: passingVerification("kitchen/frames/first.jpg"),
    eventPayload: {
      stepNumber: firstStep.step.number,
      verification: passingVerification("kitchen/frames/first.jpg"),
    },
    onRecorded: () => {
      progressionHarness.liveCoach.push("verification-context");
    },
  });
  assert.equal(firstProgression.stepAdvanced, true);
  assert.equal(firstProgression.runCompleted, false);
  assert.equal(firstProgression.currentStep?.number, 2);
  assert.deepEqual(progressionHarness.liveCoach.slice(-2), ["verification-context", "step:2:advance"]);
  assert.equal(progressionHarness.events.at(-1)?.type, "verify_step");

  while (progressionHarness.tracker.summary?.status === "running") {
    const run = progressionHarness.tracker.getCurrentRun()!;
    const step = progressionHarness.tracker.getCurrentStep()!;
    await progressionHarness.service.applyStepEvidence({
      run,
      currentStep: step,
      verification: passingVerification(),
      eventPayload: { stepNumber: step.step.number },
    });
  }
  assert.equal(progressionHarness.tracker.summary?.status, "completed");
  assert.equal(progressionHarness.recording.active, false);
  assert.ok(progressionHarness.manifests.includes(progressionHarness.tracker.summary!.id));
  assert.equal(progressionHarness.liveCoach.at(-1), "complete");

  console.log("[kitchen-run-service] all checks passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
