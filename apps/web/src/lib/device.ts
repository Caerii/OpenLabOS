/**
 * Typed client over the OpenLabOS API's `/api/device/*` proxy. Every call
 * here ends up forwarded to the on-device server with the server-side
 * X-LabOS-Token attached automatically — the browser never sees a token.
 *
 * Errors are normalised to `DeviceError` with a status + body. Polling is
 * the responsibility of the caller; this module only does single requests.
 */

const BASE = "/api/device";

export class DeviceError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
    public readonly path: string,
  ) {
    super(`device ${path} → ${status} ${body}`);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, init);
  const text = await res.text();
  if (!res.ok) throw new DeviceError(res.status, text, path);
  return text ? (JSON.parse(text) as T) : ({} as T);
}

const json = (
  method: "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
) =>
  request<unknown>(path, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? "{}" : JSON.stringify(body),
  });

// ── Status / system / health ───────────────────────────────────
export interface DeviceStatus {
  mcuConnected: boolean;
  batteryPercent: number;
  batteryVoltage: number;
  dashboardVersion: string;
  coreStatus: { mcuConnected: boolean; batteryPercent: number };
  model: string;
  manufacturer: string;
  androidVersion: string;
  sdkVersion: number;
}

export interface DeviceSystemInfo {
  model: string;
  manufacturer: string;
  brand: string;
  device: string;
  product: string;
  hardware: string;
  androidVersion: string;
  sdkVersion: number;
  buildId: string;
  serial: string;
  uptimeMs: number;
  uptimeHours: string;
  jvmMaxMemoryMb: number;
  jvmTotalMemoryMb: number;
  jvmFreeMemoryMb: number;
}

export interface BatterySummary {
  available: boolean;
  lastTimestamp: number;
  percent: number;
  voltage: number;
  logSizeBytes: number;
}

export interface BatteryHistory {
  entries: Array<{ timestamp: number; percent: number; voltage: number }>;
}

export interface WifiStatus {
  connected: boolean;
  ssid: string;
  ip: string;
  rssi: number;
  link_speed: number;
  frequency: number;
}

export interface WifiScan {
  networks: Array<{ ssid: string; rssi: number }>;
}

export interface McuStatus {
  connected: boolean;
  batteryPercent: number;
  batteryVoltage: number;
}

export interface SettingsPayload {
  [k: string]: unknown;
}

export interface FilesEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  size?: number;
  modified?: number;
}

export interface FilesListing {
  path: string;
  isDirectory: boolean;
  entries: FilesEntry[];
}

export interface PackageRecord {
  name: string;
  version_name?: string;
}

export interface CrashRecord {
  id: string;
  at: string;
  class?: string;
}

export interface PreviewHealth {
  ok: boolean;
  fps: number;
  frameCount: number;
  streaming: boolean;
}

export const device = {
  // ── Read-only ─────────────────────────────────────────────────
  health: () => request<{ ok: boolean; service: string; version: string }>("/health"),
  status: () => request<DeviceStatus>("/api/status"),
  systemInfo: () => request<DeviceSystemInfo>("/api/system/info"),
  batterySummary: () => request<BatterySummary>("/api/battery/summary"),
  batteryHistory: () => request<BatteryHistory>("/api/battery/history"),
  wifiStatus: () => request<WifiStatus>("/api/wifi/status"),
  mcuStatus: () => request<McuStatus>("/api/mcu/status"),
  previewHealth: () => request<PreviewHealth>("/api/preview/health"),
  settings: () => request<SettingsPayload>("/api/settings"),

  // ── Files / packages / dev ────────────────────────────────────
  listFiles: (path: string) =>
    request<FilesListing>(
      `/api/dev/files?path=${encodeURIComponent(path)}`,
    ),
  listPackages: () => request<{ packages: string[] | PackageRecord[] }>("/api/dev/packages"),
  props: () => request<{ exitCode: number; stdout: string }>("/api/dev/props"),
  crashes: () => request<{ crashes: CrashRecord[]; count: number }>("/api/dev/crashes"),
  shell: (command: string) =>
    json("POST", "/api/dev/shell", { command }) as Promise<{
      exitCode: number;
      stdout: string;
      stderr: string;
      command: string;
    }>,

  // ── Camera ────────────────────────────────────────────────────
  cameraStart: () => json("POST", "/api/camera/start") as Promise<{ success: boolean; action?: string }>,
  cameraStop: () => json("POST", "/api/camera/stop") as Promise<{ success: boolean; action?: string }>,
  takePhoto: () => json("POST", "/api/camera/photo") as Promise<{ success: boolean; action?: string }>,
  videoStart: () => json("POST", "/api/camera/video/start") as Promise<{ success: boolean }>,
  videoStop: () => json("POST", "/api/camera/video/stop") as Promise<{ success: boolean }>,

  // ── Audio ─────────────────────────────────────────────────────
  playAudio: (payload: Record<string, unknown>) =>
    json("POST", "/api/audio/play", payload) as Promise<{ accepted: boolean }>,
  playAudioFile: (path: string) =>
    json("POST", "/api/audio/play-file", { path }) as Promise<{ accepted: boolean }>,

  // ── WiFi ──────────────────────────────────────────────────────
  wifiScan: () => json("POST", "/api/wifi/scan") as Promise<WifiScan | { success: boolean }>,
  wifiConnect: (ssid: string, psk?: string) =>
    json("POST", "/api/wifi/connect", { ssid, psk }) as Promise<{ accepted: boolean }>,
  wifiDisconnect: () => json("POST", "/api/wifi/disconnect") as Promise<{ accepted: boolean }>,

  // ── System ────────────────────────────────────────────────────
  reboot: () => json("POST", "/api/system/reboot") as Promise<{ accepted: boolean }>,

  // ── Live coach ────────────────────────────────────────────────
  liveCoachStart: (payload: Record<string, unknown> = {}) =>
    json("POST", "/api/live-coach/audio/start", payload) as Promise<{ accepted: boolean }>,
  liveCoachStop: () => json("POST", "/api/live-coach/audio/stop") as Promise<{ accepted: boolean }>,
  liveCoachStatus: () =>
    request<{
      running: boolean;
      connected: boolean;
      wsUrl: string;
      sampleRate: number;
      outputSampleRate: number;
    }>("/api/live-coach/audio/status"),

  // ── OTA / packages ────────────────────────────────────────────
  installApkFromUrl: (url: string) =>
    json("POST", "/api/dev/packages/install-url", { url }) as Promise<{ accepted: boolean }>,
  uninstallPackage: (pkg: string) =>
    json("POST", "/api/dev/packages/uninstall", { package: pkg }) as Promise<{
      accepted: boolean;
    }>,

  // ── Settings ──────────────────────────────────────────────────
  putSettings: (patch: SettingsPayload) =>
    json("PUT", "/api/settings", patch) as Promise<SettingsPayload>,

  // ── Stream URLs (fed directly to <img>/EventSource) ───────────
  previewStreamUrl: () => `${BASE}/api/preview/stream`,
  eventsStreamUrl: () => `${BASE}/api/events`,
};
