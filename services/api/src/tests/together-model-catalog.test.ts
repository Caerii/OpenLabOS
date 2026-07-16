import assert from "node:assert/strict";
import { buildTogetherProfiles, parseTogetherModelIds } from "../ai/together";

function main() {
  assert.deepEqual(
    parseTogetherModelIds(JSON.stringify({
      data: [
        { id: "Qwen/Qwen2.5-VL-72B-Instruct" },
        { id: "meta-llama/Llama-3.2-11B-Vision-Instruct-Turbo" },
      ],
    })),
    [
      "Qwen/Qwen2.5-VL-72B-Instruct",
      "meta-llama/Llama-3.2-11B-Vision-Instruct-Turbo",
    ],
  );

  assert.deepEqual(
    parseTogetherModelIds(JSON.stringify([
      { id: "qwen3.5-9b-vlm" },
      { name: "Qwen/Qwen3.5-9B-VL" },
      "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    ])),
    [
      "qwen3.5-9b-vlm",
      "Qwen/Qwen3.5-9B-VL",
      "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    ],
  );

  const profiles = buildTogetherProfiles([
    "Qwen/Qwen3.5-9B",
    "Qwen/Qwen3.5-9B-FP8",
    "meta-llama/Llama-3.3-70B-Instruct-Turbo",
  ]);
  assert.equal(profiles[0].labosModelId, "together:Qwen/Qwen3.5-9B");
  assert.equal(profiles[0].vision, true);
  assert.equal(profiles[1].vision, true);
  assert.equal(profiles[2].vision, false);

  console.log("[together-model-catalog] all checks passed");
}

main();
