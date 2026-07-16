import assert from "node:assert/strict";
import {
  buildSpatialSummaryFromSegmentation,
  findSpatialSummaryInEvidence,
  formatSpatialSummaryForVoice,
  spatialPhrase,
} from "../ai/kitchen/spatial-summary.js";
import type { EntitySegmentationResult } from "../ai/kitchen/entity-segmentation.js";
import type { MultiscaleEvidence } from "../ai/kitchen/multiscale-types.js";

const segmentation: EntitySegmentationResult = {
  provider: "sidecar",
  configured: true,
  latencyMs: 42,
  prompts: ["mug", "kettle", "tea bag"],
  observations: [
    {
      entityId: "mug-1",
      label: "mug",
      confidence: 0.91,
      centroid: { x: 980, y: 360, coordinateFrame: "pixel" },
      source: "sidecar-normalized",
    },
    {
      entityId: "kettle-1",
      label: "kettle",
      confidence: 0.74,
      box: { format: "er_yxyx_norm_1000", value: [350, 70, 620, 240] },
      source: "sidecar-normalized",
    },
  ],
  tracks: [],
  summary: {
    objectsFound: ["mug", "kettle"],
    missingPrompts: ["tea bag"],
    averageConfidence: 0.82,
    hasMasks: false,
    hasTracks: false,
  },
  warnings: [],
};

function main() {
  assert.equal(spatialPhrase("right", "middle"), "on the right");
  assert.equal(spatialPhrase("left", "top"), "top-left");

  const summary = buildSpatialSummaryFromSegmentation(segmentation, {
    requiredObjects: ["mug", "kettle", "tea bag"],
    frameWidth: 1280,
    frameHeight: 720,
  });
  assert.equal(summary.objects[0].label, "mug");
  assert.equal(summary.objects[0].horizontal, "right");
  assert.equal(summary.objects[0].vertical, "middle");
  assert.equal(summary.objects[0].phrase, "on the right");
  assert.deepEqual(summary.missing, ["tea bag"]);

  const evidence: MultiscaleEvidence[] = [{
    checkId: "tea:entities",
    scale: "frame",
    modeId: "entity-segmentation",
    title: "Entity masks and tracks",
    ok: true,
    parsed: segmentation,
    warnings: [],
    blockers: [],
  }];
  const fromEvidence = findSpatialSummaryInEvidence(evidence, {
    requiredObjects: ["mug", "kettle", "tea bag"],
    frameWidth: 1280,
    frameHeight: 720,
  });
  const voice = formatSpatialSummaryForVoice(fromEvidence);
  assert.match(voice, /mug: on the right/);
  assert.match(voice, /Missing required objects: tea bag/);

  console.log("[kitchen-spatial-summary] all checks passed");
}

main();
