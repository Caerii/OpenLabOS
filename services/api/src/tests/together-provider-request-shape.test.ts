import assert from "node:assert/strict";
import { prepareTogetherChatCompletionsBody } from "../ai/providers.js";

function parse(body: string) {
  return JSON.parse(body) as Record<string, any>;
}

function main() {
  const qwenBody = JSON.stringify({
    model: "Qwen/Qwen3.5-9B",
    messages: [{ role: "user", content: "Return JSON." }],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "kitchen_step_analysis",
        schema: { type: "object", properties: {} },
      },
    },
  });
  assert.deepEqual(
    parse(prepareTogetherChatCompletionsBody(qwenBody, {})).reasoning,
    { enabled: false },
  );

  const explicitReasoning = JSON.stringify({
    model: "Qwen/Qwen3.5-9B",
    reasoning: { enabled: true },
  });
  assert.equal(prepareTogetherChatCompletionsBody(explicitReasoning, {}), explicitReasoning);

  const enabledByEnv = prepareTogetherChatCompletionsBody(qwenBody, {
    LABOS_TOGETHER_REASONING_ENABLED: "true",
  });
  assert.equal(enabledByEnv, qwenBody);

  const llamaBody = JSON.stringify({ model: "meta-llama/Llama-3.3-70B-Instruct-Turbo" });
  assert.equal(prepareTogetherChatCompletionsBody(llamaBody, {}), llamaBody);
  assert.equal(prepareTogetherChatCompletionsBody("not json", {}), "not json");

  console.log("[together-provider-request-shape] all checks passed");
}

main();
