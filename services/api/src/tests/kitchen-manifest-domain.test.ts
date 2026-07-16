import assert from "node:assert/strict";
import {
  coerceKitchenSessionManifest,
  normalizeKitchenStepSegment,
  validateKitchenSessionManifestShape,
} from "../ai/kitchen/manifest-domain.js";

function main() {
  assert.equal(normalizeKitchenStepSegment({ id: "missing-core" }), null);
  const segment = normalizeKitchenStepSegment({
    id: "segment-1",
    createdAt: "2026-05-01T00:00:00.000Z",
    runId: "run-a",
    protocolId: "kitchen-tea-v1",
    stepNumber: 1,
    endedAt: 1000,
    source: "confirm-step",
    frameRefs: ["kitchen/frames/a.jpg", 123],
    chunkRefs: ["kitchen/chunks/a.mp4"],
  });
  assert.equal(segment?.frameRefs.length, 1);

  const invalid = validateKitchenSessionManifestShape({ run: { id: "run-a" } });
  assert.equal(invalid.ok, false);
  assert.ok(invalid.issues.some((issue) => issue.path === "run.protocolId"));

  const result = validateKitchenSessionManifestShape({
    run: {
      id: "run-a",
      protocolId: "kitchen-tea-v1",
      protocolName: "Make Tea",
      status: "completed",
      metrics: { stepsCompleted: 1 },
    },
    steps: [{ number: 1 }],
    stepSegments: [
      segment,
      { id: "bad-segment" },
    ],
    frames: [],
    chunks: [],
    adherence: [],
  });
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.manifest.stepSegments.length, 1);
  assert.ok(result.issues.some((issue) => issue.path === "stepSegments"));

  const coerced = coerceKitchenSessionManifest({
    run: {
      id: "run-a",
      protocolId: "kitchen-tea-v1",
      protocolName: "Make Tea",
      status: "completed",
    },
    steps: [],
  });
  assert.equal(coerced.run.id, "run-a");
  assert.deepEqual(coerced.events, []);

  console.log("[kitchen-manifest-domain] all checks passed");
}

main();
