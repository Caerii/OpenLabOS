import http from "node:http";
import { adb, adbShell } from "../adb.js";
import { updateLabosSettings } from "../lib/labos-settings.js";
import {
  getRecentStreamJpegIfFresh,
  getStreamFrameAgeMs,
  normalizePreviewConfig,
  parsePreviewProtocolConfig,
  previewDiagnostic,
  previewFpsEstimator,
  previewPortForwardPresent,
  previewReadyFromSignals,
  type PreviewDiagnostic,
  type PreviewDiagnosticInput,
  type PreviewDiagnosticStatus,
  type PreviewProtocolConfig,
} from "@openlabos/preview";
import { previewFrameBuffer } from "./rolling-frame-buffer.js";
import { recordHostFrameFetchRtt, recordHostHealthRtt } from "./preview-pipeline-recorder.js";
import { getPreviewProtocolConfig } from "./preview-protocol-config.js";
import { applyRecordStreamProfile } from "./record-stream-profile.js";

export const PREVIEW_PORT = 8089;
export const LOCAL_PREVIEW_HOST = "127.0.0.1";
const CAMERA_PKG = "com.openlab.labos.camera";
const CAMERA_RECEIVER = `${CAMERA_PKG}/.CameraCommandReceiver`;
const CAMERA_CAPABILITIES_PATH = "/sdcard/LabOS/.camera_caps.json";

export const HEALTH_FALLBACK = {
  ok: false,
  fps: 0,
  frameCount: 0,
  streaming: false,
  frameReachable: false,
  recording: false,
  activeVideoPath: "",
  lastVideoPath: "",
};

export type PreviewHealthSnapshot = typeof HEALTH_FALLBACK & Record<string, unknown>;

export type { PreviewDiagnostic, PreviewDiagnosticInput, PreviewDiagnosticStatus, PreviewProtocolConfig };

export {
  previewDiagnostic,
  previewPortForwardPresent,
  previewReadyFromSignals,
};

interface PreviewHealthProbe {
  health: PreviewHealthSnapshot;
  healthReachable: boolean;
  healthError: string;
}

interface PreviewFrameProbe {
  frameReachable: boolean;
  frameBytes: number;
  frameError: string;
}

interface PreviewProbeSnapshot extends PreviewDiagnostic {
  health: PreviewHealthSnapshot;
  healthReachable: boolean;
  healthError: string;
  frameReachable: boolean;
  frameBytes: number;
  frameError: string;
}

export interface PreviewBootResult {
  ready: boolean;
  recovered: boolean;
  attempts: string[];
  previewStatus: PreviewDiagnosticStatus;
  previewDetail: string;
  frameReachable: boolean;
  frameBytes: number;
  health: Record<string, unknown>;
}

export type NativeRecordingState = {
  active: boolean;
  startedAt: string | null;
  stoppedAt: string | null;
  lastCommand: "start" | "stop" | "toggle" | null;
  lastMode: "explicit" | "fallback-toggle" | null;
  lastOutput: string;
  activeVideoPath: string;
  lastVideoPath: string;
};

export const CAMERA_ACTIONS = {
  START_PREVIEW: `${CAMERA_PKG}.ACTION_START_PREVIEW`,
  STOP_PREVIEW: `${CAMERA_PKG}.ACTION_STOP_PREVIEW`,
  TAKE_PHOTO: `${CAMERA_PKG}.ACTION_TAKE_PHOTO`,
  TOGGLE_VIDEO: `${CAMERA_PKG}.ACTION_TOGGLE_VIDEO`,
  START_VIDEO: `${CAMERA_PKG}.ACTION_START_VIDEO`,
  STOP_VIDEO: `${CAMERA_PKG}.ACTION_STOP_VIDEO`,
  GET_CAPABILITIES: `${CAMERA_PKG}.ACTION_GET_CAPABILITIES`,
  SET_MANUAL_PARAMS: `${CAMERA_PKG}.ACTION_SET_MANUAL_PARAMS`,
} as const;

const MANUAL_PARAM_FLAGS = [
  { key: "manual_mode", flag: "--ez" },
  { key: "exposure_ns", flag: "--el" },
  { key: "iso", flag: "--ei" },
  { key: "ae_compensation", flag: "--ei" },
  { key: "awb_mode", flag: "--ei" },
  { key: "focus_distance", flag: "--ef" },
] as const;

const nativeRecordingState: NativeRecordingState = {
  active: false,
  startedAt: null,
  stoppedAt: null,
  lastCommand: null,
  lastMode: null,
  lastOutput: "",
  activeVideoPath: "",
  lastVideoPath: "",
};

let portForwarded = false;
let portForwardValidatedAt = 0;
const PORT_FORWARD_REVALIDATE_MS = 30_000;
let kitchenCameraWarmup: Promise<void> | null = null;
let powerProfileApplyKey = "";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error || "unknown error");
}

function envBool(name: string, defaultValue: boolean) {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") return defaultValue;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function envInt(name: string, defaultValue: number, min: number, max: number) {
  const parsed = Number.parseInt(process.env[name] || "", 10);
  if (!Number.isFinite(parsed)) return defaultValue;
  return Math.max(min, Math.min(max, parsed));
}

export function kitchenCameraPowerProfileSettings() {
  const useRecordStream = process.env.LABOS_KITCHEN_USE_RECORD_STREAM_PROFILE !== "0";
  const defaults = useRecordStream
    ? {
        video_width: 1280,
        video_height: 720,
        video_fps: 15,
        video_bitrate: 3_000_000,
        stream_width: 1280,
        stream_height: 720,
        stream_jpeg_quality: 45,
        stream_fps: 24,
        camera_keep_alive_ms: 60_000,
      }
    : {
        video_width: 1280,
        video_height: 720,
        video_fps: 15,
        video_bitrate: 4_000_000,
        stream_width: 480,
        stream_height: 360,
        stream_jpeg_quality: 45,
        stream_fps: 6,
        camera_keep_alive_ms: 5_000,
      };
  return {
    video_width: envInt("LABOS_KITCHEN_VIDEO_WIDTH", defaults.video_width, 320, 3840),
    video_height: envInt("LABOS_KITCHEN_VIDEO_HEIGHT", defaults.video_height, 240, 2160),
    video_fps: envInt("LABOS_KITCHEN_VIDEO_FPS", defaults.video_fps, 1, 60),
    video_bitrate: envInt("LABOS_KITCHEN_VIDEO_BITRATE", defaults.video_bitrate, 1_000_000, 50_000_000),
    stream_width: envInt("LABOS_KITCHEN_STREAM_WIDTH", defaults.stream_width, 240, 1280),
    stream_height: envInt("LABOS_KITCHEN_STREAM_HEIGHT", defaults.stream_height, 180, 720),
    stream_jpeg_quality: envInt("LABOS_KITCHEN_STREAM_JPEG_QUALITY", defaults.stream_jpeg_quality, 20, 90),
    stream_fps: envInt("LABOS_KITCHEN_STREAM_FPS", defaults.stream_fps, 1, 30),
    camera_keep_alive_ms: envInt("LABOS_KITCHEN_CAMERA_KEEP_ALIVE_MS", defaults.camera_keep_alive_ms, 1_000, 300_000),
  };
}

async function applyKitchenCameraPowerProfile(reason: "preview" | "recording") {
  if (!envBool("LABOS_KITCHEN_CAMERA_POWER_PROFILE_ENABLED", true)) return;
  const settings = kitchenCameraPowerProfileSettings();
  const key = JSON.stringify(settings);
  if (powerProfileApplyKey === key) return;
  try {
    await updateLabosSettings(settings, 250);
    powerProfileApplyKey = key;
    console.log(`[Preview] Applied kitchen camera power profile for ${reason}: ${key}`);
  } catch (error) {
    console.warn(`[Preview] Could not apply kitchen camera power profile for ${reason}: ${errorMessage(error)}`);
  }
}

function numeric(value: unknown) {
  const n = typeof value === "number" ? value : Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

export function resetPreviewPortForwardCacheForTests() {
  portForwarded = false;
  portForwardValidatedAt = 0;
}

export function parseJsonOrFallback<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function buildManualParamExtras(params: Record<string, unknown>) {
  const extras: string[] = [];
  for (const { key, flag } of MANUAL_PARAM_FLAGS) {
    if (!(key in params)) continue;
    extras.push(`${flag} ${key} ${params[key]}`);
  }
  return extras;
}

export async function ensurePortForward(): Promise<void> {
  if (portForwarded) {
    const now = Date.now();
    if (now - portForwardValidatedAt < PORT_FORWARD_REVALIDATE_MS) return;
    const forwardList = await adb(["forward", "--list"], 5000).catch(() => "");
    if (previewPortForwardPresent(forwardList)) {
      portForwardValidatedAt = now;
      return;
    }
    portForwarded = false;
  }
  try {
    await adb(["forward", `tcp:${PREVIEW_PORT}`, `tcp:${PREVIEW_PORT}`], 5000);
    portForwarded = true;
    portForwardValidatedAt = Date.now();
    console.log(`[Preview] ADB port forward established: tcp:${PREVIEW_PORT}`);
  } catch (error: any) {
    console.error(`[Preview] Port forward failed: ${error.message}`);
    throw error;
  }
}

export function fetchPreviewPath(
  path: string,
  timeoutMs = 2000,
): Promise<{ statusCode: number; body: Buffer; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const proxyReq = http.request(
      {
        hostname: LOCAL_PREVIEW_HOST,
        port: PREVIEW_PORT,
        path,
        method: "GET",
        timeout: timeoutMs,
      },
      (proxyRes) => {
        const chunks: Buffer[] = [];
        proxyRes.on("data", (chunk: Buffer) => chunks.push(chunk));
        proxyRes.on("end", () => {
          resolve({
            statusCode: proxyRes.statusCode || 0,
            body: Buffer.concat(chunks),
            headers: proxyRes.headers,
          });
        });
      },
    );

    proxyReq.on("error", reject);
    proxyReq.on("timeout", () => {
      proxyReq.destroy(new Error(`Preview ${path} timed out`));
    });
    proxyReq.end();
  });
}

export function putPreviewPath(
  path: string,
  body: unknown,
  timeoutMs = 5000,
): Promise<{ statusCode: number; body: Buffer }> {
  const payload = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: LOCAL_PREVIEW_HOST,
        port: PREVIEW_PORT,
        path,
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": String(Buffer.byteLength(payload)),
        },
        timeout: timeoutMs,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => resolve({ statusCode: res.statusCode || 0, body: Buffer.concat(chunks) }));
      },
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error(`Preview PUT ${path} timed out`)));
    req.write(payload);
    req.end();
  });
}

/** Push active protocol config to device and restart capture for encoder path swap. */
export async function applyPreviewProtocolToDevice(
  config: PreviewProtocolConfig,
  opts: { restart?: boolean } = {},
): Promise<{ ok: boolean; statusCode: number }> {
  await ensurePortForward();
  const response = await putPreviewPath("/config", { ...config, instrumentMetrics: true });
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(`Device config PUT HTTP ${response.statusCode}`);
  }
  if (opts.restart !== false) {
    await sendCameraCommand(CAMERA_ACTIONS.STOP_PREVIEW).catch(() => null);
    await sleep(700);
    await sendCameraCommand(CAMERA_ACTIONS.START_PREVIEW);
    await sleep(1800);
  }
  return { ok: true, statusCode: response.statusCode };
}

export async function fetchDeviceHealth(timeoutMs = 2000) {
  return (await fetchDeviceHealthProbe(timeoutMs)).health;
}

export async function fetchDeviceMetrics(timeoutMs = 2000): Promise<Record<string, unknown> | null> {
  try {
    await ensurePortForward();
    const response = await fetchPreviewPath("/metrics", timeoutMs);
    if (response.statusCode !== 200) return null;
    const parsed = JSON.parse(response.body.toString()) as Record<string, unknown>;
    return parsed;
  } catch {
    return null;
  }
}

async function fetchDeviceHealthProbe(timeoutMs = 2000): Promise<PreviewHealthProbe> {
  const started = Date.now();
  try {
    await ensurePortForward();
    const response = await fetchPreviewPath("/health", timeoutMs);
    recordHostHealthRtt(Date.now() - started);
    if (response.statusCode !== 200) {
      const healthError = `/health HTTP ${response.statusCode}`;
      return {
        health: { ...HEALTH_FALLBACK, previewServerReachable: false, previewHealthError: healthError },
        healthReachable: false,
        healthError,
      };
    }
    const parsed = parseJsonOrFallback(response.body.toString(), HEALTH_FALLBACK);
    return {
      health: { ...HEALTH_FALLBACK, ...parsed, previewServerReachable: true, previewHealthError: "" },
      healthReachable: true,
      healthError: "",
    };
  } catch (error) {
    const healthError = errorMessage(error);
    return {
      health: { ...HEALTH_FALLBACK, previewServerReachable: false, previewHealthError: healthError },
      healthReachable: false,
      healthError,
    };
  }
}

async function waitForRecordingState(expected: boolean, timeoutMs = 1500, intervalMs = 150) {
  const deadline = Date.now() + timeoutMs;
  let latest = await fetchDeviceHealth(Math.min(timeoutMs, 800));
  while (latest.recording !== expected && Date.now() < deadline) {
    await sleep(intervalMs);
    latest = await fetchDeviceHealth(Math.min(intervalMs + 500, 800));
  }
  return latest;
}

export async function probePreviewFrame(timeoutMs = 1500) {
  const probe = await probePreviewFrameWithDiagnostic(timeoutMs);
  return {
    frameReachable: probe.frameReachable,
    frameBytes: probe.frameBytes,
  };
}

function frameProbeFromStreamTap(): PreviewFrameProbe | null {
  const cached = getRecentStreamJpegIfFresh(4500);
  if (!cached || cached.length === 0) return null;
  return {
    frameReachable: true,
    frameBytes: cached.length,
    frameError: "",
  };
}

function frameProbeFromHealthSignals(health: PreviewHealthSnapshot): PreviewFrameProbe | null {
  if (health.streaming !== true || numeric(health.frameCount) <= 0) return null;
  return {
    frameReachable: true,
    frameBytes: numeric(health.frameBytes),
    frameError: "",
  };
}

async function probePreviewFrameWithDiagnostic(timeoutMs = 1500): Promise<PreviewFrameProbe> {
  const cached = frameProbeFromStreamTap();
  if (cached) return cached;

  try {
    const started = Date.now();
    const response = await fetchPreviewPath("/frame", timeoutMs);
    recordHostFrameFetchRtt(Date.now() - started);
    if (response.statusCode !== 200) {
      return {
        frameReachable: false,
        frameBytes: 0,
        frameError: `/frame HTTP ${response.statusCode}`,
      };
    }
    return {
      frameReachable: response.body.length > 0,
      frameBytes: response.body.length,
      frameError: "",
    };
  } catch (error) {
    return { frameReachable: false, frameBytes: 0, frameError: errorMessage(error) };
  }
}

interface PreviewProbeOptions {
  /** When false, trust stream tap / health signals instead of device /frame. */
  requireFrameProbe?: boolean;
}

async function resolveFrameProbe(
  health: PreviewHealthSnapshot,
  options: PreviewProbeOptions = {},
): Promise<PreviewFrameProbe> {
  const cached = frameProbeFromStreamTap();
  if (cached) return cached;

  if (options.requireFrameProbe === false) {
    const inferred = frameProbeFromHealthSignals(health);
    if (inferred) return inferred;
  }

  return probePreviewFrameWithDiagnostic();
}

async function collectPreviewProbeSnapshot(
  options: PreviewProbeOptions = {},
): Promise<PreviewProbeSnapshot> {
  const healthProbe = await fetchDeviceHealthProbe();
  const frameProbe = await resolveFrameProbe(healthProbe.health, options);
  const diagnostic = previewDiagnostic({
    healthReachable: healthProbe.healthReachable,
    streaming: healthProbe.health.streaming,
    frameCount: healthProbe.health.frameCount,
    frameReachable: frameProbe.frameReachable,
    frameBytes: frameProbe.frameBytes,
    healthError: healthProbe.healthError,
    frameError: frameProbe.frameError,
  });
  return {
    ...diagnostic,
    health: healthProbe.health,
    healthReachable: healthProbe.healthReachable,
    healthError: healthProbe.healthError,
    frameReachable: frameProbe.frameReachable,
    frameBytes: frameProbe.frameBytes,
    frameError: frameProbe.frameError,
  };
}

function buildPreviewHealthSnapshot(probe: PreviewProbeSnapshot): PreviewHealthSnapshot {
  const bufferStats = previewFrameBuffer.stats();
  const fpsEstimate = previewFpsEstimator.update(probe.health, {
    bufferApproxFps: bufferStats.approxFps,
  });
  const streamFrameAgeMs = getStreamFrameAgeMs();
  return {
    ...HEALTH_FALLBACK,
    ...probe.health,
    ...fpsEstimate,
    frameReachable: probe.frameReachable,
    frameBytes: probe.frameBytes || numeric(probe.health.frameBytes),
    streamFrameAgeMs,
    previewReady: probe.ready,
    previewStatus: probe.status,
    previewDetail: probe.detail,
    previewServerReachable: probe.healthReachable,
    previewHealthError: probe.healthError,
    previewFrameError: probe.frameError,
    recording: probe.health.recording === true || nativeRecordingState.active,
    activeVideoPath: probe.health.activeVideoPath || nativeRecordingState.activeVideoPath,
    lastVideoPath: probe.health.lastVideoPath || nativeRecordingState.lastVideoPath,
  };
}

export async function previewHealthSnapshot(): Promise<PreviewHealthSnapshot> {
  const probe = await collectPreviewProbeSnapshot();
  return buildPreviewHealthSnapshot(probe);
}

/** Lightweight health for high-frequency UI polls — skips device /frame when stream tap is warm. */
export async function previewHealthSnapshotLite(): Promise<PreviewHealthSnapshot> {
  const probe = await collectPreviewProbeSnapshot({ requireFrameProbe: false });
  return buildPreviewHealthSnapshot(probe);
}

export async function sendCameraBroadcast(action: string, extras: string[] = [], timeoutMs = 10000): Promise<string> {
  const extrasSuffix = extras.length ? ` ${extras.join(" ")}` : "";
  return adbShell(
    `am broadcast --include-stopped-packages -a ${action} -n ${CAMERA_RECEIVER}${extrasSuffix}`,
    timeoutMs,
  );
}

export async function sendCameraCommand(action: string): Promise<string> {
  return sendCameraBroadcast(action);
}

async function waitForPreviewReady(timeoutMs = 4500, intervalMs = 350): Promise<PreviewProbeSnapshot> {
  const deadline = Date.now() + timeoutMs;
  let latest = await collectPreviewProbeSnapshot({ requireFrameProbe: false });
  while (!latest.ready && Date.now() < deadline) {
    await sleep(intervalMs);
    latest = await collectPreviewProbeSnapshot({ requireFrameProbe: false });
  }
  if (latest.ready && !latest.frameReachable) {
    latest = await collectPreviewProbeSnapshot({ requireFrameProbe: true });
  }
  return latest;
}

function bootResult(
  probe: PreviewProbeSnapshot,
  recovered: boolean,
  attempts: string[],
): PreviewBootResult {
  return {
    ready: probe.ready,
    recovered,
    attempts,
    previewStatus: probe.status,
    previewDetail: probe.detail,
    frameReachable: probe.frameReachable,
    frameBytes: probe.frameBytes,
    health: probe.health,
  };
}

export async function bootPreviewStreamOrThrow(): Promise<PreviewBootResult> {
  await ensurePortForward();
  await applyKitchenCameraPowerProfile("preview");
  const attempts: string[] = [];
  const current = await waitForPreviewReady(250, 100);
  if (current.ready) {
    await applyPreviewProtocolToDevice(getPreviewProtocolConfig()).catch((error: unknown) => {
      console.warn(`[Preview] Protocol sync on warm path: ${errorMessage(error)}`);
    });
    return bootResult(current, false, attempts);
  }

  const startOnce = async (phase: "start" | "recover") => {
    const output = await sendCameraCommand(CAMERA_ACTIONS.START_PREVIEW);
    attempts.push(`${phase}: ${output.trim().replace(/\s+/g, " ")}`);
    console.log(`[Preview] ${phase} broadcast result: ${output}`);
    await sleep(700);
    return waitForPreviewReady(4500, 350);
  };

  let afterStart = await startOnce("start");
  if (afterStart.ready) {
    await applyPreviewProtocolToDevice(getPreviewProtocolConfig()).catch((error: unknown) => {
      console.warn(`[Preview] Protocol sync after start: ${errorMessage(error)}`);
    });
    return bootResult(afterStart, false, attempts);
  }

  const staleDetail = afterStart.detail;
  const stopOutput = await sendCameraCommand(CAMERA_ACTIONS.STOP_PREVIEW).catch((error) => `stop failed: ${errorMessage(error)}`);
  attempts.push(`recover-stop: ${String(stopOutput).trim().replace(/\s+/g, " ")}`);
  console.warn(`[Preview] start did not produce frames (${staleDetail}); attempting stop/start recovery`);
  await sleep(900);
  portForwarded = false;
  await ensurePortForward();

  afterStart = await startOnce("recover");
  if (afterStart.ready) {
    await applyPreviewProtocolToDevice(getPreviewProtocolConfig()).catch((error: unknown) => {
      console.warn(`[Preview] Protocol sync after recover: ${errorMessage(error)}`);
    });
    return bootResult(afterStart, true, attempts);
  }

  throw new Error(`Preview start failed after recovery. ${afterStart.detail || staleDetail}`);
}

function updateNativeRecordingState(update: Partial<NativeRecordingState>) {
  Object.assign(nativeRecordingState, update);
}

export function currentNativeRecordingState() {
  return { ...nativeRecordingState };
}

export async function startNativeRecording(protocolId?: string) {
  const profileId = protocolId || process.env.LABOS_RECORD_STREAM_PROFILE || "recordAndStreamSustained";
  await applyRecordStreamProfile(profileId, "native-recording");
  await applyKitchenCameraPowerProfile("recording");
  await bootPreviewStreamOrThrow();
  const before = await fetchDeviceHealth();
  if (before.recording === true || nativeRecordingState.active) {
    updateNativeRecordingState({
      active: true,
      activeVideoPath: before.activeVideoPath || nativeRecordingState.activeVideoPath,
      lastVideoPath: before.lastVideoPath || nativeRecordingState.lastVideoPath,
    });
    return { success: true, alreadyActive: true, mode: nativeRecordingState.lastMode || "explicit", state: nativeRecordingState };
  }

  let output = await sendCameraCommand(CAMERA_ACTIONS.START_VIDEO);
  const explicitHealth = await waitForRecordingState(true, 1500);
  let mode: NativeRecordingState["lastMode"] = "explicit";
  let after = explicitHealth;

  if (explicitHealth.recording !== true) {
    output = await sendCameraCommand(CAMERA_ACTIONS.TOGGLE_VIDEO);
    mode = "fallback-toggle";
    after = await waitForRecordingState(true, 1500);
  }

  updateNativeRecordingState({
    active: after.recording === true || mode === "fallback-toggle",
    startedAt: new Date().toISOString(),
    stoppedAt: null,
    lastCommand: "start",
    lastMode: mode,
    lastOutput: output,
    activeVideoPath: after.activeVideoPath || nativeRecordingState.activeVideoPath,
    lastVideoPath: after.lastVideoPath || nativeRecordingState.lastVideoPath,
  });

  console.log(`[Preview] Native recording start protocol=${protocolId || ""} mode=${mode}`);
  return { success: true, mode, state: nativeRecordingState, health: after };
}

export async function stopNativeRecording(reason?: string) {
  const before = await fetchDeviceHealth();
  if (before.recording !== true && !nativeRecordingState.active) {
    updateNativeRecordingState({
      active: false,
      activeVideoPath: "",
      lastVideoPath: before.lastVideoPath || nativeRecordingState.lastVideoPath,
    });
    return { success: true, alreadyStopped: true, mode: nativeRecordingState.lastMode || "explicit", state: nativeRecordingState };
  }

  let useFallbackToggle = before.recording !== true && nativeRecordingState.lastMode === "fallback-toggle";
  let output = await sendCameraCommand(useFallbackToggle ? CAMERA_ACTIONS.TOGGLE_VIDEO : CAMERA_ACTIONS.STOP_VIDEO);
  let after = await waitForRecordingState(false, 1500);

  if (after.recording !== true) {
    await sleep(600);
    const settled = await fetchDeviceHealth(1000);
    if (settled.recording === true) {
      after = settled;
    }
  }

  if (after.recording === true && !useFallbackToggle) {
    const fallbackOutput = await sendCameraCommand(CAMERA_ACTIONS.TOGGLE_VIDEO);
    useFallbackToggle = true;
    output = `${output}\n${fallbackOutput}`;
    after = await waitForRecordingState(false, 2000);
  }

  updateNativeRecordingState({
    active: after.recording === true,
    stoppedAt: new Date().toISOString(),
    lastCommand: "stop",
    lastMode: useFallbackToggle ? "fallback-toggle" : "explicit",
    lastOutput: output,
    activeVideoPath: after.activeVideoPath || "",
    lastVideoPath: after.lastVideoPath || nativeRecordingState.activeVideoPath || nativeRecordingState.lastVideoPath,
  });

  console.log(`[Preview] Native recording stop reason=${reason || ""} mode=${nativeRecordingState.lastMode}`);
  return { success: true, mode: nativeRecordingState.lastMode, state: nativeRecordingState, health: after };
}

export async function toggleNativeRecording() {
  const output = await sendCameraCommand(CAMERA_ACTIONS.TOGGLE_VIDEO);
  const nextActive = !nativeRecordingState.active;
  updateNativeRecordingState({
    active: nextActive,
    startedAt: nextActive ? new Date().toISOString() : nativeRecordingState.startedAt,
    stoppedAt: nextActive ? null : new Date().toISOString(),
    lastCommand: "toggle",
    lastMode: "fallback-toggle",
    lastOutput: output,
  });
  return { success: true, state: nativeRecordingState };
}

export async function refreshNativeRecordingStatus() {
  const health = await fetchDeviceHealth();
  if (health.recording === true || health.recording === false) {
    updateNativeRecordingState({
      active: health.recording === true,
      activeVideoPath: health.activeVideoPath || nativeRecordingState.activeVideoPath,
      lastVideoPath: health.lastVideoPath || nativeRecordingState.lastVideoPath,
    });
  }
  return { ok: true, state: nativeRecordingState, health };
}

export async function fetchCameraCapabilities() {
  await sendCameraCommand(CAMERA_ACTIONS.GET_CAPABILITIES);
  await sleep(500);
  const json = await adbShell(`cat ${CAMERA_CAPABILITIES_PATH}`, 5000);
  return parseJsonOrFallback(json, { error: "Failed to parse capabilities" });
}

export async function applyManualCameraParams(params: Record<string, unknown>) {
  await sendCameraBroadcast(CAMERA_ACTIONS.SET_MANUAL_PARAMS, buildManualParamExtras(params));
  return { success: true, applied: params };
}

export function resetPreviewHealthEstimator() {
  previewFpsEstimator.reset();
}

export function warmKitchenProtocolCamera(): Promise<void> {
  if (process.env.CLOUD_MODE === "true") return Promise.resolve();
  if (kitchenCameraWarmup) return kitchenCameraWarmup;
  kitchenCameraWarmup = (async () => {
    try {
      await bootPreviewStreamOrThrow();
    } catch (error: any) {
      console.warn(`[Preview] Kitchen protocol could not auto-start camera: ${error?.message || error}`);
    } finally {
      kitchenCameraWarmup = null;
    }
  })();
  return kitchenCameraWarmup;
}
