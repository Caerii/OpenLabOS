import assert from "node:assert/strict";
import {
  defaultWorkflowPreset,
  workflowPresetForProtocol,
} from "../ai/workflows/index.js";
import { toClosedWorldStepId } from "../ai/kitchen/step-ids.js";

function main() {
  const preset = defaultWorkflowPreset();
  assert.equal(preset.id, "kitchen-demo");
  assert.equal(preset.defaultProtocolId, "kitchen-tea-v1");
  assert.equal(preset.supervisor.intervalMs, 15000);
  assert.equal(preset.supervisor.maxChecks, 2);
  assert.equal(preset.supervisor.maxChecksLimit, 4);
  assert.equal(preset.supervisor.immediate, false);
  assert.equal(preset.voice.contextLabel, "LabOS workflow");

  assert.equal(workflowPresetForProtocol("video-extracted-tea").id, "kitchen-demo");
  assert.equal(workflowPresetForProtocol("kitchen-ramen-v1").id, "kitchen-demo");
  assert.equal(workflowPresetForProtocol("unknown-protocol").id, "kitchen-demo");

  assert.equal(toClosedWorldStepId("kitchen-tea-v1", 1), "setup-tea-workspace");
  assert.equal(toClosedWorldStepId("kitchen-tea-v1", 3), "pour-water-into-mug");
  assert.equal(toClosedWorldStepId("video-extracted-tea", 3), "add-tea-bag");
  assert.equal(toClosedWorldStepId("kitchen-ramen-v1", 6), "pour-into-bowl");
  assert.equal(toClosedWorldStepId("unknown-protocol", 7), "step-7");

  console.log("[workflow-presets] all checks passed");
}

main();
