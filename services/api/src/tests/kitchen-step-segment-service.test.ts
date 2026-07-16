import assert from "node:assert/strict";
import { KitchenRecordingService } from "../ai/kitchen/application/recording-service.js";
import {
  KitchenStepSegmentService,
  KitchenStepSegmentServiceError,
} from "../ai/kitchen/application/step-segment-service.js";
import { ProtocolTracker } from "../ai/kitchen/tracker.js";

function createRunningStep() {
  const tracker = new ProtocolTracker();
  const run = tracker.startRun("kitchen-tea-v1");
  tracker.forceStart();
  run.createdAt = 8_000;
  run.startedAt = 9_000;
  const currentStep = tracker.getCurrentStep()!;
  currentStep.startedAt = 9_500;
  return {
    run,
    currentStep,
    attempt: tracker.getCurrentStepAttempt(),
  };
}

function createHarness(opts: {
  active?: boolean;
  chunkError?: boolean;
} = {}) {
  let active = opts.active !== false;
  const calls: string[] = [];
  const chunkCalls: unknown[] = [];
  const recording = new KitchenRecordingService({
    startNativeRecording: async () => {
      active = true;
      return { state: { active: true } };
    },
    stopNativeRecording: async (reason) => {
      calls.push(`stop:${reason || ""}`);
      if (!active) {
        return { alreadyStopped: true, state: { active: false }, health: { recording: false } };
      }
      active = false;
      return {
        state: {
          active: false,
          lastVideoPath: "/storage/emulated/0/LabOS/media/segment.mp4",
          stoppedAt: "2026-04-30T12:00:10.000Z",
        },
        health: {
          recording: false,
          lastVideoPath: "/storage/emulated/0/LabOS/media/segment.mp4",
        },
      };
    },
    refreshNativeRecordingStatus: async () => ({
      state: {
        active,
        activeVideoPath: active ? "/storage/emulated/0/LabOS/media/current.mp4" : "",
      },
      health: {
        recording: active,
        activeVideoPath: active ? "/storage/emulated/0/LabOS/media/current.mp4" : "",
      },
    }),
  });
  const service = new KitchenStepSegmentService({
    recording,
    captureFrame: async () => Buffer.from("jpeg"),
    saveKitchenFrame: async (_frame, saveOpts) => `kitchen/frames/${saveOpts?.prefix || "frame"}.jpg`,
    materializeRecentPreviewChunk: async (chunkOpts) => {
      chunkCalls.push(chunkOpts);
      if (opts.chunkError) throw new Error("ffmpeg unavailable");
      return { chunkRef: "kitchen/chunks/test.mp4" };
    },
    now: () => 10_000,
    randomSuffix: () => "abc123",
  });
  return {
    service,
    calls,
    chunkCalls,
    isActive: () => active,
  };
}

async function main() {
  {
    const { run, currentStep, attempt } = createRunningStep();
    const harness = createHarness();
    const segment = await harness.service.captureConfirmedStep({
      run,
      currentStep,
      attempt,
      captureChunk: true,
      requireNativeRecording: true,
      notes: [" keep ", "", "second"],
      chunkWindowMs: 1_200,
      videoFps: 2,
    });
    assert.equal(segment.id, `${run.id}-step1-10000-abc123`);
    assert.equal(segment.stepNumber, 1);
    assert.equal(segment.attemptId, attempt?.attemptId);
    assert.equal(segment.attemptNumber, 1);
    assert.equal(segment.startedAt, 9_500);
    assert.equal(segment.endedAt, 10_000);
    assert.equal(segment.durationMs, 500);
    assert.deepEqual(segment.notes, ["keep", "second"]);
    assert.deepEqual(segment.frameRefs, [`kitchen/frames/segment-step1-${run.id}.jpg`]);
    assert.deepEqual(segment.chunkRefs, ["kitchen/chunks/test.mp4"]);
    assert.equal(segment.nativeRecording?.active, true);
    assert.equal(segment.nativeRecording?.activeVideoPath, "/storage/emulated/0/LabOS/media/current.mp4");
    assert.deepEqual(harness.chunkCalls, [{
      runId: run.id,
      protocolId: "kitchen-tea-v1",
      stepNumber: 1,
      windowMs: 1_200,
      fps: 2,
    }]);
  }

  {
    const { run, currentStep, attempt } = createRunningStep();
    const harness = createHarness();
    const segment = await harness.service.captureConfirmedStep({
      run,
      currentStep,
      attempt,
      captureFrame: false,
      captureChunk: false,
    });
    assert.deepEqual(segment.frameRefs, []);
    assert.deepEqual(segment.chunkRefs, []);
  }

  {
    const { run, currentStep, attempt } = createRunningStep();
    const harness = createHarness({ chunkError: true });
    const segment = await harness.service.captureConfirmedStep({
      run,
      currentStep,
      attempt,
      captureChunk: true,
    });
    assert.deepEqual(segment.chunkRefs, []);
  }

  {
    const { run, currentStep, attempt } = createRunningStep();
    const harness = createHarness();
    const segment = await harness.service.captureConfirmedStep({
      run,
      currentStep,
      attempt,
      requireNativeRecording: true,
      stopRecordingForSegment: true,
    });
    assert.equal(harness.isActive(), false);
    assert.deepEqual(harness.calls, ["stop:step_segment_complete"]);
    assert.equal(segment.nativeRecording?.active, false);
    assert.equal(segment.nativeRecording?.lastVideoPath, "/storage/emulated/0/LabOS/media/segment.mp4");
  }

  {
    const { run, currentStep, attempt } = createRunningStep();
    const harness = createHarness({ active: false });
    await assert.rejects(
      () => harness.service.captureConfirmedStep({
        run,
        currentStep,
        attempt,
        requireNativeRecording: true,
      }),
      (error: any) => error instanceof KitchenStepSegmentServiceError
        && error.status === 400
        && /Native recording is not active/.test(error.message),
    );
  }

  {
    const tracker = new ProtocolTracker();
    const run = tracker.startRun("kitchen-tea-v1");
    const harness = createHarness();
    await assert.rejects(
      () => harness.service.captureConfirmedStep({
        run,
        currentStep: run.steps[0],
        attempt: tracker.getCurrentStepAttempt(),
      }),
      (error: any) => error instanceof KitchenStepSegmentServiceError
        && /Run must be running/.test(error.message),
    );
  }

  console.log("[kitchen-step-segment-service] all checks passed");
}

await main();
