import assert from "node:assert/strict";
import {
  asyncStepAnalysisModel,
  isLikelyVisionModel,
  parseKitchenStepAnalysis,
  selectAsyncStepAnalysisModel,
} from "../ai/kitchen/async-step-analysis.js";

function main() {
  assert.equal(
    asyncStepAnalysisModel({ LABOS_ASYNC_STEP_ANALYSIS_MODEL: "lmstudio:test-vlm" } as NodeJS.ProcessEnv),
    "lmstudio:test-vlm",
  );
  assert.equal(asyncStepAnalysisModel({} as NodeJS.ProcessEnv), "together:Qwen/Qwen3.5-9B");
  assert.equal(isLikelyVisionModel("lmstudio:qwen3.5-9b-vlm"), true);
  assert.equal(isLikelyVisionModel("together:Qwen/Qwen3.5-9B"), true);
  assert.equal(isLikelyVisionModel("together:Qwen/Qwen3.5-9B-FP8"), true);
  assert.equal(isLikelyVisionModel("lmstudio:gemma-4-e4b-claude-abliterated"), false);
  assert.equal(
    selectAsyncStepAnalysisModel("lmstudio:gemma-4-e4b-claude-abliterated", [
      "gemma-4-e4b-claude-abliterated",
      "qwen3.5-9b-vlm",
    ]),
    "lmstudio:qwen3.5-9b-vlm",
  );

  const parsed = parseKitchenStepAnalysis(`\`\`\`json
{
  "performed_correctly": true,
  "confidence": 0.82,
  "summary": "The mug is on the counter.",
  "deviation": null,
  "visible_evidence": ["mug visible", "counter visible"],
  "missing_evidence": []
}
\`\`\``);

  assert.equal(parsed.performedCorrectly, true);
  assert.equal(parsed.confidence, 0.82);
  assert.equal(parsed.summary, "The mug is on the counter.");
  assert.deepEqual(parsed.visibleEvidence, ["mug visible", "counter visible"]);
  assert.deepEqual(parsed.missingEvidence, []);

  const camelCase = parseKitchenStepAnalysis(JSON.stringify({
    performedCorrectly: false,
    confidence: 2,
    summary: "Missing tray.",
    deviation: "tray not visible",
    visibleEvidence: ["mug"],
    missingEvidence: ["tray"],
  }));
  assert.equal(camelCase.performedCorrectly, false);
  assert.equal(camelCase.confidence, 1);
  assert.equal(camelCase.deviation, "tray not visible");

  console.log("[kitchen-async-step-analysis] all checks passed");
}

main();
