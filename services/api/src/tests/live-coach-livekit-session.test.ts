import assert from "node:assert/strict";
import {
  createLiveKitSession,
  getLiveKitSessionConfig,
} from "../live-coach/livekit-session.js";

function decodeJwtPayload(token: string): any {
  const [, payload] = token.split(".");
  assert.ok(payload, "token payload segment should exist");
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
}

const missing = getLiveKitSessionConfig({});
assert.equal(missing.configured, false);
assert.equal(missing.url, null);
assert.equal(missing.apiKeyConfigured, false);
assert.equal(missing.apiSecretConfigured, false);
assert.equal(missing.agentName, "livekit-labos-agent");

await assert.rejects(
  () => createLiveKitSession({}, {}),
  /LiveKit is not configured/,
);

const env = {
  LIVEKIT_URL: "wss://labos.example.livekit.cloud",
  LIVEKIT_API_KEY: "api-key",
  LIVEKIT_API_SECRET: "api-secret",
  LIVEKIT_AGENT_NAME: "labos-test-agent",
  LIVEKIT_TOKEN_TTL_SECONDS: "120",
} as NodeJS.ProcessEnv;

const configured = getLiveKitSessionConfig(env);
assert.equal(configured.configured, true);
assert.equal(configured.url, "wss://labos.example.livekit.cloud");
assert.equal(configured.agentName, "labos-test-agent");
assert.equal(configured.tokenTtlSeconds, 120);

const session = await createLiveKitSession({
  roomName: "Kitchen Demo Room",
  identity: "Operator One",
  participantName: "Operator One",
  protocolId: "kitchen-tea-v1",
  dispatchAgent: false,
}, env);

assert.equal(session.provider, "livekit");
assert.equal(session.url, env.LIVEKIT_URL);
assert.equal(session.roomName, "kitchen-demo-room");
assert.equal(session.identity, "operator-one");
assert.equal(session.participantName, "Operator One");
assert.equal(session.agentName, "labos-test-agent");
assert.equal(session.dispatch.attempted, false);
assert.equal(session.dispatch.created, false);
assert.equal(session.expiresInSeconds, 120);

const payload = decodeJwtPayload(session.token);
assert.equal(payload.iss, env.LIVEKIT_API_KEY);
assert.equal(payload.sub, "operator-one");
assert.equal(payload.name, "Operator One");
assert.equal(payload.video.room, "kitchen-demo-room");
assert.equal(payload.video.roomJoin, true);
assert.equal(payload.video.canPublish, true);
assert.equal(payload.video.canSubscribe, true);
assert.equal(payload.video.canPublishData, true);
assert.equal(JSON.parse(payload.metadata).protocolId, "kitchen-tea-v1");

console.log("[live-coach-livekit-session] all checks passed");
