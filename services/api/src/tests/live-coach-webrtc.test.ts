import assert from "node:assert/strict";
import {
  clearWebRtcMetrics,
  getWebRtcExperimentConfig,
  getWebRtcMetrics,
  recordWebRtcMetric,
} from "../live-coach/webrtc.js";

const off = getWebRtcExperimentConfig({});
assert.equal(off.enabled, false);
assert.equal(off.mode, "off");
assert.equal(off.transportReady, false);
assert.equal(off.signalingReady, false);
assert.equal(off.iceServers.length, 0);

const probe = getWebRtcExperimentConfig({
  LABOS_EXPERIMENTAL_WEBRTC_ENABLED: "true",
  LABOS_WEBRTC_AUDIO_BITRATE_BPS: "24000",
});
assert.equal(probe.enabled, true);
assert.equal(probe.mode, "loopback");
assert.equal(probe.activeProvider, "browser-loopback");
assert.equal(probe.transportReady, true);
assert.equal(probe.signalingReady, false);
assert.equal(probe.providers.some((provider) => provider.id === "livekit"), true);
assert.equal(probe.providers.some((provider) => provider.id === "pipecat-daily"), true);
assert.equal(probe.providers.some((provider) => provider.id === "fishjam"), true);
assert.equal(probe.estimates.webRtcOpusTargetKbps, 24);
assert.ok(probe.estimates.websocketJsonBase64Kbps > probe.estimates.webRtcOpusTargetKbps);
assert.match(probe.estimates.expectedReduction, /lower uplink/i);

const gateway = getWebRtcExperimentConfig({
  LABOS_EXPERIMENTAL_WEBRTC_ENABLED: "true",
  LABOS_WEBRTC_SIGNALING_URL: "https://webrtc.example/signal",
  LABOS_WEBRTC_STUN_URLS: "stun:a.example, stun:b.example",
});
assert.equal(gateway.mode, "gateway");
assert.equal(gateway.activeProvider, "custom-sdp");
assert.equal(gateway.transportReady, true);
assert.equal(gateway.signalingReady, true);
assert.deepEqual(gateway.iceServers[0].urls, ["stun:a.example", "stun:b.example"]);

const livekit = getWebRtcExperimentConfig({
  LABOS_EXPERIMENTAL_WEBRTC_ENABLED: "true",
  LABOS_WEBRTC_PROVIDER: "livekit",
  LIVEKIT_URL: "wss://livekit.example",
  LIVEKIT_API_KEY: "api-key",
  LIVEKIT_API_SECRET: "api-secret",
});
assert.equal(livekit.mode, "gateway");
assert.equal(livekit.activeProvider, "livekit");
assert.equal(livekit.signalingUrl, "wss://livekit.example");
assert.equal(livekit.providers.find((provider) => provider.id === "livekit")?.roomTokenReady, true);

clearWebRtcMetrics();
recordWebRtcMetric({
  timestamp: "2026-04-27T00:00:00.000Z",
  providerId: "browser-loopback",
  sessionId: "test-session",
  bitrateSentKbps: 31,
});
assert.equal(getWebRtcMetrics().latest?.sessionId, "test-session");
assert.equal(getWebRtcMetrics().latest?.bitrateSentKbps, 31);

console.log("[live-coach-webrtc] all checks passed");
