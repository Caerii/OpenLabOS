import { postJson, request, withQuery } from "./core";
import { updateSettings, type LabOsSettingsData } from "./settings";

export interface PreviewHealth {
  ok: boolean;
  fps: number;
  deviceFps?: number;
  observedFps?: number;
  bufferApproxFps?: number;
  fpsSource?: "idle" | "frame-delta" | "stream-buffer" | "device";
  frameCount: number;
  streaming: boolean;
  frameReachable?: boolean;
  frameBytes?: number;
  previewReady?: boolean;
  previewStatus?: "ready" | "server_unreachable" | "not_streaming" | "waiting_for_frames" | "frame_unreachable";
  previewDetail?: string;
  previewServerReachable?: boolean;
  previewHealthError?: string;
  previewFrameError?: string;
  streamFrameAgeMs?: number;
  recording?: boolean;
  activeVideoPath?: string;
  lastVideoPath?: string;
}

export interface NativeRecordingState {
  active: boolean;
  startedAt: string | null;
  stoppedAt: string | null;
  lastCommand: "start" | "stop" | "toggle" | null;
  lastMode: "explicit" | "fallback-toggle" | null;
  lastOutput: string;
  activeVideoPath: string;
  lastVideoPath: string;
}

export interface StreamConfig {
  stream_width: number;
  stream_height: number;
  stream_jpeg_quality: number;
  stream_fps: number;
}

export interface CameraCapabilities {
  iso_min?: number;
  iso_max?: number;
  exposure_ns_min?: number;
  exposure_ns_max?: number;
  shutter_speed_fastest?: string;
  shutter_speed_slowest_ms?: number;
  ae_comp_min?: number;
  ae_comp_max?: number;
  ae_comp_step?: number;
  awb_modes?: string[];
  af_modes?: string[];
  ae_modes?: string[];
  fps_ranges?: string[];
  focus_distance_max_diopters?: number;
  manual_mode?: boolean;
  current_exposure_ns?: number;
  current_iso?: number;
  current_ae_comp?: number;
  current_awb_mode?: string;
  current_focus_distance?: number;
}

export interface ManualCameraParams {
  manual_mode?: boolean;
  exposure_ns?: number;
  iso?: number;
  ae_compensation?: number;
  awb_mode?: number;
  focus_distance?: number;
}

export const previewStart = () =>
  postJson<PreviewHealth & { success: boolean; streamUrl: string; recovered?: boolean; attempts?: string[] }>("/api/preview/start");
export const previewStop = () => postJson<{ success: boolean }>("/api/preview/stop");
export const previewHealth = (opts?: { lite?: boolean }) =>
  request<PreviewHealth>(withQuery("/api/preview/health", opts?.lite ? { lite: 1 } : undefined));

export const previewClientTrace = (body: { clientDisplayMs: number; glassToGlassMs?: number }) =>
  postJson<{ ok: boolean }>("/api/preview/client-trace", body);
export const previewRecordingStart = (opts?: { protocolId?: string }) =>
  postJson<{ success: boolean; state: NativeRecordingState; mode?: string }>("/api/preview/recording/start", opts);
export const previewRecordingStop = (opts?: { reason?: string }) =>
  postJson<{ success: boolean; state: NativeRecordingState; mode?: string }>("/api/preview/recording/stop", opts);
export const previewRecordingStatus = () =>
  request<{ ok: boolean; state: NativeRecordingState; health: PreviewHealth }>("/api/preview/recording/status");

export const updateStreamConfig = (config: Partial<StreamConfig>) =>
  updateSettings(config as Partial<LabOsSettingsData>);

export const getCameraCapabilities = () =>
  request<CameraCapabilities>("/api/preview/capabilities");
export const setManualCameraParams = (params: ManualCameraParams) =>
  postJson<{ success: boolean; applied: ManualCameraParams }>("/api/preview/manual", params);
