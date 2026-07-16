import type { LiveCoachWebRtcConfig } from "../../../api";

export type CoachStatus =
  | { state: "idle"; configured?: boolean; model?: string; audioRoute?: string }
  | { state: "connecting" }
  | { state: "connected"; model: string; audioRoute?: string }
  | { state: "error"; message: string };

export type CoachHealth = {
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
  webRtc?: LiveCoachWebRtcConfig;
  output: string;
  recordingsEnabled?: boolean;
  recordingsDir?: string;
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
};

export type CoachScenario = {
  id: string;
  title: string;
  category: string;
  prompt: string;
  protocolId?: string;
  stepNumber?: number;
  trigger?: string;
  mood?: string;
  script?: string;
  recordingId?: string;
  outputUrl?: string;
};

export type CoachRecording = {
  id: string;
  startedAt: string;
  endedAt?: string;
  title?: string;
  scenarioId?: string;
  model: string;
  eventCount: number;
  inputWav?: string;
  outputWav?: string;
  inputBytes?: number;
  outputBytes?: number;
  inputDurationSec?: number;
  outputDurationSec?: number;
  outputUrl?: string;
  eventsUrl?: string;
  staticBaseUrl?: string;
  protocolId?: string;
  category?: string;
  stepNumber?: number;
};

export type DemoMode = "api" | "static";
export type ScenarioGroup = "primary" | "advanced";

export type ServerMsg =
  | { type: "status"; status: CoachStatus }
  | { type: "clear-audio"; reason?: string }
  | { type: "audio"; data: string; mimeType?: string }
  | { type: "transcript"; transcript: string }
  | { type: "text"; text: string };

export type LiveCoachDataset = {
  demoMode: DemoMode;
  health: CoachHealth;
  status: CoachStatus;
  scenarios: CoachScenario[];
  recordings: CoachRecording[];
};
