import assert from "node:assert/strict";
import { protocolTracker } from "../ai/kitchen/index.js";
import { appendKitchenStepSegment, type KitchenStepSegment } from "../ai/kitchen/run-store.js";
import { buildKitchenSessionManifest } from "../ai/kitchen/session-manifest.js";

function segmentForAttempt(runId: string, attempt: NonNullable<ReturnType<typeof protocolTracker.getCurrentStepAttempt>>): KitchenStepSegment {
  return {
    id: `${attempt.attemptId}-segment`,
    createdAt: new Date().toISOString(),
    runId,
    protocolId: "kitchen-tea-v1",
    protocolName: "Make a Cup of Tea",
    stepNumber: attempt.stepNumber,
    attemptId: attempt.attemptId,
    attemptNumber: attempt.attemptNumber,
    supersedesAttemptId: attempt.supersedesAttemptId,
    stepInstruction: "Place the mug on the counter in your workspace",
    startedAt: Date.now() - 100,
    endedAt: Date.now(),
    durationMs: 100,
    source: "confirm-step",
    frameRefs: [`kitchen/frames/${attempt.attemptId}.jpg`],
    chunkRefs: [],
    nativeRecording: {
      active: true,
      activeVideoPath: `/storage/emulated/0/LabOS/media/${runId}.mp4`,
      lastVideoPath: "/storage/emulated/0/LabOS/media/stale-previous-run.mp4",
    },
  };
}

async function main() {
  const run = protocolTracker.startRun("kitchen-tea-v1");
  protocolTracker.forceStart();

  const attempt1 = protocolTracker.getCurrentStepAttempt();
  assert.ok(attempt1);
  await appendKitchenStepSegment(segmentForAttempt(run.id, attempt1));

  protocolTracker.manualComplete();
  const undo = protocolTracker.undoLastStep("test redo");
  assert.equal(undo.changed, true);

  const attempt2 = protocolTracker.getCurrentStepAttempt();
  assert.ok(attempt2);
  assert.equal(attempt2.attemptNumber, 2);
  assert.equal(attempt2.supersedesAttemptId, attempt1.attemptId);
  await appendKitchenStepSegment(segmentForAttempt(run.id, attempt2));

  const manifest = await buildKitchenSessionManifest(run.id);
  assert.equal(manifest.stepAttempts.length, 2);

  const savedAttempt1 = manifest.stepAttempts.find((attempt) => attempt.attemptId === attempt1.attemptId);
  const savedAttempt2 = manifest.stepAttempts.find((attempt) => attempt.attemptId === attempt2.attemptId);
  assert.equal(savedAttempt1?.status, "superseded");
  assert.equal(savedAttempt1?.supersededByAttemptId, attempt2.attemptId);
  assert.deepEqual(savedAttempt1?.nativeVideoPaths, [`/storage/emulated/0/LabOS/media/${run.id}.mp4`]);
  assert.equal(savedAttempt2?.status, "current");
  assert.equal(savedAttempt2?.supersedesAttemptId, attempt1.attemptId);
  assert.equal(manifest.frames.length, 2);
  assert.deepEqual(
    manifest.frames.map((frame) => ({ frameRef: frame.frameRef, stepNumber: frame.stepNumber, source: frame.source })),
    [
      { frameRef: `kitchen/frames/${attempt1.attemptId}.jpg`, stepNumber: 1, source: "step_segment" },
      { frameRef: `kitchen/frames/${attempt2.attemptId}.jpg`, stepNumber: 1, source: "step_segment" },
    ],
  );
  assert.ok(manifest.exportHints.stableJoinKeys.includes("stepAttempts.attemptId"));

  console.log("[kitchen-session-manifest-attempts] all checks passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
