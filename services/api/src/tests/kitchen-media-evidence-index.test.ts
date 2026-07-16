import assert from "node:assert/strict";
import {
  buildKitchenMediaEvidenceMapFromManifests,
  kitchenEvidenceLinksForMediaPath,
  type KitchenManifestLike,
} from "../ai/kitchen/evidence-store.js";
import type { KitchenSavedManifestSummary, KitchenStepSegment } from "../ai/kitchen/run-store.js";

async function main() {
  const runId = "run-media-index-test";
  const videoName = "VID_media_index_test.mp4";
  const storagePath = `/storage/emulated/0/LabOS/media/${videoName}`;
  const sdcardPath = `/sdcard/LabOS/media/${videoName}`;
  const attemptId = `${runId}-step3-attempt2`;
  const summary: KitchenSavedManifestSummary = {
    runId,
    manifestRef: `kitchen/manifests/${runId}.json`,
    savedAt: "2026-04-30T12:00:00.000Z",
    protocolId: "kitchen-tea-v1",
    protocolName: "Make a Cup of Tea",
    status: "completed",
    stepsCompleted: 3,
    totalSteps: 5,
  };
  const segment: KitchenStepSegment = {
    id: `${runId}-step3-segment`,
    createdAt: "2026-04-30T12:00:00.000Z",
    runId,
    protocolId: "kitchen-tea-v1",
    protocolName: "Make a Cup of Tea",
    stepNumber: 3,
    attemptId,
    attemptNumber: 2,
    stepInstruction: "Steep the tea bag in the mug.",
    startedAt: 10,
    endedAt: 70,
    durationMs: 60,
    source: "confirm-step",
    frameRefs: ["kitchen/frames/step3.jpg"],
    chunkRefs: [],
    nativeRecording: {
      active: false,
      lastVideoPath: storagePath,
    },
  };
  const manifest: KitchenManifestLike = {
    run: {
      protocolId: "kitchen-tea-v1",
      protocolName: "Make a Cup of Tea",
      status: "completed",
    },
    stepAttempts: [
      { attemptId, status: "current" },
    ],
    stepSegments: [segment],
    adherence: [
      { stepNumber: 3, action: "possible_deviation" },
      { stepNumber: 3, action: "blocked" },
      { stepNumber: 3, action: "advance" },
    ],
  };

  const map = buildKitchenMediaEvidenceMapFromManifests([
    { summary, manifest },
    { summary: { ...summary, runId: "missing-manifest" }, manifest: null },
  ]);

  for (const lookupPath of [storagePath, sdcardPath, videoName]) {
    const links = kitchenEvidenceLinksForMediaPath(map, lookupPath);
    assert.equal(links.length, 1);
    assert.equal(links[0].runId, runId);
    assert.equal(links[0].manifestRef, summary.manifestRef);
    assert.equal(links[0].stepNumber, 3);
    assert.equal(links[0].stepInstruction, "Steep the tea bag in the mug.");
    assert.equal(links[0].segmentId, segment.id);
    assert.equal(links[0].attemptId, attemptId);
    assert.equal(links[0].attemptNumber, 2);
    assert.equal(links[0].attemptStatus, "current");
    assert.equal(links[0].deviationCount, 2);
    assert.deepEqual(links[0].adherenceActions.sort(), ["advance", "blocked", "possible_deviation"]);
  }

  assert.equal(kitchenEvidenceLinksForMediaPath(map, "/sdcard/LabOS/media/not-linked.mp4").length, 0);
  console.log("[kitchen-media-evidence-index] all checks passed");
}

await main();
