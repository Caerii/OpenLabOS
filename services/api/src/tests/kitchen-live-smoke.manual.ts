/**
 * Manual external smoke test.
 *
 * Requires dashboard/.env with GOOGLE_GENERATIVE_AI_API_KEY.
 * This is intentionally not part of `pnpm test` because it calls Gemini.
 */
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import express from "express";
import aiRoutes from "../routes/ai.js";
import kitchenRoutes from "../routes/kitchen.js";
import liveCoachRoutes from "../routes/live-coach.js";

async function startServer() {
  const app = express();
  app.use(express.json({ limit: "50mb" }));
  app.use("/api/ai", aiRoutes);
  app.use("/api/kitchen", kitchenRoutes);
  app.use("/api/live-coach", liveCoachRoutes);

  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const started = app.listen(0, "127.0.0.1", () => resolve(started));
  });
  const address = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    }),
  };
}

async function requestJson<T>(baseUrl: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${path} failed with HTTP ${response.status}: ${text.slice(0, 500)}`);
  }
  return text ? JSON.parse(text) as T : null as T;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type LiveRecording = {
  id: string;
  title?: string;
  scenarioId?: string;
  eventCount: number;
  outputWav?: string;
  endedAt?: string;
};

async function getRecordings(baseUrl: string) {
  return requestJson<{ recordings: LiveRecording[] }>(baseUrl, "/api/live-coach/recordings?limit=20");
}

async function waitForOutputAudio(baseUrl: string, recordingId: string, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const health = await requestJson<{
      activeRecordingId: string | null;
      activeRecordingHasOutputAudio: boolean;
    }>(baseUrl, "/api/live-coach/health");
    if (health.activeRecordingId === recordingId && health.activeRecordingHasOutputAudio) return;
    await sleep(500);
  }
}

async function runScenarioRecording(baseUrl: string, scenarioId: string) {
  const started = await requestJson<{
    success: boolean;
    recordingId: string | null;
    status: { state: string; message?: string };
  }>(baseUrl, `/api/live-coach/scenarios/${encodeURIComponent(scenarioId)}/run`, {
    method: "POST",
    body: "{}",
  });
  assert.equal(started.success, true);
  assert.ok(started.recordingId, `expected recording id for ${scenarioId}`);
  if (started.status.state === "error") {
    throw new Error(`Gemini Live scenario failed: ${started.status.message || "unknown error"}`);
  }

  await waitForOutputAudio(baseUrl, started.recordingId);
  await requestJson<{ success: boolean }>(baseUrl, "/api/live-coach/stop", { method: "POST", body: "{}" });
  await sleep(500);

  const recordings = await getRecordings(baseUrl);
  const saved = recordings.recordings.find((recording) => recording.id === started.recordingId);
  assert.ok(saved, `expected saved recording for ${scenarioId}`);
  assert.equal(saved.scenarioId, scenarioId);
  assert.ok(saved.eventCount >= 4, `expected recorded Live events for ${scenarioId}`);
  assert.ok(saved.outputWav, `expected saved Gemini Live output WAV for ${scenarioId}`);
  return saved;
}

async function main() {
  assert.ok(
    process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim(),
    "GOOGLE_GENERATIVE_AI_API_KEY must be configured",
  );

  const server = await startServer();
  try {
    const liveHealth = await requestJson<{
      configured: boolean;
      model: string;
      audioRoute: string;
      recordingsEnabled: boolean;
      recordingsDir: string;
    }>(server.baseUrl, "/api/live-coach/health");
    assert.equal(liveHealth.configured, true);
    assert.equal(liveHealth.recordingsEnabled, true);

    const scenarios = await requestJson<{ scenarios: Array<{ id: string; title: string }> }>(
      server.baseUrl,
      "/api/live-coach/scenarios",
    );
    const scenarioIds = scenarios.scenarios.map((scenario) => scenario.id);
    assert.ok(scenarioIds.includes("hot-water-without-mug"));

    const savedRecordings = [];
    for (const scenarioId of scenarioIds) {
      savedRecordings.push(await runScenarioRecording(server.baseUrl, scenarioId));
    }
    assert.equal(savedRecordings.length, scenarioIds.length);

    const samples = await requestJson<{
      configured: boolean;
      samples: Array<{
        videoUrl: string;
        protocolId: string;
        clipStartSec: number;
        clipEndSec: number;
        targetFps: number;
      }>;
    }>(server.baseUrl, "/api/kitchen/demo/samples");
    assert.equal(samples.configured, true);
    assert.ok(samples.samples.length > 0, "expected preloaded demo samples");

    const sample = samples.samples[0];
    const judgment = await requestJson<{
      success: boolean;
      judgment: {
        step_id: string;
        step_complete: boolean;
        confidence: number;
        reason: string;
      };
      latencyMs: number;
    }>(server.baseUrl, "/api/kitchen/teacher/judgment/video", {
      method: "POST",
      body: JSON.stringify({
        protocolId: sample.protocolId || "kitchen-tea-v1",
        stepNumber: 1,
        videoUrl: sample.videoUrl,
        videoStartOffsetSec: sample.clipStartSec,
        videoEndOffsetSec: sample.clipEndSec,
        videoFps: sample.targetFps || 2,
      }),
    });

    assert.equal(judgment.success, true);
    assert.equal(typeof judgment.judgment.step_complete, "boolean");
    assert.equal(typeof judgment.judgment.confidence, "number");

    console.log("[kitchen-live-smoke] all checks passed");
    console.log(`[kitchen-live-smoke] live model=${liveHealth.model} audioRoute=${liveHealth.audioRoute}`);
    console.log(`[kitchen-live-smoke] saved ${savedRecordings.length} scenario recordings under ${liveHealth.recordingsDir}`);
    console.log(`[kitchen-live-smoke] judgment step=${judgment.judgment.step_id} complete=${judgment.judgment.step_complete} confidence=${judgment.judgment.confidence} latencyMs=${judgment.latencyMs}`);
  } finally {
    await server.close();
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
