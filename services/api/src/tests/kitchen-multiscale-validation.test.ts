import assert from "node:assert/strict";
import { getProtocol } from "../ai/kitchen/protocols.js";
import {
  aggregateMultiscaleEvidence,
  buildModeForValidationCheck,
  buildProtocolMultiscalePlan,
  evidenceFromResult,
  getStepPlanOrThrow,
  selectExecutableValidationChecks,
} from "../ai/kitchen/multiscale-validation.js";

async function main() {
  const protocol = getProtocol("kitchen-tea-v1");
  assert.ok(protocol);

  const protocolPlan = buildProtocolMultiscalePlan(protocol);
  assert.equal(protocolPlan.protocolId, "kitchen-tea-v1");
  assert.equal(protocolPlan.realtimePolicy.defaultVideoFps, 2);
  assert.equal(protocolPlan.stepPlans.length, protocol.steps.length);

  const setupPlan = getStepPlanOrThrow(protocol, 1);
  assert.equal(setupPlan.stepId, "setup-tea-workspace");

  const pourStep = protocol.steps.find((step) => step.number === 3);
  assert.ok(pourStep);
  const pourStepPlan = getStepPlanOrThrow(protocol, 3);
  assert.equal(pourStepPlan.stepId, "pour-water-into-mug");
  assert.equal(pourStepPlan.aggregation.requireTemporalEvidence, true);
  assert.ok(pourStepPlan.checks.some((check) => check.modeId === "safety-check"));
  assert.ok(pourStepPlan.checks.some((check) => check.modeId === "liquid-level"));
  assert.ok(pourStepPlan.checks.some((check) => check.scale === "short_chunk" && check.modeId === "teacher-judgment"));

  const frameChecks = selectExecutableValidationChecks(
    pourStepPlan,
    { testImageUrl: "https://example.com/frame.jpg" },
    ["frame"],
    10,
  );
  assert.ok(frameChecks.some((check) => check.modeId === "success-check"));
  assert.equal(frameChecks.some((check) => check.scale === "short_chunk"), false);

  const chunkChecks = selectExecutableValidationChecks(
    pourStepPlan,
    {
      videoUrl: "https://youtu.be/abc123",
      videoStartOffsetSec: 10,
      videoEndOffsetSec: 14,
      videoFps: 2,
    },
    ["short_chunk"],
    10,
  );
  assert.equal(chunkChecks.length, 1);
  assert.equal(chunkChecks[0].modeId, "teacher-judgment");

  const teacherMode = buildModeForValidationCheck(protocol, pourStep, chunkChecks[0]);
  assert.equal(teacherMode.id, "teacher-judgment");
  assert.match(teacherMode.prompt, /StepId: pour-water-into-mug/);

  const evidence = [
    evidenceFromResult(
      chunkChecks[0],
      {
        raw: "{\"step_complete\":true,\"confidence\":0.91}",
        parsed: { step_complete: true, confidence: 0.91, possible_issue: null },
        latencyMs: 12,
      },
      pourStep,
    ),
  ];
  const decision = aggregateMultiscaleEvidence(pourStepPlan, evidence);
  assert.equal(decision.stepComplete, true);
  assert.equal(decision.action, "advance");
  assert.equal(decision.confidence, 0.91);

  console.log("[kitchen-multiscale-validation] all checks passed");
}

void main();
