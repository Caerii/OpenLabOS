import { normalizeGeminiLiveVoice } from "./voices.js";
import { getGoogleGenAIClientConfig, type GoogleGenAIAuthMode } from "../ai/google-genai-client.js";

export const DEFAULT_GEMINI_LIVE_MODEL = "gemini-2.5-flash-native-audio-latest";
export const DEFAULT_VERTEX_GEMINI_LIVE_MODEL = "gemini-live-2.5-flash-native-audio";
export const DEFAULT_GEMINI_LIVE_API_VERSION = "v1alpha";
export const DEFAULT_VERTEX_GEMINI_LIVE_API_VERSION = "v1";
export const DEFAULT_GEMINI_LIVE_VOICE = "Despina";

export type LiveCoachAudioRoute = "browser" | "glasses-cue";
export type LiveCoachMediaResolution = "low" | "medium" | "high";

export interface LiveCoachConfig {
  model: string;
  configured: boolean;
  authMode: GoogleGenAIAuthMode | "unconfigured";
  apiKeyEnv?: "GOOGLE_GENERATIVE_AI_API_KEY" | "GOOGLE_API_KEY" | "GEMINI_API_KEY";
  project?: string;
  location?: string;
  apiVersion: string;
  audioRoute: LiveCoachAudioRoute;
  languageCode: string;
  voiceName: string | null;
  mediaResolution: LiveCoachMediaResolution;
  videoFrameIntervalMs: number;
  spatialContextEnabled: boolean;
  spatialContextIntervalMs: number;
  recordingsEnabled: boolean;
  recordingsDir: string;
}

function normalizeAudioRoute(value: string | undefined): LiveCoachAudioRoute {
  return value === "glasses-cue" ? "glasses-cue" : "browser";
}

export function normalizeMediaResolution(value: string | undefined): LiveCoachMediaResolution {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "medium" || normalized === "med") return "medium";
  if (normalized === "high" || normalized === "hi") return "high";
  return "low";
}

function positiveInt(value: string | undefined, fallback: number, opts: { min: number; max: number }) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(opts.min, Math.min(opts.max, Math.round(parsed)));
}

function liveModelForAuth(model: string, authMode: LiveCoachConfig["authMode"]): string {
  if (authMode !== "vertex-adc") return model;
  if (model.startsWith("gemini-2.5-flash-native-audio")) {
    return DEFAULT_VERTEX_GEMINI_LIVE_MODEL;
  }
  return model;
}

export function getLiveCoachConfig(env: NodeJS.ProcessEnv = process.env): LiveCoachConfig {
  const requestedModel = env.GEMINI_LIVE_MODEL?.trim() || DEFAULT_GEMINI_LIVE_MODEL;
  const requestedApiVersion = env.GEMINI_LIVE_API_VERSION?.trim();
  const authMode = getGoogleGenAIClientConfig(env).mode;
  const apiVersion = requestedApiVersion
    || (authMode === "vertex-adc" ? DEFAULT_VERTEX_GEMINI_LIVE_API_VERSION : DEFAULT_GEMINI_LIVE_API_VERSION);
  const auth = getGoogleGenAIClientConfig(env, { apiVersion });
  const model = liveModelForAuth(requestedModel, auth.mode);
  const languageCode = env.GEMINI_LIVE_LANGUAGE_CODE?.trim() || "en";
  const voiceName = normalizeGeminiLiveVoice(env.GEMINI_LIVE_VOICE_NAME) || DEFAULT_GEMINI_LIVE_VOICE;
  const mediaResolution = normalizeMediaResolution(env.GEMINI_LIVE_MEDIA_RESOLUTION);
  const videoFrameIntervalMs = positiveInt(env.GEMINI_LIVE_VIDEO_FRAME_INTERVAL_MS, 1000, { min: 250, max: 15000 });
  const spatialContextEnabled = env.GEMINI_LIVE_SPATIAL_CONTEXT_ENABLED !== "false";
  const spatialContextIntervalMs = positiveInt(env.GEMINI_LIVE_SPATIAL_CONTEXT_INTERVAL_MS, 3000, { min: 500, max: 30000 });
  const recordingsEnabled = env.GEMINI_LIVE_RECORDINGS_ENABLED !== "false";
  const recordingsDir = env.GEMINI_LIVE_RECORDINGS_DIR?.trim() || "data/live-coach-recordings";
  return {
    model,
    configured: auth.configured,
    authMode: auth.mode,
    apiKeyEnv: auth.apiKeyEnv,
    project: auth.project,
    location: auth.location,
    apiVersion,
    audioRoute: normalizeAudioRoute(env.GEMINI_LIVE_AUDIO_ROUTE),
    languageCode,
    voiceName,
    mediaResolution,
    videoFrameIntervalMs,
    spatialContextEnabled,
    spatialContextIntervalMs,
    recordingsEnabled,
    recordingsDir,
  };
}
