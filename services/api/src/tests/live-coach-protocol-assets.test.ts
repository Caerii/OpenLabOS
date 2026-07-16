import assert from "node:assert/strict";
import { TEA_PROTOCOL, TOAST_PROTOCOL } from "../ai/kitchen/protocols.js";
import { generateProtocolVoicePlan } from "../live-coach/protocol-voice-assets.js";

function assertProtocolPlan(protocol: typeof TEA_PROTOCOL) {
  const plan = generateProtocolVoicePlan(protocol, new Date("2026-04-26T00:00:00Z"));
  assert.equal(plan.protocolId, protocol.id);
  assert.equal(plan.protocolName, protocol.name);
  assert.ok(plan.scenarioCount > protocol.steps.length * 4, "plan should include intro/pass/recovery/edge cases");
  assert.equal(plan.scenarioCount, plan.scenarios.length);
  assert.ok(plan.scenarios.some((item) => item.category === "welcome"));
  assert.ok(plan.scenarios.some((item) => item.category === "preflight"));
  assert.ok(plan.scenarios.some((item) => item.category === "completion"));

  for (const step of protocol.steps) {
    const stepScenarios = plan.scenarios.filter((item) => item.stepNumber === step.number);
    assert.ok(stepScenarios.some((item) => item.category === "step_intro"), `missing intro for step ${step.number}`);
    assert.ok(stepScenarios.some((item) => item.category === "success"), `missing success for step ${step.number}`);
    assert.ok(stepScenarios.some((item) => item.category === "uncertainty"), `missing uncertainty for step ${step.number}`);
    assert.ok(stepScenarios.some((item) => item.category === "recovery"), `missing recovery for step ${step.number}`);
    assert.ok(stepScenarios.some((item) => item.category === "deviance"), `missing deviance for step ${step.number}`);
  }

  for (const scenario of plan.scenarios) {
    assert.ok(scenario.id.startsWith(`${protocol.id}__`));
    assert.ok(scenario.prompt.includes("hands-free copilot"));
    assert.ok(scenario.script.length > 20);
    assert.ok(scenario.trigger.length > 0);
  }
}

assertProtocolPlan(TEA_PROTOCOL);
assertProtocolPlan(TOAST_PROTOCOL);

console.log("[live-coach-protocol-assets] all checks passed");
