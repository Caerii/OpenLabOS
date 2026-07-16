/**
 * Thin HTTP client for the device-side dashboard server. Mirrors every
 * endpoint that the on-device router exposes; URL paths and request
 * shapes are byte-for-byte compatible with the legacy dashboard so an
 * unmodified Mentra Live image accepts these calls.
 */

export interface DeviceClientOptions {
  /** Base URL, e.g. "http://192.168.1.42:8080". */
  baseUrl: string;
  /** Optional bearer token from /api/auth/token. */
  token?: string;
  /** Request timeout in ms (default 8 s). */
  timeoutMs?: number;
  fetch?: typeof fetch;
}

export interface DeviceStatus {
  battery?: { percent?: number; charging?: boolean };
  network?: { ssid?: string; ip?: string };
  uptime_ms?: number;
  [k: string]: unknown;
}

export interface AuthToken {
  token: string;
  expires_at?: string;
}

export interface SystemInfo {
  device?: string;
  android_release?: string;
  api_level?: number;
  build?: string;
  [k: string]: unknown;
}

export class DeviceClient {
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(private readonly opts: DeviceClientOptions) {
    this.fetchImpl = opts.fetch ?? globalThis.fetch.bind(globalThis);
    this.timeoutMs = opts.timeoutMs ?? 8000;
  }

  private async req<T>(path: string, init: RequestInit = {}): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const headers: Record<string, string> = {
        accept: "application/json",
        // NanoHTTPD on the device gets confused if keep-alive reuses a
        // socket whose previous response wasn't fully drained. Force a
        // fresh socket per request to keep the wire predictable.
        connection: "close",
        ...(init.headers as Record<string, string> | undefined),
      };
      if (this.opts.token) headers["x-labos-token"] = this.opts.token;
      const res = await this.fetchImpl(`${this.opts.baseUrl}${path}`, {
        ...init,
        headers,
        signal: controller.signal,
      });
      const body = await res.text();
      if (!res.ok) {
        throw new Error(`${path} → ${res.status} ${res.statusText}: ${body}`);
      }
      return body ? (JSON.parse(body) as T) : ({} as T);
    } finally {
      clearTimeout(timer);
    }
  }

  // ── Health & auth ────────────────────────────────────────────
  health() {
    return this.req<{ ok: boolean }>("/health");
  }
  authToken() {
    return this.req<AuthToken>("/api/auth/token");
  }
  regenerateAuthToken() {
    return this.req<AuthToken>("/api/auth/regenerate", { method: "POST" });
  }

  // ── Status / system ──────────────────────────────────────────
  status() {
    return this.req<DeviceStatus>("/api/status");
  }
  systemInfo() {
    return this.req<SystemInfo>("/api/system/info");
  }
  reboot() {
    return this.req<{ accepted: boolean }>("/api/system/reboot", { method: "POST" });
  }

  // ── Settings ─────────────────────────────────────────────────
  getSettings() {
    return this.req<Record<string, unknown>>("/api/settings");
  }
  putSettings(patch: Record<string, unknown>) {
    return this.req<Record<string, unknown>>("/api/settings", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    });
  }

  // ── MCU ──────────────────────────────────────────────────────
  mcuStatus() {
    return this.req<Record<string, unknown>>("/api/mcu/status");
  }
  mcuCommand(payload: Record<string, unknown>) {
    return this.req<Record<string, unknown>>("/api/mcu/command", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
  }

  // ── Camera & preview ────────────────────────────────────────
  cameraStart(opts: Record<string, unknown> = {}) {
    return this.req<{ accepted: boolean }>("/api/camera/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(opts),
    });
  }
  cameraStop() {
    // NanoHTTPD on the device parses body-less POSTs inconsistently —
    // emit an empty JSON object so the verb is unambiguous.
    return this.req<{ success: boolean; action?: string }>("/api/camera/stop", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
  }
  takePhoto() {
    return this.req<{ success: boolean; photo_uri?: string }>("/api/camera/photo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
  }
  startVideoRecording(opts: Record<string, unknown> = {}) {
    return this.req<{ success: boolean; video_id?: string }>(
      "/api/camera/video/start",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(opts),
      },
    );
  }
  stopVideoRecording() {
    return this.req<{ success: boolean; video_uri?: string }>(
      "/api/camera/video/stop",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      },
    );
  }
  /** Returns a stream URL the consumer can open as MJPEG. */
  previewStreamUrl(): string {
    return `${this.opts.baseUrl}/api/preview/stream`;
  }
  previewFrameUrl(): string {
    return `${this.opts.baseUrl}/api/preview/frame`;
  }
  previewHealth() {
    return this.req<{ ok: boolean; fps?: number }>("/api/preview/health");
  }

  // ── Audio ────────────────────────────────────────────────────
  playAudio(payload: Record<string, unknown>) {
    return this.req<{ accepted: boolean }>("/api/audio/play", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
  }
  playAudioFile(path: string) {
    return this.req<{ accepted: boolean }>("/api/audio/play-file", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path }),
    });
  }

  // ── Battery ──────────────────────────────────────────────────
  batterySummary() {
    return this.req<{ percent?: number; charging?: boolean }>("/api/battery/summary");
  }
  batteryHistory() {
    return this.req<{ samples: { at: string; percent: number }[] }>(
      "/api/battery/history",
    );
  }

  // ── WiFi ─────────────────────────────────────────────────────
  wifiStatus() {
    return this.req<{ connected: boolean; ssid?: string; ip?: string }>(
      "/api/wifi/status",
    );
  }
  wifiScan() {
    return this.req<{ networks: { ssid: string; rssi: number }[] }>(
      "/api/wifi/scan",
      { method: "POST" },
    );
  }
  wifiConnect(payload: { ssid: string; psk?: string }) {
    return this.req<{ accepted: boolean }>("/api/wifi/connect", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
  }
  wifiDisconnect() {
    return this.req<{ accepted: boolean }>("/api/wifi/disconnect", { method: "POST" });
  }

  // ── Live coach ───────────────────────────────────────────────
  liveCoachAudioStatus() {
    return this.req<{ active: boolean }>("/api/live-coach/audio/status");
  }
  liveCoachAudioStart(opts: Record<string, unknown> = {}) {
    return this.req<{ accepted: boolean }>("/api/live-coach/audio/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(opts),
    });
  }
  liveCoachAudioStop() {
    return this.req<{ accepted: boolean }>("/api/live-coach/audio/stop", {
      method: "POST",
    });
  }

  // ── Dev tools (shell, logcat, files, packages, props, crashes) ─
  devShell(payload: { command: string }) {
    return this.req<{ stdout: string; stderr: string; exitCode: number }>(
      "/api/dev/shell",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
  }
  devLogcat(query: string = "") {
    const q = query ? `?${query}` : "";
    return this.req<{ lines: string[] }>(`/api/dev/logcat${q}`);
  }
  devListFiles(path: string) {
    return this.req<{ entries: { name: string; size: number; is_dir: boolean }[] }>(
      `/api/dev/files?path=${encodeURIComponent(path)}`,
    );
  }
  devListPackages() {
    return this.req<{ packages: { name: string; version_name?: string }[] }>(
      "/api/dev/packages",
    );
  }
  devInstallPackageFromUrl(url: string) {
    return this.req<{ accepted: boolean }>("/api/dev/packages/install-url", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url }),
    });
  }
  devUninstallPackage(packageName: string) {
    return this.req<{ accepted: boolean }>("/api/dev/packages/uninstall", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ package: packageName }),
    });
  }
  devProps() {
    return this.req<Record<string, string>>("/api/dev/props");
  }
  devCrashes() {
    return this.req<{ crashes: { id: string; at: string; class: string }[] }>(
      "/api/dev/crashes",
    );
  }
  devCrashDetail(id: string) {
    return this.req<{ id: string; trace: string }>(
      `/api/dev/crashes/${encodeURIComponent(id)}`,
    );
  }
  devClearCrashes() {
    return this.req<{ accepted: boolean }>("/api/dev/crashes", { method: "DELETE" });
  }

  // ── Server-Sent Events stream URL (caller consumes EventSource) ─
  eventsStreamUrl(): string {
    return `${this.opts.baseUrl}/api/events`;
  }
}
