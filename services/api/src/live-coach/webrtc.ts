export type WebRtcProviderId =
  | "browser-loopback"
  | "custom-sdp"
  | "livekit"
  | "pipecat-daily"
  | "fishjam";

export type WebRtcExperimentMode = "off" | "loopback" | "probe" | "gateway";

export interface WebRtcIceServerConfig {
  urls: string[];
  username?: string;
  credential?: string;
}

export interface WebRtcBandwidthEstimate {
  websocketPcmKbps: number;
  websocketJsonBase64Kbps: number;
  webRtcOpusTargetKbps: number;
  expectedReduction: string;
}

export interface WebRtcProviderOption {
  id: WebRtcProviderId;
  label: string;
  category: "local" | "custom" | "managed-gateway";
  transport: "browser-loopback" | "sdp-http" | "provider-sdk-gateway";
  configured: boolean;
  signalingReady: boolean;
  signalingUrl: string | null;
  roomTokenReady?: boolean;
  docsUrl: string;
  envVars: string[];
  strengths: string[];
  limitations: string[];
}

export interface WebRtcExperimentConfig {
  enabled: boolean;
  mode: WebRtcExperimentMode;
  activeProvider: WebRtcProviderId;
  providers: WebRtcProviderOption[];
  transportReady: boolean;
  signalingReady: boolean;
  signalingUrl: string | null;
  iceServers: WebRtcIceServerConfig[];
  audioBitrateBps: number;
  videoBitrateBps: number;
  estimates: WebRtcBandwidthEstimate;
  notes: string[];
}

export interface WebRtcMetricSample {
  timestamp: string;
  providerId?: WebRtcProviderId | string;
  sessionId?: string;
  state?: string;
  iceState?: string;
  bytesSent?: number;
  bytesReceived?: number;
  bitrateSentKbps?: number;
  bitrateReceivedKbps?: number;
  packetsLost?: number;
  jitterMs?: number;
  rttMs?: number;
  roomName?: string;
  participants?: number;
  publishedTracks?: number;
  subscribedTracks?: number;
  localCandidateType?: string;
  remoteCandidateType?: string;
  message?: string;
}

const MAX_METRICS = 240;
const metrics: WebRtcMetricSample[] = [];

function parseBool(value: string | undefined) {
  return value === "true" || value === "1" || value === "yes";
}

function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback;
}

function parseCsv(value: string | undefined): string[] {
  return (value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildIceServers(env: NodeJS.ProcessEnv): WebRtcIceServerConfig[] {
  const stunUrls = parseCsv(env.LABOS_WEBRTC_STUN_URLS || "stun:stun.l.google.com:19302");
  const turnUrls = parseCsv(env.LABOS_WEBRTC_TURN_URLS);
  const servers: WebRtcIceServerConfig[] = [];
  if (stunUrls.length) servers.push({ urls: stunUrls });
  if (turnUrls.length) {
    servers.push({
      urls: turnUrls,
      username: env.LABOS_WEBRTC_TURN_USERNAME,
      credential: env.LABOS_WEBRTC_TURN_CREDENTIAL,
    });
  }
  return servers;
}

function providerUrl(env: NodeJS.ProcessEnv, id: WebRtcProviderId): string | null {
  switch (id) {
    case "custom-sdp":
      return env.LABOS_WEBRTC_SIGNALING_URL?.trim() || null;
    case "livekit":
      return env.LABOS_WEBRTC_LIVEKIT_SIGNALING_URL?.trim() || env.LIVEKIT_URL?.trim() || null;
    case "pipecat-daily":
      return env.LABOS_WEBRTC_PIPECAT_SIGNALING_URL?.trim() || null;
    case "fishjam":
      return env.LABOS_WEBRTC_FISHJAM_SIGNALING_URL?.trim() || null;
    case "browser-loopback":
      return null;
  }
}

function providerCatalog(env: NodeJS.ProcessEnv): WebRtcProviderOption[] {
  const option = (
    id: WebRtcProviderId,
    label: string,
    category: WebRtcProviderOption["category"],
    transport: WebRtcProviderOption["transport"],
    docsUrl: string,
    envVars: string[],
    strengths: string[],
    limitations: string[],
  ): WebRtcProviderOption => {
    const signalingUrl = providerUrl(env, id);
    const liveKitRoomTokenReady = id === "livekit"
      && Boolean(env.LIVEKIT_URL?.trim() && env.LIVEKIT_API_KEY?.trim() && env.LIVEKIT_API_SECRET?.trim());
    const configured = id === "browser-loopback" || Boolean(signalingUrl) || liveKitRoomTokenReady;
    return {
      id,
      label,
      category,
      transport,
      configured,
      signalingReady: id === "livekit" ? liveKitRoomTokenReady : Boolean(signalingUrl),
      signalingUrl,
      roomTokenReady: liveKitRoomTokenReady || undefined,
      docsUrl,
      envVars,
      strengths,
      limitations,
    };
  };

  return [
    option(
      "browser-loopback",
      "Browser WebRTC Loopback",
      "local",
      "browser-loopback",
      "https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API",
      ["LABOS_EXPERIMENTAL_WEBRTC_ENABLED", "LABOS_WEBRTC_PROVIDER=browser-loopback"],
      ["Zero external infrastructure", "Exercises real browser capture, SDP, ICE, RTP, and stats", "Best default regression probe"],
      ["Does not reach Gemini or a remote agent", "Network path is local-only"],
    ),
    option(
      "custom-sdp",
      "Custom SDP Gateway",
      "custom",
      "sdp-http",
      "https://ai.google.dev/gemini-api/docs/live",
      ["LABOS_WEBRTC_PROVIDER=custom-sdp", "LABOS_WEBRTC_SIGNALING_URL"],
      ["Smallest adapter surface", "Works with any bridge that accepts offer JSON and returns answer JSON"],
      ["You own media forwarding, auth, autoscaling, and observability"],
    ),
    option(
      "livekit",
      "LiveKit Agents + Gemini",
      "managed-gateway",
      "provider-sdk-gateway",
      "https://docs.livekit.io/agents/models/realtime/plugins/gemini/",
      ["LABOS_WEBRTC_PROVIDER=livekit", "LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET", "LIVEKIT_AGENT_NAME"],
      ["Production-grade SFU", "Agent framework has Gemini Live plugin", "Good path for multi-user rooms and observability"],
      ["Requires a LiveKit agent service to be running locally or deployed", "Server returns short-lived room tokens; credentials must never be exposed to the browser"],
    ),
    option(
      "pipecat-daily",
      "Pipecat Cloud / Daily WebRTC",
      "managed-gateway",
      "provider-sdk-gateway",
      "https://docs.pipecat.ai/guides/features/gemini-live",
      ["LABOS_WEBRTC_PROVIDER=pipecat-daily", "LABOS_WEBRTC_PIPECAT_SIGNALING_URL"],
      ["Purpose-built voice-agent pipeline", "Daily WebRTC transport supports web/mobile", "Strong option for Gemini Live voice + vision agents"],
      ["Requires Pipecat/Daily agent deployment and room/token adapter"],
    ),
    option(
      "fishjam",
      "Fishjam Gemini Bridge",
      "managed-gateway",
      "provider-sdk-gateway",
      "https://docs.fishjam.io/tutorials/gemini-live-integration",
      ["LABOS_WEBRTC_PROVIDER=fishjam", "LABOS_WEBRTC_FISHJAM_SIGNALING_URL"],
      ["Media-server architecture", "Documented Gemini bridge pattern", "Useful for room-based multimedia experiments"],
      ["Requires Fishjam backend credentials and an agent bridge"],
    ),
  ];
}

function estimateBandwidth(audioBitrateBps: number): WebRtcBandwidthEstimate {
  const websocketPcmKbps = Math.round((16000 * 16) / 1000);
  const websocketJsonBase64Kbps = Math.round(websocketPcmKbps * 1.38);
  const webRtcOpusTargetKbps = Math.round(audioBitrateBps / 1000);
  const ratio = websocketJsonBase64Kbps / Math.max(1, webRtcOpusTargetKbps);
  return {
    websocketPcmKbps,
    websocketJsonBase64Kbps,
    webRtcOpusTargetKbps,
    expectedReduction: `${ratio.toFixed(1)}x lower uplink audio payload before RTP/ICE overhead`,
  };
}

export function getWebRtcExperimentConfig(env: NodeJS.ProcessEnv = process.env): WebRtcExperimentConfig {
  const enabled = parseBool(env.LABOS_EXPERIMENTAL_WEBRTC_ENABLED);
  const providers = providerCatalog(env);
  const requestedProvider = env.LABOS_WEBRTC_PROVIDER?.trim() as WebRtcProviderId | undefined;
  const fallbackProvider: WebRtcProviderId = env.LIVEKIT_URL?.trim() && env.LIVEKIT_API_KEY?.trim() && env.LIVEKIT_API_SECRET?.trim()
    ? "livekit"
    : env.LABOS_WEBRTC_SIGNALING_URL?.trim()
    ? "custom-sdp"
    : "browser-loopback";
  const activeProvider = providers.some((provider) => provider.id === requestedProvider)
    ? requestedProvider!
    : fallbackProvider;
  const active = providers.find((provider) => provider.id === activeProvider) || providers[0];
  const signalingUrl = active.signalingUrl;
  const audioBitrateBps = parsePositiveInt(env.LABOS_WEBRTC_AUDIO_BITRATE_BPS, 32_000);
  const videoBitrateBps = parsePositiveInt(env.LABOS_WEBRTC_VIDEO_BITRATE_BPS, 600_000);
  const mode: WebRtcExperimentMode = !enabled
    ? "off"
    : activeProvider === "browser-loopback"
    ? "loopback"
    : active.signalingReady
    ? "gateway"
    : "probe";
  return {
    enabled,
    mode,
    activeProvider,
    providers,
    transportReady: enabled && (activeProvider === "browser-loopback" || active.signalingReady),
    signalingReady: enabled && active.signalingReady,
    signalingUrl,
    iceServers: enabled ? buildIceServers(env) : [],
    audioBitrateBps,
    videoBitrateBps,
    estimates: estimateBandwidth(audioBitrateBps),
    notes: [
      "Gemini Live direct browser access is still WebSocket-based; WebRTC requires a gateway such as LiveKit, Pipecat/Daily, Fishjam, or a custom bridge.",
      "This experimental path is isolated from the production WebSocket transport and can be used to compare media stats without destabilizing the demo.",
      "The browser-loopback provider is the default local end-to-end WebRTC regression probe when no gateway is configured.",
    ],
  };
}

export function getWebRtcProvider(env: NodeJS.ProcessEnv = process.env, providerId?: string): WebRtcProviderOption | null {
  const config = getWebRtcExperimentConfig(env);
  return config.providers.find((provider) => provider.id === (providerId || config.activeProvider)) || null;
}

export function getWebRtcMetrics() {
  return {
    samples: [...metrics],
    latest: metrics[metrics.length - 1] || null,
  };
}

export function recordWebRtcMetric(sample: WebRtcMetricSample) {
  metrics.push({
    ...sample,
    timestamp: sample.timestamp || new Date().toISOString(),
  });
  while (metrics.length > MAX_METRICS) metrics.shift();
  return getWebRtcMetrics();
}

export function clearWebRtcMetrics() {
  metrics.length = 0;
  return getWebRtcMetrics();
}
