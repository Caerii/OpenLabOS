/**
 * Unit tests for model id routing (no API keys, no network).
 * Run via: pnpm test (see package.json)
 */
import assert from "node:assert/strict";
import {
  providerIdFromModelId,
  prefersFreeformFrameAnalysis,
  suggestedVisionMaxConcurrent,
  usesStructuredFramePipeline,
} from "../ai/model-strategy.js";
import { heuristicModelCapabilities } from "../ai/heuristic-model-profile.js";

function testProviderIdFromModelId() {
  assert.equal(providerIdFromModelId("together:meta-llama/Llama-3.2-11B-Vision-Instruct-Turbo"), "together");
  assert.equal(providerIdFromModelId("openai:gpt-4o"), "openai");
  assert.equal(providerIdFromModelId("ollama:llava:7b"), "ollama");
  assert.equal(providerIdFromModelId("lmstudio:some-model"), "lmstudio");
  assert.equal(providerIdFromModelId("runpod:Qwen/Qwen3.5-9B"), "runpod");
  assert.equal(providerIdFromModelId("bare-id"), "");
}

function testFreeformVsStructured() {
  assert.equal(prefersFreeformFrameAnalysis("ollama:llava:7b"), true);
  assert.equal(prefersFreeformFrameAnalysis("lmstudio:x"), true);
  assert.equal(prefersFreeformFrameAnalysis("google:gemini-2.5-flash"), false);
  assert.equal(prefersFreeformFrameAnalysis("openai:gpt-4o"), false);
  assert.equal(prefersFreeformFrameAnalysis("runpod:Qwen/Qwen3.5-9B"), false);
  assert.equal(prefersFreeformFrameAnalysis("together:Qwen/Qwen2.5-VL-72B-Instruct"), false);
  assert.equal(usesStructuredFramePipeline("together:Qwen/Qwen2.5-VL-72B-Instruct"), true);
  assert.equal(usesStructuredFramePipeline("runpod:Qwen/Qwen3.5-9B"), true);
}

function testSuggestedVisionMaxConcurrent() {
  assert.equal(suggestedVisionMaxConcurrent("ollama:llava:7b"), 1);
  assert.equal(suggestedVisionMaxConcurrent("lmstudio:a"), 1);
  assert.equal(suggestedVisionMaxConcurrent("runpod:Qwen/Qwen3.5-9B"), 3);
  assert.equal(suggestedVisionMaxConcurrent("together:x/y"), 3);
  assert.equal(suggestedVisionMaxConcurrent("openai:gpt-4o"), 3);
}

function testHeuristicCapabilities() {
  const qwen = heuristicModelCapabilities("Qwen/Qwen2.5-VL-7B-Instruct");
  assert.equal(qwen.vision, true);
  assert.equal(heuristicModelCapabilities("Qwen/Qwen3.5-9B").vision, true);
  assert.equal(heuristicModelCapabilities("together:Qwen/Qwen3.5-9B-FP8").vision, true);
  const txt = heuristicModelCapabilities("meta-llama/Llama-3.3-70B-Instruct-Turbo");
  assert.equal(txt.vision, false);
}

function main() {
  testProviderIdFromModelId();
  testFreeformVsStructured();
  testSuggestedVisionMaxConcurrent();
  testHeuristicCapabilities();
  console.log("[ai-model-strategy] all checks passed");
}

main();
