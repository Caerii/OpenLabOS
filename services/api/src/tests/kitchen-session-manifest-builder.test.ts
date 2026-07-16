import assert from "node:assert/strict";
import {
  buildKitchenSessionManifestFromArtifacts,
  type KitchenSessionManifest,
} from "../ai/kitchen/session-manifest.js";
import type { KitchenRunEvent, KitchenStepSegment } from "../ai/kitchen/run-store.js";
import { ProtocolTracker } from "../ai/kitchen/tracker.js";

function createRun() {
  const tracker = new ProtocolTracker();
  const run = tracker.startRun("kitchen-tea-v1");
  tracker.forceStart();
  run.createdAt = 1_000;
  run.startedAt = 1_500;
  run.steps[0].startedAt = 1_600;
  return run;
}

function segmentForRun(run: ReturnType<typeof createRun>): KitchenStepSegment {
  return {
    id: `${run.id}-step1-segment`,
    createdAt: "2026-04-30T12:00:00.000Z",
    runId: run.id,
    protocolId: run.protocolId,
    protocolName: run.protocolName,
    stepNumber: 1,
    attemptId: run.steps[0].attemptId,
    attemptNumber: run.steps[0].attemptNumber,
    stepInstruction: run.steps[0].step.instruction,
    startedAt: 1_600,
    endedAt: 2_000,
    durationMs: 400,
    source: "confirm-step",
    frameRefs: ["kitchen/frames/segment-frame.jpg"],
    chunkRefs: ["kitchen/chunks/segment-chunk.mp4"],
    nativeRecording: {
      active: false,
      lastVideoPath: "/storage/emulated/0/LabOS/media/segment.mp4",
    },
  };
}

function eventForRun(run: ReturnType<typeof createRun>): KitchenRunEvent {
  return {
    ts: 2_100,
    type: "confirm_step",
    runId: run.id,
    protocolId: run.protocolId,
    payload: {
      stepNumber: 1,
      frameRef: "kitchen/frames/event-frame.jpg",
      adherence: {
        action: "advance",
        state: "step_complete",
        confidence: 0.92,
        reason: "operator confirmed",
      },
      selectedChecks: [
        { id: "success-check", scale: "frame", modeId: "success-check" },
      ],
      rollingChunk: {
        chunkRef: "kitchen/chunks/event-chunk.mp4",
        indexRef: "kitchen/chunks/event-index.json",
        frameCount: 5,
        requestedFps: 2,
        actualFps: 1.8,
        startTs: 1_700,
        endTs: 2_100,
        durationMs: 400,
      },
    },
  };
}

function analysisEventForRun(run: ReturnType<typeof createRun>, segment: KitchenStepSegment): KitchenRunEvent {
  return {
    ts: 2_200,
    type: "step_analysis",
    runId: run.id,
    protocolId: run.protocolId,
    payload: {
      analysis: {
        id: `analysis-${segment.id}`,
        status: "completed",
        runId: run.id,
        protocolId: run.protocolId,
        segmentId: segment.id,
        attemptId: segment.attemptId,
        attemptNumber: segment.attemptNumber,
        stepNumber: 1,
        modelId: "lmstudio:test-vlm",
        evidenceRefs: ["kitchen/frames/segment-frame.jpg"],
        performedCorrectly: true,
        confidence: 0.88,
        summary: "Setup evidence is visible.",
        deviation: null,
        visibleEvidence: ["required objects visible"],
        missingEvidence: [],
      },
    },
  };
}

function findFrame(manifest: KitchenSessionManifest, frameRef: string) {
  return manifest.frames.find((frame) => frame.frameRef === frameRef);
}

async function main() {
  const run = createRun();
  const segment = segmentForRun(run);
  const event = eventForRun(run);
  const analysisEvent = analysisEventForRun(run, segment);
  const manifest = buildKitchenSessionManifestFromArtifacts({
    run,
    rawEvents: [event, analysisEvent],
    stepSegments: [segment],
    generatedAt: "2026-04-30T12:34:56.000Z",
  });

  assert.equal(manifest.generatedAt, "2026-04-30T12:34:56.000Z");
  assert.equal(manifest.run.id, run.id);
  assert.equal(manifest.run.protocolId, "kitchen-tea-v1");
  assert.equal(manifest.steps.length, run.steps.length);
  assert.equal(manifest.stepSegments.length, 1);

  assert.equal(manifest.stepAttempts.length, 1);
  assert.equal(manifest.stepAttempts[0].attemptId, run.steps[0].attemptId);
  assert.deepEqual(manifest.stepAttempts[0].segmentIds, [segment.id]);
  assert.deepEqual(manifest.stepAttempts[0].nativeVideoPaths, ["/storage/emulated/0/LabOS/media/segment.mp4"]);

  assert.equal(findFrame(manifest, "kitchen/frames/event-frame.jpg")?.source, "event");
  assert.equal(findFrame(manifest, "kitchen/frames/segment-frame.jpg")?.source, "step_segment");
  assert.ok(manifest.chunks.some((chunk) => (
    chunk.chunkRef === "kitchen/chunks/event-chunk.mp4" &&
    chunk.source === "event" &&
    chunk.frameCount === 5
  )));
  assert.ok(manifest.chunks.some((chunk) => (
    chunk.chunkRef === "kitchen/chunks/segment-chunk.mp4" &&
    chunk.source === "step_segment"
  )));

  assert.equal(manifest.validationCatalog.checks.length, 1);
  assert.equal(manifest.validationCatalog.checks[0].id, "success-check");
  assert.deepEqual(manifest.adherence, [{
    ts: 2_100,
    stepNumber: 1,
    action: "advance",
    state: "step_complete",
    confidence: 0.92,
    reason: "operator confirmed",
  }]);
  const stepAnalyses = manifest.stepAnalyses || [];
  assert.equal(stepAnalyses.length, 1);
  assert.equal(stepAnalyses[0].status, "completed");
  assert.equal(stepAnalyses[0].modelId, "lmstudio:test-vlm");
  assert.equal(stepAnalyses[0].performedCorrectly, true);
  assert.equal(manifest.readiness?.grade, "not_ready");
  assert.ok(manifest.readiness?.checks.some((check) => check.id === "async_analysis" && check.status === "warn"));

  const normalizedPayload = manifest.events[0].payload;
  assert.deepEqual(normalizedPayload.selectedCheckIds, ["success-check"]);
  assert.equal(normalizedPayload.selectedChecks, undefined);
  assert.equal(normalizedPayload.rollingChunk.chunkRef, "kitchen/chunks/event-chunk.mp4");
  assert.equal(manifest.exportHints.stableJoinKeys.includes("stepSegments.id"), true);

  console.log("[kitchen-session-manifest-builder] all checks passed");
}

await main();
