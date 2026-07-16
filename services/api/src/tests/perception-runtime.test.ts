import assert from "node:assert/strict";
import { buildPerceptionRuntimeStatus } from "../ai/perception/runtimes.js";

function main() {
  const base = buildPerceptionRuntimeStatus({} as NodeJS.ProcessEnv);
  assert.equal(base.capabilities.some((capability) => capability.id === "gemini-live-semantic-scene"), true);
  assert.equal(base.capabilities.some((capability) => capability.id === "b3d-scene-graph"), true);
  assert.equal(base.capabilities.some((capability) => capability.id === "labclaw-egohos-segmentation"), true);

  const gemini = base.capabilities.find((capability) => capability.id === "gemini-live-semantic-scene");
  assert.equal(gemini?.adherenceRole, "conversational_context");
  assert.equal(gemini?.runpodEligible, false);

  const configured = buildPerceptionRuntimeStatus({
    GOOGLE_GENERATIVE_AI_API_KEY: "test-google",
    LABOS_SEGMENTATION_SIDECAR_URL: "https://segmentation.example",
    LABOS_SEGMENTATION_SIDECAR_TOKEN: "secret-token",
    LABOS_LABCLAW_VISION_RUNTIME_URL: "https://vision.example",
    LABOS_B3D_RUNTIME_URL: "https://b3d.example",
    RUNPOD_BASE_URL: "https://runpod.example/v1",
    RUNPOD_API_KEY: "runpod-secret",
    RUNPOD_POD_ID: "pod-test",
  } as NodeJS.ProcessEnv);

  assert.equal(configured.runpod.inferenceConfigured, true);
  assert.equal(configured.runpod.lifecycleConfigured, true);
  assert.equal(configured.endpoints.segmentationSidecarUrl, "https://segmentation.example");
  assert.equal(configured.endpoints.labclawVisionRuntimeUrl, "https://vision.example");
  assert.equal(configured.endpoints.b3dRuntimeUrl, "https://b3d.example");

  const byId = new Map(configured.capabilities.map((capability) => [capability.id, capability]));
  assert.equal(byId.get("gemini-live-semantic-scene")?.readiness, "available");
  assert.equal(byId.get("entity-segmentation")?.readiness, "configured");
  assert.equal(byId.get("labclaw-handtracking")?.readiness, "configured");
  assert.equal(byId.get("b3d-scene-graph")?.readiness, "configured");

  const serialized = JSON.stringify(configured);
  assert.equal(serialized.includes("secret-token"), false);
  assert.equal(serialized.includes("runpod-secret"), false);

  console.log("[perception-runtime] all checks passed");
}

main();
