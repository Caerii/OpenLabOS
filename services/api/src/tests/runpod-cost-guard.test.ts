import assert from "node:assert/strict";
import {
  buildRunPodCostGuardStatus,
  loadRunPodCostGuardConfig,
  stopRunPodPod,
} from "../ai/runpod/cost-guard.js";

async function main() {
  const empty = buildRunPodCostGuardStatus(loadRunPodCostGuardConfig({}));
  assert.equal(empty.configured, false);
  assert.equal(empty.lifecycleConfigured, false);
  assert.deepEqual(empty.safeActions, []);

  const inferenceOnly = buildRunPodCostGuardStatus(loadRunPodCostGuardConfig({
    RUNPOD_BASE_URL: "http://pod.example:8000/v1",
  } as any));
  assert.equal(inferenceOnly.inferenceConfigured, true);
  assert.equal(inferenceOnly.lifecycleConfigured, false);
  assert.ok(inferenceOnly.recommendations.some((item) => /cost-control gap/i.test(item)));

  let seenUrl = "";
  let seenAuth = "";
  const stop = await stopRunPodPod(
    { apiKey: "rp-test", podId: "pod-123" },
    async (url, init) => {
      seenUrl = String(url);
      seenAuth = String((init?.headers as any)?.Authorization || "");
      return new Response(JSON.stringify({ id: "pod-123", desiredStatus: "stopped" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  );
  assert.equal(stop.success, true);
  assert.equal(stop.podId, "pod-123");
  assert.match(seenUrl, /\/pods\/pod-123\/stop$/);
  assert.equal(seenAuth, "Bearer rp-test");

  console.log("[runpod-cost-guard] all checks passed");
}

void main();

