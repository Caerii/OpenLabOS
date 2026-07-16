import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";

async function listen(server: http.Server) {
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

async function close(server: http.Server) {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

async function getJson<T>(baseUrl: string, path: string): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`);
  const text = await response.text();
  assert.equal(response.ok, true, `${path} failed with ${response.status}: ${text}`);
  return JSON.parse(text) as T;
}

async function main() {
  const mockRunPod = http.createServer((req, res) => {
    if (req.url === "/api/tags") {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ models: [] }));
      return;
    }
    if (req.url === "/v1/models") {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({
        object: "list",
        data: [{ id: "Qwen/Qwen3.5-9B", object: "model" }],
      }));
      return;
    }
    res.statusCode = 404;
    res.end("not found");
  });

  const providerBaseUrl = await listen(mockRunPod);
  process.env.RUNPOD_BASE_URL = providerBaseUrl;
  process.env.RUNPOD_API_KEY = "runpod-test";
  process.env.RUNPOD_POD_ID = "pod-test";
  process.env.OLLAMA_BASE_URL = providerBaseUrl;
  process.env.LMSTUDIO_BASE_URL = providerBaseUrl;
  process.env.GEMINI_LIVE_AUDIO_ROUTE = "browser";

  const [{ default: aiRoutes }, { default: kitchenRoutes }, { default: liveCoachRoutes }, { default: agentsRoutes }, { default: runpodRoutes }, { default: workflowRoutes }, { default: perceptionRoutes }] = await Promise.all([
    import("../routes/ai.js"),
    import("../routes/kitchen.js"),
    import("../routes/live-coach.js"),
    import("../routes/agents.js"),
    import("../routes/runpod.js"),
    import("../routes/workflows.js"),
    import("../routes/perception.js"),
  ]);

  const app = express();
  app.use(express.json({ limit: "50mb" }));
  app.use("/api/ai", aiRoutes);
  app.use("/api/kitchen", kitchenRoutes);
  app.use("/api/live-coach", liveCoachRoutes);
  app.use("/api/agents", agentsRoutes);
  app.use("/api/runpod", runpodRoutes);
  app.use("/api/workflows", workflowRoutes);
  app.use("/api/perception", perceptionRoutes);
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, mode: "test" });
  });

  const appServer = http.createServer(app);
  const appBaseUrl = await listen(appServer);

  try {
    const health = await getJson<{ ok: boolean }>(appBaseUrl, "/api/health");
    assert.equal(health.ok, true);

    const providers = await getJson<{ providers: Array<{ name: string; available: boolean; models: string[] }> }>(
      appBaseUrl,
      "/api/ai/providers",
    );
    const runpod = providers.providers.find((provider) => provider.name === "runpod");
    assert.equal(runpod?.available, true);
    assert.deepEqual(runpod?.models, ["Qwen/Qwen3.5-9B"]);

    const models = await getJson<{ models: string[] }>(appBaseUrl, "/api/ai/models");
    assert.equal(models.models.includes("runpod:Qwen/Qwen3.5-9B"), true);

    const runpodGuard = await getJson<{ lifecycleConfigured: boolean; safeActions: string[] }>(
      appBaseUrl,
      "/api/runpod/guard",
    );
    assert.equal(runpodGuard.lifecycleConfigured, true);
    assert.equal(runpodGuard.safeActions.includes("stop_pod"), true);

    const liveHealth = await getJson<{
      ok: boolean;
      audioRoute: string;
      recordingsEnabled: boolean;
      webRtc: { enabled: boolean; activeProvider: string; providers: Array<{ id: string }> };
    }>(appBaseUrl, "/api/live-coach/health");
    assert.equal(typeof liveHealth.ok, "boolean");
    assert.equal(liveHealth.audioRoute, "browser");
    assert.equal(liveHealth.recordingsEnabled, true);
    assert.equal(liveHealth.webRtc.enabled, false);
    assert.equal(liveHealth.webRtc.providers.some((provider) => provider.id === "browser-loopback"), true);

    const webRtcProviders = await getJson<{ providers: Array<{ id: string }>; activeProvider: string }>(
      appBaseUrl,
      "/api/live-coach/webrtc/providers",
    );
    assert.equal(webRtcProviders.providers.some((provider) => provider.id === "livekit"), true);
    assert.equal(webRtcProviders.providers.some((provider) => provider.id === "pipecat-daily"), true);

    const voices = await getJson<{ voices: Array<{ name: string; character: string; sampleUrl: string; isDefault?: boolean }>; activeVoiceName: string | null }>(
      appBaseUrl,
      "/api/live-coach/voices",
    );
    assert.equal(voices.voices.length, 31);
    assert.equal(voices.voices.filter((voice) => !voice.isDefault).length, 30);
    assert.equal(voices.voices.some((voice) => voice.name === "default" && voice.isDefault), true);
    assert.equal(voices.voices.some((voice) => voice.name === "Puck" && voice.character.includes("lab")), true);
    assert.equal(
      voices.voices.every((voice) =>
        voice.sampleUrl.includes("/api/live-coach/voices/") || voice.sampleUrl.startsWith("/demo/live-coach-voice-samples/"),
      ),
      true,
    );

    const liveScenarios = await getJson<{ scenarios: Array<{ id: string }> }>(appBaseUrl, "/api/live-coach/scenarios");
    assert.equal(liveScenarios.scenarios.some((scenario) => scenario.id === "hot-water-without-mug"), true);

    const liveRecordings = await getJson<{ recordings: unknown[] }>(appBaseUrl, "/api/live-coach/recordings");
    assert.equal(Array.isArray(liveRecordings.recordings), true);

    const agentArchitecture = await getJson<{ roles: unknown[]; tools: unknown[] }>(appBaseUrl, "/api/agents/architecture");
    assert.equal(agentArchitecture.roles.length >= 7, true);
    assert.equal(agentArchitecture.tools.length >= 6, true);

    const perceptionRuntime = await getJson<{
      capabilities: Array<{ id: string; adherenceRole: string; runpodEligible: boolean }>;
      runpod: { inferenceConfigured: boolean; lifecycleConfigured: boolean };
    }>(appBaseUrl, "/api/perception/runtime");
    assert.equal(perceptionRuntime.runpod.inferenceConfigured, true);
    assert.equal(perceptionRuntime.runpod.lifecycleConfigured, true);
    assert.equal(perceptionRuntime.capabilities.some((capability) => capability.id === "b3d-scene-graph"), true);
    assert.equal(
      perceptionRuntime.capabilities.some((capability) =>
        capability.id === "gemini-live-semantic-scene" &&
        capability.adherenceRole === "conversational_context" &&
        capability.runpodEligible === false
      ),
      true,
    );

    const workflows = await getJson<{ presets: Array<{ id: string; defaultProtocolId: string }>; defaultPresetId: string }>(
      appBaseUrl,
      "/api/workflows",
    );
    assert.equal(workflows.defaultPresetId, "kitchen-demo");
    assert.equal(workflows.presets.some((preset) => preset.defaultProtocolId === "kitchen-tea-v1"), true);

    const workflowByProtocol = await getJson<{ id: string; supervisor: { intervalMs: number; maxChecks: number } }>(
      appBaseUrl,
      "/api/workflows/by-protocol/kitchen-tea-v1",
    );
    assert.equal(workflowByProtocol.id, "kitchen-demo");
    assert.equal(workflowByProtocol.supervisor.intervalMs, 15000);
    assert.equal(workflowByProtocol.supervisor.maxChecks, 2);

    const protocols = await getJson<{ protocols: Array<{ id: string }> }>(appBaseUrl, "/api/kitchen/protocols");
    assert.equal(protocols.protocols.some((protocol) => protocol.id === "kitchen-tea-v1"), true);

    const modes = await getJson<{ modes: string[] }>(appBaseUrl, "/api/kitchen/modes");
    assert.equal(modes.modes.includes("success-check"), true);

    const validationPlan = await getJson<{ stepPlans: Array<{ stepNumber: number }> }>(
      appBaseUrl,
      "/api/kitchen/validation/plan/kitchen-tea-v1?stepNumber=1",
    );
    assert.equal(validationPlan.stepPlans.length, 1);
    assert.equal(validationPlan.stepPlans[0].stepNumber, 1);

    const demoSamples = await getJson<{ configured: boolean; samples: unknown[] }>(
      appBaseUrl,
      "/api/kitchen/demo/samples",
    );
    assert.equal(Array.isArray(demoSamples.samples), true);

    const runStatus = await getJson<{ active: boolean }>(appBaseUrl, "/api/kitchen/run/status");
    assert.equal(runStatus.active, false);

    const supervisorStatus = await getJson<{ running: boolean; buffer: { frameCount: number } }>(
      appBaseUrl,
      "/api/kitchen/run/supervisor/status",
    );
    assert.equal(supervisorStatus.running, false);
    assert.equal(typeof supervisorStatus.buffer.frameCount, "number");
  } finally {
    await close(appServer);
    await close(mockRunPod);
  }

  console.log("[dashboard-api-e2e] all checks passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
