import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import express from "express";
import kitchenRoutes, { resetKitchenRouteDepsForTests, setKitchenRouteDepsForTests } from "../routes/kitchen.js";
import { protocolTracker, resetAdherencePolicyState } from "../ai/kitchen/index.js";

async function startServer() {
  const app = express();
  app.use(express.json({ limit: "50mb" }));
  app.use("/api/kitchen", kitchenRoutes);
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const started = app.listen(0, "127.0.0.1", () => resolve(started));
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test server address");
  return {
    baseUrl: `http://127.0.0.1:${(address as AddressInfo).port}/api/kitchen`,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    }),
  };
}

async function postJson<T>(baseUrl: string, path: string, body: unknown) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) as T : null as T };
}

async function getJson<T>(baseUrl: string, path: string) {
  const response = await fetch(`${baseUrl}${path}`);
  return { status: response.status, body: await response.json() as T };
}

function resetKitchen() {
  protocolTracker.abortRun("hands-free route test reset");
  resetAdherencePolicyState();
}

function recordingState(active: boolean) {
  return {
    active,
    startedAt: active ? new Date().toISOString() : null,
    stoppedAt: active ? null : new Date().toISOString(),
    lastCommand: active ? "start" as const : "stop" as const,
    lastMode: "explicit" as const,
    lastOutput: "test",
    activeVideoPath: active ? "/tmp/test.mp4" : "",
    lastVideoPath: "",
  };
}

function previewHealth(active: boolean) {
  return {
    ok: true,
    fps: 2,
    deviceFps: 2,
    observedFps: 2,
    bufferApproxFps: 2,
    fpsSource: "device" as const,
    frameCount: 2,
    streaming: true,
    frameReachable: true,
    frameBytes: 1024,
    recording: active,
    activeVideoPath: active ? "/tmp/test.mp4" : "",
    lastVideoPath: "",
  };
}

async function main() {
  const previousHandsFreeEnabled = process.env.LABOS_HANDS_FREE_ENABLED;
  const previousSupervisorEnabled = process.env.LABOS_REALTIME_SUPERVISOR_ENABLED;
  process.env.LABOS_HANDS_FREE_ENABLED = "true";
  process.env.LABOS_REALTIME_SUPERVISOR_ENABLED = "true";

  resetKitchen();
  let wifiEnabled = 0;
  let audioStarted = 0;
  let recordingStarted = 0;
  let recordingActive = true;
  const liveCoachMessages: string[] = [];

  setKitchenRouteDepsForTests({
    enableWifiProxy: async () => {
      wifiEnabled += 1;
      return { success: true, ip: "192.168.50.122", token: "test-token", mode: "wifi" };
    },
    getWifiProxyStatus: () => ({ mode: "wifi", glassesIp: "192.168.50.122", hasToken: true }),
    startGlassesAudioBridge: async () => {
      audioStarted += 1;
      return {
        running: true,
        connected: true,
        wsUrl: "ws://127.0.0.1:3847/api/live-coach/ws",
        sampleRate: 16000,
        outputSampleRate: 24000,
        playbackEnabled: true,
        startedAt: Date.now(),
        lastAudioAt: Date.now(),
        chunksSent: 1,
        bytesSent: 6400,
        audioBytesPlayed: 0,
        lastError: "",
      };
    },
    getGlassesAudioBridgeStatus: async () => ({
      running: true,
      connected: true,
      wsUrl: "ws://127.0.0.1:3847/api/live-coach/ws",
      sampleRate: 16000,
      outputSampleRate: 24000,
      playbackEnabled: true,
      startedAt: Date.now(),
      lastAudioAt: Date.now(),
      chunksSent: 1,
      bytesSent: 6400,
      audioBytesPlayed: 0,
      lastError: "",
    }),
    stopGlassesAudioBridge: async () => ({ running: false, connected: false } as any),
    startNativeRecording: async () => {
      recordingStarted += 1;
      return {
        success: true,
        mode: "explicit",
        state: recordingState(true),
        health: previewHealth(true),
      };
    },
    refreshNativeRecordingStatus: async () => ({
      ok: true,
      state: recordingState(recordingActive),
      health: previewHealth(recordingActive),
    }),
    previewHealthSnapshot: async () => previewHealth(recordingActive),
    captureFrame: async () => Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
    saveKitchenFrame: async () => "kitchen/frames/test-inventory.jpg",
    stopNativeRecording: async () => ({
      success: true,
      alreadyStopped: true,
      mode: "explicit",
      state: recordingState(false),
    }),
    warmKitchenProtocolCamera: async () => undefined,
    liveCoachSendText: async (text) => {
      liveCoachMessages.push(text);
    },
    liveCoachStop: async () => undefined,
    saveKitchenSessionManifest: async (runId?: string) => ({
      manifest: { run: { id: runId || "current" } } as any,
      manifestRef: `kitchen/manifests/${runId || "current"}.json`,
    }),
  });

  const server = await startServer();
  try {
    process.env.LABOS_HANDS_FREE_ENABLED = "false";
    const disabled = await postJson<{ error: string }>(
      server.baseUrl,
      "/hands-free/start",
      { protocolId: "kitchen-tea-v1" },
    );
    assert.equal(disabled.status, 400);
    assert.match(disabled.body.error, /hands-free protocol runs are disabled/i);
    process.env.LABOS_HANDS_FREE_ENABLED = "true";

    const start = await postJson<{ success: boolean; status: { ready: { recordingActive: boolean; voiceConnected: boolean; supervisorRunning: boolean } } }>(
      server.baseUrl,
      "/hands-free/start",
      {
        protocolId: "kitchen-tea-v1",
        glassesIp: "192.168.50.122",
        wsUrl: "ws://127.0.0.1:3847/api/live-coach/ws",
        supervisor: { intervalMs: 3000, maxChecks: 2, immediate: false },
      },
    );
    assert.equal(start.status, 200);
    assert.equal(start.body.success, true);
    assert.equal(wifiEnabled, 1);
    assert.equal(audioStarted, 1);
    assert.equal(recordingStarted, 1);
    assert.equal(start.body.status.ready.recordingActive, true);
    assert.equal(start.body.status.ready.voiceConnected, true);
    assert.equal(start.body.status.ready.supervisorRunning, true);
    assert.equal(liveCoachMessages.length, 1);
    assert.match(liveCoachMessages[0], /hands-free step guide started/i);
    assert.match(liveCoachMessages[0], /Inventory preflight/i);
    assert.match(liveCoachMessages[0], /what do I do next/i);
    assert.doesNotMatch(liveCoachMessages[0], /tap when ready/i);

    const status = await getJson<{ ready: { runActive: boolean } }>(server.baseUrl, "/hands-free/status");
    assert.equal(status.status, 200);
    assert.equal(status.body.ready.runActive, true);

    const stop = await postJson<{ success: boolean }>(server.baseUrl, "/hands-free/stop", {});
    assert.equal(stop.status, 200);
    assert.equal(stop.body.success, true);

    recordingActive = false;
    const failed = await postJson<{ error: string }>(
      server.baseUrl,
      "/hands-free/start",
      {
        protocolId: "kitchen-tea-v1",
        glassesIp: "192.168.50.122",
        wsUrl: "ws://127.0.0.1:3847/api/live-coach/ws",
      },
    );
    assert.equal(failed.status, 400);
    assert.match(failed.body.error, /recording/i);
  } finally {
    await server.close();
    resetKitchen();
    resetKitchenRouteDepsForTests();
    if (previousHandsFreeEnabled === undefined) delete process.env.LABOS_HANDS_FREE_ENABLED;
    else process.env.LABOS_HANDS_FREE_ENABLED = previousHandsFreeEnabled;
    if (previousSupervisorEnabled === undefined) delete process.env.LABOS_REALTIME_SUPERVISOR_ENABLED;
    else process.env.LABOS_REALTIME_SUPERVISOR_ENABLED = previousSupervisorEnabled;
  }

  console.log("[kitchen-hands-free-routes] all checks passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
