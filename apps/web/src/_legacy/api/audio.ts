import { postJson } from "./core";

export interface AudioTestResult {
  success: boolean;
  duration: number;
  fileSize: number;
  message: string;
}

export interface VadTestResult {
  success: boolean;
  vadEnabled: boolean;
  micEnabled: boolean;
  message: string;
}

export interface ProtocolStepAudioResult {
  success: boolean;
  mode: "wifi" | "adb-forward";
  skipped?: boolean;
  reason?: string;
  clip: {
    protocolId: string;
    stepNumber: number;
    scenarioId: string;
    recordingId: string;
    outputUrl: string;
    devicePath: string;
    bytes: number;
  };
}

export const audioTestTone = () => postJson<{ success: boolean }>("/api/audio/test-tone");
export const audioTestMic = () => postJson<AudioTestResult>("/api/audio/test-mic");
export const audioTestVad = () => postJson<VadTestResult>("/api/audio/test-vad");
export const audioCue = (
  cue: "step_start" | "verify_success" | "verify_fail" | "run_complete" | "run_abort",
) => postJson<{ success: boolean }>("/api/audio/cue", { cue });
export const playProtocolStepAudio = (
  protocolId: string,
  stepNumber: number,
  instruction: string,
  opts: { playbackKey?: string; force?: boolean } = {},
) => postJson<ProtocolStepAudioResult>("/api/audio/protocol-step", {
  protocolId,
  stepNumber,
  instruction,
  playbackKey: opts.playbackKey,
  force: opts.force === true,
});
