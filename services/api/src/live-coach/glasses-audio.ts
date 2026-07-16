import http from "http";
import { getGlassesUrl, getToken, isWifiMode } from "../wifi-proxy.js";

export type GlassesAudioStatus = {
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
};

export function startGlassesAudioBridge(opts: { wsUrl: string; playback?: boolean }) {
  if (!opts.wsUrl) {
    return Promise.reject(new Error("wsUrl is required"));
  }
  return postGlassesJson<GlassesAudioStatus>("/api/live-coach/audio/start", {
    wsUrl: opts.wsUrl,
    playback: opts.playback !== false,
  });
}

export function stopGlassesAudioBridge() {
  return glassesJson<GlassesAudioStatus>("POST", "/api/live-coach/audio/stop");
}

export function getGlassesAudioBridgeStatus() {
  return getGlassesJson<GlassesAudioStatus>("/api/live-coach/audio/status");
}

function postGlassesJson<T>(path: string, body: unknown): Promise<T> {
  return glassesJson<T>("POST", path, body);
}

function getGlassesJson<T>(path: string): Promise<T> {
  return glassesJson<T>("GET", path);
}

function glassesJson<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  if (!isWifiMode()) {
    return Promise.reject(new Error("WiFi proxy is not enabled; connect to the glasses first."));
  }
  const url = new URL(getGlassesUrl());
  const token = getToken();
  const payload = body == null ? "" : JSON.stringify(body);

  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: url.hostname,
        port: 8080,
        path,
        method,
        timeout: 5000,
        agent: false,
        headers: {
          "Content-Type": "application/json",
          "Connection": "close",
          ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
          ...(token ? { "X-LabOS-Token": token } : {}),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk: Buffer) => { data += chunk.toString(); });
        res.on("end", () => {
          const status = res.statusCode || 500;
          if (status < 200 || status >= 300) {
            reject(new Error(`Glasses audio bridge HTTP ${status}: ${data}`));
            return;
          }
          try {
            resolve(data ? JSON.parse(data) as T : {} as T);
          } catch {
            resolve({ raw: data } as T);
          }
        });
      },
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Glasses audio bridge request timed out"));
    });
    if (payload) req.write(payload);
    req.end();
  });
}
