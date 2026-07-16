import assert from "node:assert/strict";
import {
  evaluateAdherence,
  resetAdherencePolicyState,
  type MultiscaleDecision,
} from "../ai/kitchen/index.js";

function decision(overrides: Partial<MultiscaleDecision>): MultiscaleDecision {
  return {
    stepComplete: false,
    confidence: 0,
    action: "collect_short_chunk",
    summary: "needs more evidence",
    supportingCheckIds: [],
    warnings: [],
    blockers: [],
    ...overrides,
  };
}

async function main() {
  resetAdherencePolicyState();

  const input = {
    runId: "run-a",
    stepNumber: 1,
    instruction: "Place the mug on the counter",
    successCriteria: "Mug is stable on the counter",
    evidence: [],
  };

  const moreEvidence = evaluateAdherence({
    ...input,
    decision: decision({ action: "collect_short_chunk" }),
  });
  assert.equal(moreEvidence.action, "collect_more_evidence");
  assert.equal(moreEvidence.shouldAdvance, false);
  assert.equal(moreEvidence.recommendedNextScale, "short_chunk");

  const highConfidence = evaluateAdherence({
    ...input,
    runId: "run-b",
    decision: decision({ stepComplete: true, action: "advance", confidence: 0.91 }),
  });
  assert.equal(highConfidence.action, "advance");
  assert.equal(highConfidence.shouldAdvance, true);

  const firstModerate = evaluateAdherence({
    ...input,
    runId: "run-c",
    decision: decision({ stepComplete: true, action: "advance", confidence: 0.72 }),
  });
  assert.equal(firstModerate.action, "confirming");
  assert.equal(firstModerate.shouldAdvance, false);

  const secondModerate = evaluateAdherence({
    ...input,
    runId: "run-c",
    decision: decision({ stepComplete: true, action: "advance", confidence: 0.74 }),
  });
  assert.equal(secondModerate.action, "advance");
  assert.equal(secondModerate.shouldAdvance, true);

  const firstFrameOnly = evaluateAdherence({
    ...input,
    runId: "run-frame-only",
    decision: decision({ action: "collect_short_chunk", confidence: 0.9 }),
    evidence: [{
      checkId: "step:success",
      scale: "frame",
      modeId: "success-check",
      title: "Single-frame success check",
      ok: true,
      passed: true,
      confidence: 0.9,
      warnings: [],
      blockers: [],
    }],
  });
  assert.equal(firstFrameOnly.action, "confirming");
  assert.equal(firstFrameOnly.shouldAdvance, false);

  const secondFrameOnly = evaluateAdherence({
    ...input,
    runId: "run-frame-only",
    decision: decision({ action: "collect_short_chunk", confidence: 0.91 }),
    evidence: [{
      checkId: "step:success",
      scale: "frame",
      modeId: "success-check",
      title: "Single-frame success check",
      ok: true,
      passed: true,
      confidence: 0.91,
      warnings: [],
      blockers: [],
    }],
  });
  assert.equal(secondFrameOnly.action, "advance");
  assert.equal(secondFrameOnly.shouldAdvance, true);

  const blocked = evaluateAdherence({
    ...input,
    runId: "run-d",
    decision: decision({ action: "manual_review", blockers: ["knife too close to hand"] }),
  });
  assert.equal(blocked.action, "blocked");
  assert.equal(blocked.shouldAdvance, false);

  const segmentationMockWarning = evaluateAdherence({
    ...input,
    runId: "run-segmentation-mock",
    decision: decision({
      action: "retry_frame",
      confidence: 0,
      warnings: ["entity_segmentation_mock: set LABOS_SEGMENTATION_SIDECAR_URL to use SAM/Grounded-SAM output"],
    }),
    evidence: [{
      checkId: "step:entities",
      scale: "frame",
      modeId: "entity-segmentation",
      title: "Entity masks and tracks",
      ok: true,
      passed: true,
      confidence: 0.62,
      warnings: ["entity_segmentation_mock: set LABOS_SEGMENTATION_SIDECAR_URL to use SAM/Grounded-SAM output"],
      blockers: [],
    }],
  });
  assert.equal(segmentationMockWarning.action, "collect_more_evidence");
  assert.equal(segmentationMockWarning.state, "watching");
  assert.match(segmentationMockWarning.spokenSummary, /still watching|better evidence|Keep/i);
  assert.doesNotMatch(segmentationMockWarning.spokenSummary, /entity_segmentation_mock/);

  console.log("[kitchen-adherence-policy] all checks passed");
}

void main();
