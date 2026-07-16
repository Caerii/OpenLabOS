import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import express from "express";
import kitchenRoutes, { resetKitchenRouteDepsForTests, setKitchenRouteDepsForTests } from "../routes/kitchen.js";
import { protocolTracker, resetAdherencePolicyState } from "../ai/kitchen/index.js";

type JsonResponse<T> = { status: number; body: T };

async function startServer() {
  const app = express();
  app.use(express.json({ limit: "50mb" }));
  app.use("/api/kitchen", kitchenRoutes);
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const started = app.listen(0, "127.0.0.1", () => resolve(started));
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("test server did not bind");
  return {
    baseUrl: `http://127.0.0.1:${(address as AddressInfo).port}/api/kitchen`,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    }),
  };
}

async function requestJson<T>(baseUrl: string, path: string, init?: RequestInit): Promise<JsonResponse<T>> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) as T : null as T };
}

async function getJson<T>(baseUrl: string, path: string) {
  return requestJson<T>(baseUrl, path, { method: "GET" });
}

async function postJson<T>(baseUrl: string, path: string, body: unknown = {}) {
  return requestJson<T>(baseUrl, path, { method: "POST", body: JSON.stringify(body) });
}

function resetState() {
  protocolTracker.abortRun("guided demo contract reset");
  resetAdherencePolicyState();
}

async function main() {
  const previousMode = process.env.LABOS_ENTITY_SEGMENTATION_MODE;
  const previousSupervisorEnabled = process.env.LABOS_REALTIME_SUPERVISOR_ENABLED;
  process.env.LABOS_ENTITY_SEGMENTATION_MODE = "mock";
  process.env.LABOS_REALTIME_SUPERVISOR_ENABLED = "true";

  const runCalls: Array<{ id: string; outputType: string }> = [];
  setKitchenRouteDepsForTests({
    runERMode: async (mode) => {
      runCalls.push({ id: mode.id, outputType: mode.outputType });
      if (mode.id === "success-check") {
        return {
          raw: "{\"success\":true,\"confidence\":0.88,\"reasoning\":\"synthetic step satisfied\"}",
          parsed: { success: true, confidence: 0.88, reasoning: "synthetic step satisfied" },
          latencyMs: 5,
        };
      }
      if (mode.outputType === "points") {
        return {
          raw: "[]",
          parsed: [
            { point: [200, 300], label: "mug" },
            { point: [400, 500], label: "counter" },
          ],
          latencyMs: 5,
        };
      }
      return { raw: "{}", parsed: {}, latencyMs: 5 };
    },
    captureFrame: async () => Buffer.from("synthetic-frame"),
    saveKitchenFrame: async (_buffer, opts) => `kitchen/frames/${opts?.prefix || "synthetic"}-frame.jpg`,
    appendKitchenEvent: async () => undefined,
    saveCurrentRunSnapshot: async () => undefined,
    warmKitchenProtocolCamera: async () => undefined,
    liveCoachSendText: async () => undefined,
  });

  resetState();
  const server = await startServer();
  const testImage = Buffer.from("synthetic-jpeg").toString("base64");

  try {
    const status = await getJson<{ mode: string; configured: boolean }>(
      server.baseUrl,
      "/analyze/entity-segmentation/status?probe=1",
    );
    assert.equal(status.status, 200);
    assert.equal(status.body.mode, "mock");
    assert.equal(status.body.configured, true);

    const segmentation = await postJson<{
      mode: string;
      parsed: { observations: unknown[]; tracks: unknown[]; summary: { hasMasks: boolean } };
    }>(server.baseUrl, "/analyze/entity-segmentation", {
      prompts: ["mug", "kettle", "tea bag", "hand"],
      testImage,
      includeMasks: true,
      includeTracks: true,
    });
    assert.equal(segmentation.status, 200);
    assert.equal(segmentation.body.mode, "entity-segmentation");
    assert.equal(segmentation.body.parsed.observations.length, 4);
    assert.equal(segmentation.body.parsed.tracks.length, 4);
    assert.equal(segmentation.body.parsed.summary.hasMasks, true);

    const plan = await getJson<{
      stepPlans: Array<{ checks: Array<{ modeId: string; scale: string }> }>;
    }>(server.baseUrl, "/validation/plan/kitchen-tea-v1?stepNumber=1");
    assert.equal(plan.status, 200);
    assert.ok(plan.body.stepPlans[0].checks.some((check) => check.modeId === "entity-segmentation"));

    const validation = await postJson<{
      selectedChecks: Array<{ modeId: string }>;
      evidence: Array<{ modeId: string; ok: boolean; parsed?: any }>;
      decision: { action: string; stepComplete: boolean };
    }>(server.baseUrl, "/validation/step", {
      protocolId: "kitchen-tea-v1",
      stepNumber: 1,
      scales: ["frame"],
      maxChecks: 4,
      testImage,
      includeEntityMasks: true,
    });
    assert.equal(validation.status, 200);
    assert.ok(validation.body.selectedChecks.some((check) => check.modeId === "entity-segmentation"));
    const entityEvidence = validation.body.evidence.find((item) => item.modeId === "entity-segmentation");
    assert.ok(entityEvidence);
    assert.equal(entityEvidence.ok, true);
    assert.equal(entityEvidence.parsed.summary.hasMasks, true);

    const runStart = await postJson<{ run: { status: string } }>(server.baseUrl, "/run/start", { protocolId: "kitchen-tea-v1" });
    assert.equal(runStart.status, 200);
    const forceStart = await postJson<{ run: { status: string } }>(server.baseUrl, "/run/force-start");
    assert.equal(forceStart.status, 200);
    assert.equal(forceStart.body.run.status, "running");

    const supervisor = await postJson<{ running: boolean; intervalMs: number; maxChecks: number }>(
      server.baseUrl,
      "/run/supervisor/start",
      { intervalMs: 5000, maxChecks: 6, immediate: false },
    );
    assert.equal(supervisor.status, 200);
    assert.equal(supervisor.body.running, true);
    assert.equal(supervisor.body.intervalMs, 10000);
    assert.equal(supervisor.body.maxChecks, 4);

    const supervisorStop = await postJson<{ running: boolean; stopReason: string }>(server.baseUrl, "/run/supervisor/stop");
    assert.equal(supervisorStop.status, 200);
    assert.equal(supervisorStop.body.running, false);

    assert.ok(runCalls.some((call) => call.id === "success-check"));
    console.log("[kitchen-guided-demo-contract] all checks passed");
  } finally {
    await server.close();
    resetKitchenRouteDepsForTests();
    resetState();
    if (previousMode === undefined) delete process.env.LABOS_ENTITY_SEGMENTATION_MODE;
    else process.env.LABOS_ENTITY_SEGMENTATION_MODE = previousMode;
    if (previousSupervisorEnabled === undefined) delete process.env.LABOS_REALTIME_SUPERVISOR_ENABLED;
    else process.env.LABOS_REALTIME_SUPERVISOR_ENABLED = previousSupervisorEnabled;
  }
}

void main();
