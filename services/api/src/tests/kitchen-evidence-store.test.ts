import assert from "node:assert/strict";
import {
  clearKitchenMediaEvidenceCache,
  kitchenMediaPathKeys,
  nativeRecordingPathsForKitchenSegment,
  summarizeKitchenMediaEvidence,
} from "../ai/kitchen/evidence-store.js";
import { writeKitchenSessionManifest, type KitchenStepSegment } from "../ai/kitchen/run-store.js";

async function main() {
  const runId = `test-evidence-store-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const videoName = `VID_${runId}.mp4`;
  const storagePath = `/storage/emulated/0/LabOS/media/${videoName}`;
  const sdcardPath = `/sdcard/LabOS/media/${videoName}`;
  const attemptId = `${runId}-step2-attempt1`;
  const segment: KitchenStepSegment = {
    id: `${runId}-segment-step2`,
    createdAt: new Date(0).toISOString(),
    runId,
    protocolId: "kitchen-tea-v1",
    protocolName: "Make a Cup of Tea",
    stepNumber: 2,
    attemptId,
    attemptNumber: 1,
    stepInstruction: "Pour hot water into the mug.",
    startedAt: 10,
    endedAt: 50,
    durationMs: 40,
    source: "confirm-step",
    frameRefs: ["kitchen/frames/test.jpg"],
    chunkRefs: [],
    nativeRecording: {
      active: true,
      activeVideoPath: storagePath,
    },
  };

  await writeKitchenSessionManifest(runId, {
    schemaVersion: "labos.kitchen.session-manifest.v1",
    generatedAt: new Date(0).toISOString(),
    run: {
      id: runId,
      protocolId: "kitchen-tea-v1",
      protocolName: "Make a Cup of Tea",
      status: "completed",
      metrics: { stepsCompleted: 2 },
    },
    steps: [{ number: 1 }, { number: 2 }],
    stepAttempts: [{ attemptId, status: "current" }],
    stepSegments: [segment],
    adherence: [
      { stepNumber: 2, action: "possible_deviation" },
      { stepNumber: 2, action: "advance" },
    ],
  });
  clearKitchenMediaEvidenceCache();

  const keys = kitchenMediaPathKeys(storagePath);
  assert.ok(keys.has(storagePath));
  assert.ok(keys.has(sdcardPath));
  assert.ok(keys.has(videoName));

  assert.deepEqual(nativeRecordingPathsForKitchenSegment(segment), [storagePath]);

  const summary = await summarizeKitchenMediaEvidence(sdcardPath);
  assert.equal(summary.linkedRunCount, 1);
  assert.equal(summary.deviationCount, 1);
  assert.equal(summary.evidenceLinks.length, 1);
  assert.equal(summary.evidenceLinks[0].runId, runId);
  assert.equal(summary.evidenceLinks[0].stepNumber, 2);
  assert.equal(summary.evidenceLinks[0].stepInstruction, "Pour hot water into the mug.");
  assert.equal(summary.evidenceLinks[0].segmentId, segment.id);
  assert.equal(summary.evidenceLinks[0].attemptId, attemptId);
  assert.equal(summary.evidenceLinks[0].attemptStatus, "current");
  assert.deepEqual(summary.evidenceLinks[0].adherenceActions.sort(), ["advance", "possible_deviation"]);

  const basenameSummary = await summarizeKitchenMediaEvidence(videoName);
  assert.equal(basenameSummary.linkedRunCount, 1);

  console.log("[kitchen-evidence-store] all checks passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
