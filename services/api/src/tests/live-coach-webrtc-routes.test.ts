import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";

type JsonResponse<T> = {
  status: number;
  body: T;
};

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

async function requestJson<T>(baseUrl: string, path: string, init?: RequestInit): Promise<JsonResponse<T>> {
  const response = await fetch(`${baseUrl}${path}`, init);
  const text = await response.text();
  return {
    status: response.status,
    body: text ? JSON.parse(text) as T : {} as T,
  };
}

function withJson(body: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

const previousEnv = {
  LABOS_EXPERIMENTAL_WEBRTC_ENABLED: process.env.LABOS_EXPERIMENTAL_WEBRTC_ENABLED,
  LABOS_WEBRTC_PROVIDER: process.env.LABOS_WEBRTC_PROVIDER,
  LABOS_WEBRTC_SIGNALING_URL: process.env.LABOS_WEBRTC_SIGNALING_URL,
  LIVEKIT_URL: process.env.LIVEKIT_URL,
  LIVEKIT_API_KEY: process.env.LIVEKIT_API_KEY,
  LIVEKIT_API_SECRET: process.env.LIVEKIT_API_SECRET,
  LIVEKIT_AGENT_NAME: process.env.LIVEKIT_AGENT_NAME,
  GEMINI_LIVE_AUDIO_ROUTE: process.env.GEMINI_LIVE_AUDIO_ROUTE,
};

function restoreEnv(name: keyof typeof previousEnv) {
  const value = previousEnv[name];
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

let forwardedOffer: any = null;
const mockGateway = http.createServer((req, res) => {
  if (req.method !== "POST" || req.url !== "/signal") {
    res.statusCode = 404;
    res.end("not found");
    return;
  }

  let raw = "";
  req.setEncoding("utf8");
  req.on("data", (chunk) => {
    raw += chunk;
  });
  req.on("end", () => {
    forwardedOffer = raw ? JSON.parse(raw) : {};
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({
      answer: {
        type: "answer",
        sdp: "v=0\r\ns=LabOS Mock WebRTC Gateway\r\n",
      },
      gateway: "mock-sdp",
    }));
  });
});

const gatewayBaseUrl = await listen(mockGateway);
process.env.GEMINI_LIVE_AUDIO_ROUTE = "browser";

const { default: liveCoachRoutes } = await import("../routes/live-coach.js");
const app = express();
app.use(express.json());
app.use("/api/live-coach", liveCoachRoutes);

const appServer = http.createServer(app);
const appBaseUrl = await listen(appServer);

try {
  process.env.LABOS_EXPERIMENTAL_WEBRTC_ENABLED = "false";
  delete process.env.LABOS_WEBRTC_PROVIDER;
  delete process.env.LABOS_WEBRTC_SIGNALING_URL;

  const disabled = await requestJson<{ error: string }>(
    appBaseUrl,
    "/api/live-coach/webrtc/signal",
    withJson({ providerId: "custom-sdp", offer: { type: "offer", sdp: "disabled" } }),
  );
  assert.equal(disabled.status, 404);
  assert.match(disabled.body.error, /disabled/i);

  process.env.LABOS_EXPERIMENTAL_WEBRTC_ENABLED = "true";
  process.env.LABOS_WEBRTC_PROVIDER = "custom-sdp";
  process.env.LABOS_WEBRTC_SIGNALING_URL = `${gatewayBaseUrl}/signal`;

  const config = await requestJson<{
    enabled: boolean;
    mode: string;
    activeProvider: string;
    transportReady: boolean;
    signalingReady: boolean;
  }>(appBaseUrl, "/api/live-coach/webrtc/config");
  assert.equal(config.status, 200);
  assert.equal(config.body.enabled, true);
  assert.equal(config.body.mode, "gateway");
  assert.equal(config.body.activeProvider, "custom-sdp");
  assert.equal(config.body.transportReady, true);
  assert.equal(config.body.signalingReady, true);

  const providers = await requestJson<{
    activeProvider: string;
    providers: Array<{ id: string; signalingReady: boolean }>;
  }>(appBaseUrl, "/api/live-coach/webrtc/providers");
  assert.equal(providers.body.activeProvider, "custom-sdp");
  assert.equal(providers.body.providers.some((provider) => provider.id === "livekit"), true);
  assert.equal(providers.body.providers.some((provider) => provider.id === "pipecat-daily"), true);
  assert.equal(providers.body.providers.some((provider) => provider.id === "fishjam"), true);

  const signal = await requestJson<{
    answer?: { type: string; sdp: string };
    gateway?: string;
  }>(appBaseUrl, "/api/live-coach/webrtc/signal", withJson({
    sessionId: "route-e2e",
    providerId: "custom-sdp",
    kind: "live-coach-audio",
    offer: { type: "offer", sdp: "v=0\r\ns=LabOS Route E2E\r\n" },
    audioBitrateBps: 32_000,
  }));
  assert.equal(signal.status, 200);
  assert.equal(signal.body.answer?.type, "answer");
  assert.equal(signal.body.gateway, "mock-sdp");
  assert.equal(forwardedOffer.sessionId, "route-e2e");
  assert.equal(forwardedOffer.providerId, "custom-sdp");
  assert.equal(forwardedOffer.offer.type, "offer");

  const recorded = await requestJson<{
    latest: { providerId: string; sessionId: string; bitrateSentKbps: number };
  }>(appBaseUrl, "/api/live-coach/webrtc/metrics", withJson({
    providerId: "custom-sdp",
    sessionId: "route-e2e",
    bitrateSentKbps: 29,
    jitterMs: 4,
  }));
  assert.equal(recorded.status, 200);
  assert.equal(recorded.body.latest.providerId, "custom-sdp");
  assert.equal(recorded.body.latest.sessionId, "route-e2e");
  assert.equal(recorded.body.latest.bitrateSentKbps, 29);

  process.env.LABOS_WEBRTC_PROVIDER = "livekit";
  delete process.env.LABOS_WEBRTC_SIGNALING_URL;
  process.env.LIVEKIT_URL = "wss://labos.example.livekit.cloud";
  process.env.LIVEKIT_API_KEY = "api-key";
  process.env.LIVEKIT_API_SECRET = "api-secret";
  process.env.LIVEKIT_AGENT_NAME = "labos-test-agent";

  const livekitStatus = await requestJson<{
    configured: boolean;
    url: string;
    agentName: string;
  }>(appBaseUrl, "/api/live-coach/webrtc/livekit/status");
  assert.equal(livekitStatus.status, 200);
  assert.equal(livekitStatus.body.configured, true);
  assert.equal(livekitStatus.body.agentName, "labos-test-agent");

  const livekitConfig = await requestJson<{
    enabled: boolean;
    mode: string;
    activeProvider: string;
    transportReady: boolean;
    signalingReady: boolean;
    providers: Array<{ id: string; roomTokenReady?: boolean }>;
  }>(appBaseUrl, "/api/live-coach/webrtc/config");
  assert.equal(livekitConfig.status, 200);
  assert.equal(livekitConfig.body.enabled, true);
  assert.equal(livekitConfig.body.mode, "gateway");
  assert.equal(livekitConfig.body.activeProvider, "livekit");
  assert.equal(livekitConfig.body.transportReady, true);
  assert.equal(livekitConfig.body.signalingReady, true);
  assert.equal(livekitConfig.body.providers.find((provider) => provider.id === "livekit")?.roomTokenReady, true);

  const livekitSession = await requestJson<{
    provider: string;
    token: string;
    roomName: string;
    identity: string;
    agentName: string;
    dispatch: { attempted: boolean; created: boolean };
  }>(appBaseUrl, "/api/live-coach/webrtc/livekit/session", withJson({
    roomName: "Kitchen Route Test",
    identity: "Operator Route",
    protocolId: "kitchen-tea-v1",
    dispatchAgent: false,
  }));
  assert.equal(livekitSession.status, 200);
  assert.equal(livekitSession.body.provider, "livekit");
  assert.equal(livekitSession.body.roomName, "kitchen-route-test");
  assert.equal(livekitSession.body.identity, "operator-route");
  assert.equal(livekitSession.body.agentName, "labos-test-agent");
  assert.equal(livekitSession.body.dispatch.attempted, false);
  assert.ok(livekitSession.body.token);
} finally {
  restoreEnv("LABOS_EXPERIMENTAL_WEBRTC_ENABLED");
  restoreEnv("LABOS_WEBRTC_PROVIDER");
  restoreEnv("LABOS_WEBRTC_SIGNALING_URL");
  restoreEnv("LIVEKIT_URL");
  restoreEnv("LIVEKIT_API_KEY");
  restoreEnv("LIVEKIT_API_SECRET");
  restoreEnv("LIVEKIT_AGENT_NAME");
  restoreEnv("GEMINI_LIVE_AUDIO_ROUTE");
  await close(appServer);
  await close(mockGateway);
}

console.log("[live-coach-webrtc-routes] all checks passed");
