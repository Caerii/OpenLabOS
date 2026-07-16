import assert from "node:assert/strict";
import {
  segmentsNeedingSavedRunAnalysis,
  upsertSavedRunStepAnalyses,
} from "../ai/kitchen/saved-run-analysis.js";
import type { KitchenSessionManifest } from "../ai/kitchen/session-manifest.js";
import type { KitchenStepSegment } from "../ai/kitchen/run-store.js";
import type { KitchenStepAnalysisRecord } from "../ai/kitchen/step-analysis-types.js";

function segment(stepNumber: number): KitchenStepSegment {
  return {
    id: `segment-${stepNumber}`,
    createdAt: "2026-05-01T00:00:00.000Z",
    runId: "run-test",
    protocolId: "kitchen-tea-v1",
    stepNumber,
    attemptId: `attempt-${stepNumber}`,
    attemptNumber: 1,
    stepInstruction: `Step ${stepNumber}`,
    endedAt: stepNumber * 1000,
    source: "confirm-step",
    frameRefs: [`kitchen/frames/step-${stepNumber}.jpg`],
    chunkRefs: [],
  };
}

function analysis(
  stepNumber: number,
  status: KitchenStepAnalysisRecord["status"],
): KitchenStepAnalysisRecord {
  return {
    id: `analysis-segment-${stepNumber}`,
    status,
    runId: "run-test",
    protocolId: "kitchen-tea-v1",
    segmentId: `segment-${stepNumber}`,
    attemptId: `attempt-${stepNumber}`,
    attemptNumber: 1,
    stepNumber,
    modelId: "lmstudio:test-vlm",
    evidenceRefs: [`kitchen/frames/step-${stepNumber}.jpg`],
    performedCorrectly: status === "completed" ? true : undefined,
    confidence: status === "completed" ? 0.9 : undefined,
  };
}

function manifest(): KitchenSessionManifest {
  const segments = [segment(1), segment(2)];
  return {
    schemaVersion: "labos.kitchen.session-manifest.v1",
    generatedAt: "2026-05-01T00:00:00.000Z",
    run: {
      id: "run-test",
      protocolId: "kitchen-tea-v1",
      protocolName: "Make a Cup of Tea",
      status: "completed",
      createdAt: 1,
      currentStepIndex: 1,
      metrics: { stepsCompleted: 2 },
    },
    captureContract: {
      primaryArtifact: "frame_sequence",
      frameRefRoot: "dashboard/data",
      temporalChunks: "rolling_preview_mp4",
      stepBoundaries: "step_segments",
    },
    validationCatalog: { checks: [] },
    steps: [
      {
        number: 1,
        instruction: "Step 1",
        status: "completed",
        attemptId: "attempt-1",
        attemptNumber: 1,
        supersedesAttemptId: undefined,
        startedAt: 1,
        completedAt: 2,
        elapsedMs: 1,
        beforeFrameRef: undefined,
        notes: [],
        verifications: [],
      },
      {
        number: 2,
        instruction: "Step 2",
        status: "completed",
        attemptId: "attempt-2",
        attemptNumber: 1,
        supersedesAttemptId: undefined,
        startedAt: 2,
        completedAt: 3,
        elapsedMs: 1,
        beforeFrameRef: undefined,
        notes: [],
        verifications: [],
      },
    ],
    stepAttempts: [],
    stepSegments: segments,
    frames: segments.map((item) => ({ frameRef: item.frameRefs[0], stepNumber: item.stepNumber, source: "step_segment" })),
    chunks: [],
    adherence: [],
    stepAnalyses: [],
    events: [],
    exportHints: {
      trainingRepoRawTarget: "target",
      stableJoinKeys: [],
    },
  };
}

function main() {
  const base = manifest();
  assert.deepEqual(
    segmentsNeedingSavedRunAnalysis(base).map((item) => item.id),
    ["segment-1", "segment-2"],
  );

  const contaminated: KitchenSessionManifest = {
    ...base,
    stepSegments: [
      ...base.stepSegments,
      { ...segment(3), id: "foreign-run-segment", runId: "other-run" },
      { ...segment(1), id: "foreign-protocol-segment", protocolId: "other-protocol" },
      { ...segment(99), id: "unknown-step-segment" },
      { ...segment(1), id: "unsafe-frame-segment", frameRefs: ["../outside.jpg"] },
    ],
  };
  assert.deepEqual(
    segmentsNeedingSavedRunAnalysis(contaminated).map((item) => item.id),
    ["segment-1", "segment-2"],
  );

  const withCompleted = upsertSavedRunStepAnalyses(base, [analysis(1, "completed")]);
  assert.deepEqual(
    segmentsNeedingSavedRunAnalysis(withCompleted).map((item) => item.id),
    ["segment-2"],
  );

  const withError = upsertSavedRunStepAnalyses(withCompleted, [analysis(2, "error")]);
  assert.deepEqual(
    segmentsNeedingSavedRunAnalysis(withError).map((item) => item.id),
    ["segment-2"],
  );
  assert.deepEqual(
    segmentsNeedingSavedRunAnalysis(withError, { retryErrors: false }).map((item) => item.id),
    [],
  );

  const withAllCompleted = upsertSavedRunStepAnalyses(withError, [analysis(2, "completed")]);
  assert.equal(withAllCompleted.stepAnalyses?.length, 2);
  assert.equal(withAllCompleted.readiness?.checks.find((check) => check.id === "async_analysis")?.status, "pass");
  assert.equal(withAllCompleted.readiness?.checks.find((check) => check.id === "analysis_passed")?.status, "pass");

  console.log("[kitchen-saved-run-analysis] all checks passed");
}

main();
