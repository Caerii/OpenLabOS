import { request } from "./core";
import { postJson } from "./core";
import { glassesLiveCoachWsUrlForLocation } from "./liveCoachUrls";
export { glassesLiveCoachWsUrlForLocation } from "./liveCoachUrls";

export interface LiveCoachHealth {
  ok: boolean;
  status?: unknown;
  configured: boolean;
  model: string;
  audioRoute: string;
  effectiveAudioRoute?: string;
  apiVersion?: string;
  languageCode?: string;
  authMode?: string;
  voiceName?: string | null;
  apiKeyEnv?: string;
  project?: string;
  location?: string;
  glassesAudio?: GlassesLiveCoachAudioStatus | null;
  webRtc?: LiveCoachWebRtcConfig;
  speakerPolicy?: LiveCoachSpeakerPolicy;
  recordingsEnabled?: boolean;
  recordingsDir?: string;
  activeProtocol?: LiveCoachProtocolContext | null;
  activeRecordingId?: string | null;
  activeRecordingHasOutputAudio?: boolean;
  activeRecordingStats?: {
    inputBytes: number;
    outputBytes: number;
    inputDurationSec: number;
    outputDurationSec: number;
    eventCount: number;
    lastInputAudioAt?: string;
    lastOutputAudioAt?: string;
    lastTurnCompleteAt?: string;
  } | null;
  liveVideo?: {
    framesSent: number;
    bytesSent: number;
    lastVideoAt: string | null;
    lastError: string | null;
    width?: number | null;
    height?: number | null;
    averageFps?: number;
  };
  runtimeContext?: LiveCoachRuntimeContext;
  output: string;
}

export const liveCoachHealth = () => request<LiveCoachHealth>("/api/live-coach/health");

export interface LiveCoachProtocolStepBrief {
  number: number;
  instruction: string;
  successCriteria: string;
  requiredObjects: string[];
  hazardChecks: string[];
}

export interface LiveCoachProtocolContext {
  id: string;
  name: string;
  description: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  estimatedMinutes: number;
  stepCount: number;
  tags: string[];
  inventory: string[];
  firstStep: LiveCoachProtocolStepBrief | null;
  steps: LiveCoachProtocolStepBrief[];
}

export interface LiveCoachRuntimeContext {
  now: string;
  elapsedSec: number;
  status: unknown;
  activeProtocol: LiveCoachProtocolContext | null;
  video: NonNullable<LiveCoachHealth["liveVideo"]>;
  transport: {
    audioRoute: string;
    lastInputAt: string | null;
    lastModelOutputAt: string | null;
    approximateResponseLatencyMs: number | null;
  };
  speaker: LiveCoachSpeakerPolicy;
}

export interface LiveCoachSpeakerPolicy {
  primarySpeaker: "glasses-wearer";
  mode: "glasses-mic-primary" | "push-to-talk";
  wakePhrases: string[];
  backgroundSpeechPolicy: string;
  diarizationProvider: "none" | "external";
}

export const liveCoachProtocol = () =>
  request<{ activeProtocol: LiveCoachProtocolContext | null; runtimeContext: LiveCoachRuntimeContext }>("/api/live-coach/protocol");

export const liveCoachSwitchProtocol = (protocolId: string, announce = true) =>
  postJson<{ success: boolean; activeProtocol: LiveCoachProtocolContext; runtimeContext: LiveCoachRuntimeContext }>(
    "/api/live-coach/protocol",
    { protocolId, announce },
  );

export const liveCoachSpeakerPolicy = () =>
  request<{ speakerPolicy: LiveCoachSpeakerPolicy }>("/api/live-coach/speaker-policy");

export const liveCoachSetSpeakerPolicy = (body: Partial<LiveCoachSpeakerPolicy>) =>
  postJson<{ success: boolean; speakerPolicy: LiveCoachSpeakerPolicy }>("/api/live-coach/speaker-policy", body);

export interface LiveCoachVoiceOption {
  name: string;
  style: string;
  character: string;
  isDefault?: boolean;
  sampleCached?: boolean;
  sampleUrl?: string;
}

export interface LiveCoachVoicesResponse {
  activeVoiceName: string | null;
  voices: LiveCoachVoiceOption[];
}

export const liveCoachVoices = () =>
  request<LiveCoachVoicesResponse>("/api/live-coach/voices");

export const liveCoachSetVoice = (voiceName: string | null) =>
  postJson<{ success: boolean; activeVoiceName: string | null; config: unknown }>(
    "/api/live-coach/voice",
    { voiceName },
  );

export async function liveCoachFetchVoiceSample(voiceName: string, sampleUrl?: string): Promise<Blob> {
  const path = sampleUrl || `/api/live-coach/voices/${encodeURIComponent(voiceName)}/sample`;
  const res = await fetch(path);
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const data = await res.json();
      message = data.error || message;
    } catch {
      // Keep the HTTP status fallback for non-JSON errors.
    }
    throw new Error(message);
  }
  return res.blob();
}

export interface GlassesLiveCoachAudioStatus {
  success?: boolean;
  running: boolean;
  connected: boolean;
  wsUrl: string;
  sampleRate: number;
  outputSampleRate: number;
  playbackEnabled: boolean;
  startedAt: number;
  lastAudioAt: number;
  chunksSent: number;
  bytesSent: number;
  audioBytesPlayed: number;
  lastError: string;
}

export function defaultGlassesLiveCoachWsUrl() {
  return glassesLiveCoachWsUrlForLocation(window.location);
}

export const liveCoachGlassesAudioStart = (opts?: { wsUrl?: string; playback?: boolean }) =>
  postJson<GlassesLiveCoachAudioStatus>("/api/live-coach/glasses-audio/start", {
    wsUrl: opts?.wsUrl || defaultGlassesLiveCoachWsUrl(),
    playback: opts?.playback !== false,
  });

export const liveCoachGlassesAudioStop = () =>
  postJson<GlassesLiveCoachAudioStatus>("/api/live-coach/glasses-audio/stop", {});

export const liveCoachGlassesAudioStatus = () =>
  request<GlassesLiveCoachAudioStatus>("/api/live-coach/glasses-audio/status");

export type LiveCoachWebRtcProviderId =
  | "browser-loopback"
  | "custom-sdp"
  | "livekit"
  | "pipecat-daily"
  | "fishjam";

export type LiveCoachWebRtcMode = "off" | "loopback" | "probe" | "gateway";

export interface LiveCoachWebRtcProvider {
  id: LiveCoachWebRtcProviderId;
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

export interface LiveCoachWebRtcConfig {
  enabled: boolean;
  mode: LiveCoachWebRtcMode;
  activeProvider: LiveCoachWebRtcProviderId;
  providers: LiveCoachWebRtcProvider[];
  transportReady: boolean;
  signalingReady: boolean;
  signalingUrl: string | null;
  iceServers: RTCIceServer[];
  audioBitrateBps: number;
  videoBitrateBps: number;
  estimates: {
    websocketPcmKbps: number;
    websocketJsonBase64Kbps: number;
    webRtcOpusTargetKbps: number;
    expectedReduction: string;
  };
  notes: string[];
}

export interface LiveCoachWebRtcMetricSample {
  timestamp?: string;
  providerId?: LiveCoachWebRtcProviderId | string;
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

export interface LiveCoachWebRtcMetrics {
  samples: LiveCoachWebRtcMetricSample[];
  latest: LiveCoachWebRtcMetricSample | null;
}

export const liveCoachWebRtcConfig = () =>
  request<LiveCoachWebRtcConfig>("/api/live-coach/webrtc/config");

export const liveCoachWebRtcMetrics = () =>
  request<LiveCoachWebRtcMetrics>("/api/live-coach/webrtc/metrics");

export const liveCoachWebRtcRecordMetric = (sample: LiveCoachWebRtcMetricSample) =>
  postJson<LiveCoachWebRtcMetrics>("/api/live-coach/webrtc/metrics", sample);

export const liveCoachWebRtcSignal = (body: unknown) =>
  postJson<{ answer?: RTCSessionDescriptionInit; [key: string]: unknown }>("/api/live-coach/webrtc/signal", body);

export interface LiveCoachLiveKitStatus {
  configured: boolean;
  url: string | null;
  apiKeyConfigured: boolean;
  apiSecretConfigured: boolean;
  agentName: string;
  tokenTtlSeconds: number;
}

export interface LiveCoachLiveKitSession {
  provider: "livekit";
  url: string;
  token: string;
  roomName: string;
  identity: string;
  participantName: string;
  expiresInSeconds: number;
  agentName: string;
  dispatch: {
    attempted: boolean;
    created: boolean;
    id?: string;
    room?: string;
    agentName?: string;
    metadata?: string;
    error?: string;
  };
}

export const liveCoachWebRtcLiveKitStatus = () =>
  request<LiveCoachLiveKitStatus>("/api/live-coach/webrtc/livekit/status");

export const liveCoachWebRtcLiveKitSession = (body?: {
  roomName?: string;
  identity?: string;
  participantName?: string;
  protocolId?: string;
  dispatchAgent?: boolean;
  allowDispatchFailure?: boolean;
}) => postJson<LiveCoachLiveKitSession>("/api/live-coach/webrtc/livekit/session", body || {});
