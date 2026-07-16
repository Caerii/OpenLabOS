import assert from "node:assert/strict";
import { getProtocol, type KitchenProtocol } from "../ai/kitchen/protocols.js";
import {
  buildProtocolMultiscalePlan,
  type MultiscaleDecision,
  type MultiscaleEvidence,
} from "../ai/kitchen/multiscale-validation.js";
import {
  runKitchenReplayFixture,
  type KitchenReplayFixture,
} from "../ai/kitchen/replay.js";
import {
  buildWorkflowSupervisionContract,
  workflowPresetForProtocol,
  type WorkflowSupervisionContract,
} from "../ai/workflows/index.js";

function loadProtocol(id: string): KitchenProtocol {
  const protocol = getProtocol(id);
  assert.ok(protocol, `Expected protocol ${id} to be registered`);
  return protocol;
}

function assertContractOk(contract: WorkflowSupervisionContract) {
  const errors = contract.issues.filter((issue) => issue.severity === "error");
  assert.deepEqual(errors, [], JSON.stringify(contract.issues, null, 2));
  assert.equal(contract.ok, true);
  assert.equal(new Set(contract.closedWorldStepIds).size, contract.closedWorldStepIds.length);
  assert.equal(contract.capabilities.deterministicStateTree, true);
  assert.equal(contract.capabilities.replayFixture, true);
  assert.equal(contract.capabilities.sessionManifest, true);
  assert.equal(contract.capabilities.multiscaleEvidence, true);
}

function completionDecision(stepId: string): { decision: MultiscaleDecision; evidence: MultiscaleEvidence[] } {
  return {
    decision: {
      stepComplete: true,
      confidence: 0.91,
      action: "advance",
      summary: "Synthetic high-confidence completion.",
      supportingCheckIds: [`${stepId}:success`],
      warnings: [],
      blockers: [],
    },
    evidence: [
      {
        checkId: `${stepId}:success`,
        scale: "frame",
        modeId: "success-check",
        title: "Single-frame success check",
        ok: true,
        passed: true,
        confidence: 0.91,
        warnings: [],
        blockers: [],
      },
    ],
  };
}

function oneTickReplayFixture(protocol: KitchenProtocol, contract: WorkflowSupervisionContract): KitchenReplayFixture {
  const firstStepId = contract.closedWorldStepIds[0];
  const { decision, evidence } = completionDecision(firstStepId);
  return {
    schemaVersion: "labos.kitchen.replay-fixture.v1",
    fixtureId: `${protocol.id}-contract-replay`,
    source: {
      kind: "synthetic",
      runId: `${protocol.id}-contract-run`,
    },
    protocolId: protocol.id,
    ticks: [
      {
        label: "first-step-high-confidence-pass",
        runId: `${protocol.id}-contract-run`,
        protocolId: protocol.id,
        stepNumber: 1,
        decision,
        evidence,
        expected: {
          action: "advance",
          state: "passed",
          shouldAdvance: true,
        },
      },
    ],
  };
}

function contractFor(id: string) {
  const protocol = loadProtocol(id);
  const preset = workflowPresetForProtocol(protocol.id);
  const plan = buildProtocolMultiscalePlan(protocol);
  return {
    protocol,
    contract: buildWorkflowSupervisionContract({ protocol, preset, plan }),
  };
}

function main() {
  const tea = contractFor("kitchen-tea-v1");
  assertContractOk(tea.contract);
  assert.equal(tea.contract.usesFallbackStepIds, false);
  assert.deepEqual(tea.contract.closedWorldStepIds.slice(0, 2), [
    "setup-tea-workspace",
    "place-mug-on-counter",
  ]);

  const measure = contractFor("kitchen-measure-v1");
  assertContractOk(measure.contract);
  assert.equal(measure.contract.usesFallbackStepIds, true);
  assert.equal(measure.contract.stepCount, 5);
  assert.deepEqual(measure.contract.closedWorldStepIds.slice(0, 2), ["step-1", "step-2"]);

  const toast = contractFor("kitchen-toast-v1");
  assertContractOk(toast.contract);
  assert.equal(toast.contract.usesFallbackStepIds, true);
  assert.deepEqual(toast.contract.closedWorldStepIds.slice(0, 2), ["step-1", "step-2"]);

  for (const { protocol, contract } of [tea, measure, toast]) {
    const replay = runKitchenReplayFixture(oneTickReplayFixture(protocol, contract));
    assert.equal(replay.passed, true, JSON.stringify(replay.mismatches, null, 2));
    assert.equal(replay.tickCount, 1);
  }

  console.log("[workflow-supervision-contract] all checks passed");
}

main();
