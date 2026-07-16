import assert from "node:assert/strict";

const storage = new Map<string, string>();

(globalThis as any).localStorage = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
};

(globalThis as any).performance = { now: () => 0 };

const requests: Array<{ url: string; method: string; body?: string }> = [];

(globalThis as any).fetch = async (url: string, init?: RequestInit) => {
  requests.push({
    url,
    method: init?.method || "GET",
    body: typeof init?.body === "string" ? init.body : undefined,
  });
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ success: true, run: {}, status: {} }),
  };
};

const {
  kitchenHandsFreeStart,
  kitchenHandsFreeStop,
  kitchenOperatorBegin,
  kitchenOperatorConfirmStep,
  kitchenOperatorReadiness,
  kitchenRunStart,
} = await import("../api/kitchen/run");

await kitchenHandsFreeStart({ protocolId: "kitchen-tea-v1" });
assert.equal(requests.at(-1)?.method, "POST");
assert.equal(requests.at(-1)?.url, "/api/kitchen/hands-free/start");
assert.equal(requests.at(-1)?.body, JSON.stringify({ protocolId: "kitchen-tea-v1" }));

await kitchenHandsFreeStop();
assert.equal(requests.at(-1)?.method, "POST");
assert.equal(requests.at(-1)?.url, "/api/kitchen/hands-free/stop");

await kitchenRunStart("kitchen-tea-v1");
assert.equal(requests.at(-1)?.method, "POST");
assert.equal(requests.at(-1)?.url, "/api/kitchen/run/start");

await kitchenOperatorReadiness();
assert.equal(requests.at(-1)?.method, "GET");
assert.equal(requests.at(-1)?.url, "/api/kitchen/operator/readiness");

await kitchenOperatorBegin("kitchen-tea-v1", { suppressStepCoach: true });
assert.equal(requests.at(-1)?.method, "POST");
assert.equal(requests.at(-1)?.url, "/api/kitchen/operator/begin");
assert.equal(requests.at(-1)?.body, JSON.stringify({ protocolId: "kitchen-tea-v1", suppressStepCoach: true }));

await kitchenOperatorConfirmStep({ stopRecordingForSegment: true });
assert.equal(requests.at(-1)?.method, "POST");
assert.equal(requests.at(-1)?.url, "/api/kitchen/operator/confirm-step");
assert.equal(requests.at(-1)?.body, JSON.stringify({ stopRecordingForSegment: true }));

console.log("[kitchen-api-paths] all checks passed");
