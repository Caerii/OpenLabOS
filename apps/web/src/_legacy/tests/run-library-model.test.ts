import assert from "node:assert/strict";
import type { KitchenSavedManifestSummary, KitchenSessionManifest } from "../api";
import {
  attemptEvidenceForManifest,
  evidenceStatsForManifest,
  evidenceStatsForSummary,
  filterAndSortRuns,
  normalizeDeviceMediaPath,
  numberRunsBySavedOrder,
  runNaturalLabel,
  runCompletionLabel,
  runStatusBucket,
  runStatusLabel,
} from "../components/files/runLibraryModel";

const runs: KitchenSavedManifestSummary[] = [
  {
    runId: "run-b",
    manifestRef: "kitchen/manifests/run-b.json",
    savedAt: "2026-04-30T16:00:00.000Z",
    protocolName: "Make Tea",
    status: "completed",
    stepsCompleted: 6,
    totalSteps: 6,
    frameCount: 6,
    chunkCount: 0,
    stepSegmentCount: 6,
    nativeVideoCount: 6,
    completedStepAnalysisCount: 6,
    redoneAttemptCount: 0,
    deviationCount: 0,
  },
  {
    runId: "run-a",
    manifestRef: "kitchen/manifests/run-a.json",
    savedAt: "2026-04-30T15:00:00.000Z",
    protocolName: "Make Toast",
    status: "aborted",
    stepsCompleted: 2,
    totalSteps: 6,
  },
];

const manifest = {
  nativeVideoArtifacts: {
    "/sdcard/LabOS/media/VID_1.mp4": {
      devicePath: "/sdcard/LabOS/media/VID_1.mp4",
      name: "VID_1.mp4",
      ref: "kitchen/native-videos/run-a/video.mp4",
      url: "/api/kitchen/session/artifact?ref=kitchen%2Fnative-videos%2Frun-a%2Fvideo.mp4",
      downloadUrl: "/api/kitchen/session/artifact?ref=kitchen%2Fnative-videos%2Frun-a%2Fvideo.mp4&download=1",
      status: "cached",
      size: 1234,
      cachedAt: "2026-04-30T15:01:00.000Z",
    },
  },
  frames: [{ frameRef: "kitchen/frames/a.jpg", source: "step_segment" }],
  chunks: [{ chunkRef: "kitchen/chunks/a.mp4", source: "step_segment" }],
  stepSegments: [
    {
      id: "segment-1",
      createdAt: "2026-04-30T15:00:00.000Z",
      runId: "run-a",
      protocolId: "tea",
      stepNumber: 1,
      endedAt: 1,
      source: "confirm-step",
      frameRefs: ["kitchen/frames/a.jpg"],
      chunkRefs: ["kitchen/chunks/a.mp4"],
      nativeRecording: { active: false, lastVideoPath: "/storage/emulated/0/LabOS/media/VID_1.mp4" },
    },
  ],
  stepAttempts: [
    {
      attemptId: "attempt-1",
      stepNumber: 1,
      attemptNumber: 1,
      segmentIds: ["segment-1"],
      frameRefs: ["kitchen/frames/a.jpg"],
      chunkRefs: ["kitchen/chunks/a.mp4"],
      nativeVideoPaths: ["/storage/emulated/0/LabOS/media/VID_1.mp4"],
      status: "superseded",
    },
    {
      attemptId: "attempt-2",
      stepNumber: 1,
      attemptNumber: 2,
      segmentIds: [],
      frameRefs: [],
      chunkRefs: [],
      nativeVideoPaths: [],
      status: "current",
    },
  ],
  adherence: [
    { ts: 1, stepNumber: 1, action: "possible_deviation" },
    { ts: 2, stepNumber: 1, action: "advance" },
  ],
  stepAnalyses: [
    {
      id: "analysis-1",
      status: "completed",
      runId: "run-a",
      protocolId: "tea",
      segmentId: "segment-1",
      stepNumber: 1,
      modelId: "lmstudio:test-vlm",
      evidenceRefs: ["kitchen/frames/a.jpg"],
      performedCorrectly: true,
      confidence: 0.84,
      summary: "The mug is visible.",
      deviation: null,
      visibleEvidence: ["mug on counter"],
      missingEvidence: [],
    },
  ],
} as unknown as KitchenSessionManifest;

function main() {
  assert.equal(runStatusLabel("completed"), "Completed");
  assert.equal(runStatusLabel("aborted"), "Partial");
  assert.equal(runStatusBucket("paused"), "running");
  assert.equal(runCompletionLabel(runs[0]), "6/6 steps");
  assert.equal(runNaturalLabel(124), "Run 124");
  assert.deepEqual(numberRunsBySavedOrder(runs).map((run) => [run.runId, run.runNumber]), [["run-b", 2], ["run-a", 1]]);
  assert.equal(
    normalizeDeviceMediaPath("/storage/emulated/0/LabOS/media/VID_1.mp4"),
    "/sdcard/LabOS/media/VID_1.mp4",
  );

  assert.deepEqual(filterAndSortRuns(runs, "", "all", "newest").map((run) => run.runId), ["run-b", "run-a"]);
  assert.deepEqual(filterAndSortRuns(runs, "toast", "all", "newest").map((run) => run.runId), ["run-a"]);
  assert.deepEqual(filterAndSortRuns(runs, "", "completed", "newest").map((run) => run.runId), ["run-b"]);
  assert.deepEqual(filterAndSortRuns(runs, "", "all", "completion").map((run) => run.runId), ["run-b", "run-a"]);

  const stats = evidenceStatsForManifest(manifest);
  assert.equal(stats.frameCount, 1);
  assert.equal(stats.chunkCount, 1);
  assert.equal(stats.stepSegmentCount, 1);
  assert.equal(stats.stepAnalysisCount, 1);
  assert.equal(stats.nativeVideoCount, 1);
  assert.equal(stats.currentAttemptCount, 1);
  assert.equal(stats.redoneAttemptCount, 1);
  assert.equal(stats.deviationCount, 1);

  const summaryStats = evidenceStatsForSummary(runs[0]);
  assert.equal(summaryStats?.stepSegmentCount, 6);
  assert.equal(summaryStats?.nativeVideoCount, 6);
  assert.equal(summaryStats?.frameCount, 6);
  assert.equal(summaryStats?.stepAnalysisCount, 6);

  const attemptEvidence = attemptEvidenceForManifest(manifest);
  assert.equal(attemptEvidence[0].videos[0].name, "VID_1.mp4");
  assert.equal(attemptEvidence[0].analyses[0].modelId, "lmstudio:test-vlm");
  assert.equal(attemptEvidence[0].analyses[0].performedCorrectly, true);
  assert.match(attemptEvidence[0].videos[0].thumbnailUrl || "", /kitchen%2Fframes%2Fa\.jpg/);
  assert.match(attemptEvidence[0].videos[0].viewUrl, /kitchen%2Fnative-videos%2Frun-a%2Fvideo\.mp4/);
  assert.equal(attemptEvidence[0].videos[0].cacheStatus, "cached");
  assert.equal(attemptEvidence[0].snapshotRefs.length, 1);
  assert.deepEqual(
    attemptEvidenceForManifest({
      steps: [{ instruction: "Legacy step" }],
      stepAttempts: [{ attemptId: "legacy", stepNumber: 1, attemptNumber: 1, status: "current" } as any],
    } as KitchenSessionManifest)[0],
    {
      attemptId: "legacy",
      stepNumber: 1,
      attemptNumber: 1,
      status: "current",
      instruction: "Legacy step",
      segmentIds: [],
      snapshotRefs: [],
      chunkRefs: [],
      videos: [],
      analyses: [],
      startedAt: undefined,
      endedAt: undefined,
      durationMs: undefined,
    },
  );

  console.log("[run-library-model] all checks passed");
}

main();
