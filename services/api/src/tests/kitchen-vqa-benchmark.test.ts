import assert from "node:assert/strict";
import {
  summarizeSavedRunVqaBenchmarkRows,
  type SavedRunVqaBenchmarkRow,
} from "../ai/kitchen/vqa-benchmark.js";

function row(overrides: Partial<SavedRunVqaBenchmarkRow>): SavedRunVqaBenchmarkRow {
  return {
    runId: "run-test",
    protocolId: "kitchen-tea-v1",
    segmentId: "segment-1",
    stepNumber: 1,
    modelId: "lmstudio:test-vlm",
    status: "completed",
    latencyMs: 1000,
    evidenceRefs: [],
    stepCompleteLikelihood: 0.8,
    recommendedNext: "advance",
    missingEvidenceCount: 0,
    answerCount: 4,
    ...overrides,
  };
}

function main() {
  const summaries = summarizeSavedRunVqaBenchmarkRows([
    row({ modelId: "lmstudio:test-vlm", latencyMs: 1000, stepCompleteLikelihood: 0.8 }),
    row({ modelId: "lmstudio:test-vlm", latencyMs: 2000, stepCompleteLikelihood: 0.6, recommendedNext: "manual_review", missingEvidenceCount: 2 }),
    row({ modelId: "together:test-vlm", status: "error", latencyMs: 500, error: "network" }),
    row({ modelId: "together:test-vlm", latencyMs: 300, stepCompleteLikelihood: 0.9, recommendedNext: "collect_more_evidence", missingEvidenceCount: 1 }),
  ]);

  assert.equal(summaries.length, 2);
  assert.deepEqual(summaries[0], {
    modelId: "lmstudio:test-vlm",
    total: 2,
    completed: 2,
    errors: 0,
    avgLatencyMs: 1500,
    medianLatencyMs: 1000,
    p95LatencyMs: 2000,
    avgLikelihood: 0.7,
    advanceCount: 1,
    continueCount: 0,
    collectMoreEvidenceCount: 0,
    manualReviewCount: 1,
    otherRecommendationCount: 0,
    totalMissingEvidence: 2,
  });
  assert.deepEqual(summaries[1], {
    modelId: "together:test-vlm",
    total: 2,
    completed: 1,
    errors: 1,
    avgLatencyMs: 300,
    medianLatencyMs: 300,
    p95LatencyMs: 300,
    avgLikelihood: 0.9,
    advanceCount: 0,
    continueCount: 0,
    collectMoreEvidenceCount: 1,
    manualReviewCount: 0,
    otherRecommendationCount: 0,
    totalMissingEvidence: 1,
  });

  console.log("[kitchen-vqa-benchmark] all checks passed");
}

main();
