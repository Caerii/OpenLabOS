import assert from "node:assert/strict";
import {
  attemptsForKitchenManifest,
  buildKitchenRunReviewFromManifest,
  evidenceStatsForKitchenManifest,
  numberKitchenRunsBySavedOrder,
} from "../ai/kitchen/run-catalog.js";
import type { KitchenSavedManifestSummary } from "../ai/kitchen/run-store.js";
import type { KitchenSessionManifest } from "../ai/kitchen/session-manifest.js";

const summary: KitchenSavedManifestSummary = {
  runId: "run-a",
  manifestRef: "kitchen/manifests/run-a.json",
  savedAt: "2026-05-01T12:00:00.000Z",
  protocolId: "kitchen-tea-v1",
  protocolName: "Make a Cup of Tea",
  status: "completed",
  stepsCompleted: 1,
  totalSteps: 1,
};

const manifest = {
  schemaVersion: "labos.kitchen.session-manifest.v1",
  generatedAt: "2026-05-01T12:00:00.000Z",
  run: {
    id: "run-a",
    protocolId: "kitchen-tea-v1",
    protocolName: "Make a Cup of Tea",
    status: "completed",
    createdAt: 1,
    currentStepIndex: 0,
    metrics: { stepsCompleted: 1 },
  },
  captureContract: {
    primaryArtifact: "frame_sequence",
    frameRefRoot: "dashboard/data",
    temporalChunks: "rolling_preview_mp4",
    stepBoundaries: "step_segments",
  },
  validationCatalog: { checks: [] },
  steps: [{ number: 1, instruction: "Place the mug on the counter" }],
  stepAttempts: [{
    attemptId: "attempt-1",
    stepNumber: 1,
    attemptNumber: 1,
    segmentIds: ["segment-1"],
    frameRefs: ["kitchen/frames/a.jpg"],
    chunkRefs: ["kitchen/chunks/a.mp4"],
    nativeVideoPaths: ["/storage/emulated/0/LabOS/media/VID_1.mp4"],
    startedAt: 1_000,
    endedAt: 7_000,
    status: "current",
  }],
  stepSegments: [{
    id: "segment-1",
    createdAt: "2026-05-01T12:00:01.000Z",
    runId: "run-a",
    protocolId: "kitchen-tea-v1",
    stepNumber: 1,
    attemptId: "attempt-1",
    attemptNumber: 1,
    stepInstruction: "Place the mug on the counter",
    startedAt: 1_000,
    endedAt: 7_000,
    durationMs: 6_000,
    source: "confirm-step",
    frameRefs: ["kitchen/frames/a.jpg"],
    chunkRefs: ["kitchen/chunks/a.mp4"],
    nativeRecording: {
      active: false,
      lastVideoPath: "/storage/emulated/0/LabOS/media/VID_1.mp4",
    },
  }],
  frames: [{ frameRef: "kitchen/frames/a.jpg", stepNumber: 1, source: "step_segment" }],
  chunks: [{ chunkRef: "kitchen/chunks/a.mp4", stepNumber: 1, source: "step_segment" }],
  adherence: [{ ts: 1, stepNumber: 1, action: "advance" }],
  stepAnalyses: [{
    id: "analysis-segment-1",
    status: "completed",
    runId: "run-a",
    protocolId: "kitchen-tea-v1",
    segmentId: "segment-1",
    stepNumber: 1,
    modelId: "lmstudio:test-vlm",
    evidenceRefs: ["kitchen/frames/a.jpg"],
    performedCorrectly: true,
    confidence: 0.9,
    summary: "The mug is visible.",
    deviation: null,
    visibleEvidence: ["mug visible"],
    missingEvidence: [],
  }],
  events: [],
  exportHints: {
    trainingRepoRawTarget: "target",
    stableJoinKeys: [],
  },
} as unknown as KitchenSessionManifest;

function main() {
  const numbered = numberKitchenRunsBySavedOrder([
    { ...summary, runId: "run-b", savedAt: "2026-05-01T13:00:00.000Z" },
    summary,
  ]);
  assert.deepEqual(numbered.map((item) => [item.runId, item.runNumber]), [["run-b", 2], ["run-a", 1]]);
  assert.equal(numbered[0].statusBucket, "completed");
  assert.equal(numbered[0].completionRatio, 1);

  const stats = evidenceStatsForKitchenManifest(manifest);
  assert.equal(stats.frameCount, 1);
  assert.equal(stats.nativeVideoCount, 1);
  assert.equal(stats.stepAnalysisCount, 1);

  const attempts = attemptsForKitchenManifest(manifest, {
    "/sdcard/LabOS/media/VID_1.mp4": {
      devicePath: "/sdcard/LabOS/media/VID_1.mp4",
      name: "VID_1.mp4",
      ref: "kitchen/native-videos/run-a/VID_1.mp4",
      url: "/api/kitchen/session/artifact?ref=kitchen%2Fnative-videos%2Frun-a%2FVID_1.mp4",
      downloadUrl: "/api/kitchen/session/artifact?ref=kitchen%2Fnative-videos%2Frun-a%2FVID_1.mp4&download=1",
      status: "cached",
      size: 1234,
    },
  });
  assert.equal(attempts[0].videos[0].viewUrl.includes("native-videos"), true);
  assert.equal(attempts[0].videos[0].thumbnailUrl?.includes("kitchen%2Fframes%2Fa.jpg"), true);
  assert.equal(attempts[0].analyses[0].performedCorrectly, true);
  assert.ok(Array.isArray(attempts[0].vqaAnnotations));

  const review = buildKitchenRunReviewFromManifest(numbered[1], manifest);
  assert.equal(review.run.runNumber, 1);
  assert.equal(review.attempts.length, 1);

  console.log("[kitchen-run-catalog] all checks passed");
}

main();
