import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {
  appendKitchenStepSegment,
  getKitchenDataPaths,
  listKitchenSessionManifests,
  readCurrentRunSnapshot,
  readKitchenSessionManifestFile,
  readKitchenStepSegments,
  saveCurrentRunSnapshot,
  writeKitchenSessionManifest,
  type KitchenStepSegment,
} from "../ai/kitchen/run-store.js";

async function main() {
  const runId = `test-step-segment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const segment: KitchenStepSegment = {
    id: `${runId}-step1`,
    createdAt: new Date(0).toISOString(),
    runId,
    protocolId: "kitchen-tea-v1",
    protocolName: "Make a Cup of Tea",
    stepNumber: 1,
    attemptId: `${runId}-step1-attempt1`,
    attemptNumber: 1,
    stepInstruction: "Place mug on counter.",
    startedAt: 10,
    endedAt: 40,
    durationMs: 30,
    source: "confirm-step",
    frameRefs: ["kitchen/frames/test-frame.jpg"],
    chunkRefs: [],
    nativeRecording: {
      active: true,
      activeVideoPath: "/tmp/native-active.mp4",
    },
    notes: ["test segment"],
  };

  await appendKitchenStepSegment(segment);
  const matches = await readKitchenStepSegments(runId);
  assert.equal(matches.length, 1);
  assert.deepEqual(matches[0], segment);

  const misses = await readKitchenStepSegments(`${runId}-missing`);
  assert.equal(misses.length, 0);

  const manifest = {
    schemaVersion: "labos.kitchen.session-manifest.v1",
    generatedAt: new Date(0).toISOString(),
    run: {
      id: runId,
      protocolId: "kitchen-tea-v1",
      protocolName: "Make a Cup of Tea",
      status: "completed",
      metrics: { stepsCompleted: 1 },
    },
    steps: [{ number: 1 }],
    stepSegments: [segment],
    stepAttempts: [
      {
        attemptId: `${runId}-step1-attempt1`,
        stepNumber: 1,
        attemptNumber: 1,
        segmentIds: [segment.id],
        frameRefs: ["kitchen/frames/test-frame.jpg"],
        chunkRefs: [],
        nativeVideoPaths: ["/tmp/native-active.mp4"],
        status: "current",
      },
    ],
    frames: [{ frameRef: "kitchen/frames/test-frame.jpg", source: "step_segment" }],
    chunks: [],
    adherence: [{ ts: 1, stepNumber: 1, action: "advance" }],
  };
  const manifestRef = await writeKitchenSessionManifest(runId, manifest);
  assert.equal(manifestRef, `kitchen/manifests/${runId}.json`);
  assert.deepEqual(await readKitchenSessionManifestFile(runId), manifest);

  const manifests = await listKitchenSessionManifests();
  const saved = manifests.find((entry) => entry.runId === runId);
  assert.ok(saved);
  assert.equal(saved.manifestRef, manifestRef);
  assert.equal(saved.protocolName, "Make a Cup of Tea");
  assert.equal(saved.stepsCompleted, 1);
  assert.equal(saved.totalSteps, 1);
  assert.equal(saved.stepSegmentCount, 1);
  assert.equal(saved.nativeVideoCount, 1);
  assert.equal(saved.frameCount, 1);
  assert.equal(saved.redoneAttemptCount, 0);
  assert.equal(saved.deviationCount, 0);

  const paths = getKitchenDataPaths();
  await fs.writeFile(paths.currentRunFile, "{not-valid-json");
  assert.equal(await readCurrentRunSnapshot(), null);
  await saveCurrentRunSnapshot(null, null);
  const snapshot = await readCurrentRunSnapshot();
  assert.equal(snapshot?.run, null);
  assert.equal(snapshot?.summary, null);

  console.log("[kitchen-step-segments] all checks passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
