import http from "http";
import { adb } from "../adb.js";
import { getGlassesUrl, getToken, isWifiMode } from "../wifi-proxy.js";

export type AudioCue =
  | "step_start"
  | "verify_success"
  | "verify_fail"
  | "run_complete"
  | "run_abort";

export type AudioCueResult =
  | { success: true; cue: AudioCue; mode: "wifi"; asset: string }
  | { success: true; cue: AudioCue; mode: "adb-forward"; asset: string }
  | { success: true; cue: AudioCue; mode: "silent"; reason: string };

export type DeviceAudioFileResult =
  | { success: true; mode: "wifi"; path: string }
  | { success: true; mode: "adb-forward"; path: string };

export type AudioCueTransportResult =
  | { ready: true; mode: "wifi" }
  | { ready: true; mode: "adb-forward" }
  | { ready: false; mode: "silent"; reason: string };

const ADB_AUDIO_PORT = 18080;
let adbAudioForward: Promise<{ port: number; token: string | null }> | null = null;

export function cueToAsset(cue: AudioCue): string {
  // These live in the core-app assets/ folder (see AudioController.java).
  switch (cue) {
    case "step_start":
      return "click_sound.wav";
    case "verify_success":
      return "recording_start.wav";
    case "verify_fail":
      return "disconnected.wav";
    case "run_complete":
      return "recording_stop.wav";
    case "run_abort":
      return "disconnected.wav";
  }
}

async function postAudioAsset(hostname: string, port: number, asset: string, token: string | null) {
  await new Promise<void>((resolve, reject) => {
    const body = JSON.stringify({ asset });
    const req = http.request(
      {
        hostname,
        port,
        path: "/api/audio/play",
        method: "POST",
        timeout: 4000,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          ...(token ? { "X-LabOS-Token": token } : {}),
        },
      },
      (res) => {
        res.on("data", () => {});
        res.on("end", () => {
          if ((res.statusCode || 0) >= 200 && (res.statusCode || 0) < 300) {
            resolve();
            return;
          }
          reject(new Error(`Device audio play failed: HTTP ${res.statusCode}`));
        });
      },
    );

    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Device audio play timed out"));
    });
    req.write(body);
    req.end();
  });
}

async function postAudioFile(hostname: string, port: number, filePath: string, token: string | null) {
  await new Promise<void>((resolve, reject) => {
    const body = JSON.stringify({ path: filePath });
    const req = http.request(
      {
        hostname,
        port,
        path: "/api/audio/play-file",
        method: "POST",
        timeout: 4000,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          ...(token ? { "X-LabOS-Token": token } : {}),
        },
      },
      (res) => {
        res.on("data", () => {});
        res.on("end", () => {
          if ((res.statusCode || 0) >= 200 && (res.statusCode || 0) < 300) {
            resolve();
            return;
          }
          reject(new Error(`Device audio file play failed: HTTP ${res.statusCode}`));
        });
      },
    );

    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Device audio file play timed out"));
    });
    req.write(body);
    req.end();
  });
}

function fetchAudioToken(hostname: string, port: number): Promise<string | null> {
  return new Promise((resolve) => {
    const req = http.request(
      {
        hostname,
        port,
        path: "/api/auth/token",
        method: "GET",
        timeout: 1500,
      },
      (res) => {
        let data = "";
        res.on("data", (chunk: Buffer) => { data += chunk.toString(); });
        res.on("end", () => {
          try {
            const parsed = JSON.parse(data);
            resolve(typeof parsed.token === "string" && parsed.token ? parsed.token : null);
          } catch {
            resolve(null);
          }
        });
      },
    );
    req.on("error", () => resolve(null));
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
    req.end();
  });
}

async function playWifiAsset(asset: string) {
  const url = new URL(getGlassesUrl());
  await postAudioAsset(url.hostname, 8080, asset, getToken());
}

async function playWifiFile(filePath: string) {
  const url = new URL(getGlassesUrl());
  await postAudioFile(url.hostname, 8080, filePath, getToken());
}

async function ensureAdbAudioForward() {
  if (!adbAudioForward) {
    adbAudioForward = (async () => {
      await adb(["forward", `tcp:${ADB_AUDIO_PORT}`, "tcp:8080"], 5000);
      return {
        port: ADB_AUDIO_PORT,
        token: await fetchAudioToken("127.0.0.1", ADB_AUDIO_PORT),
      };
    })().catch((error) => {
      adbAudioForward = null;
      throw error;
    });
  }
  return adbAudioForward;
}

async function playAdbForwardAsset(asset: string) {
  const forward = await ensureAdbAudioForward();
  await postAudioAsset("127.0.0.1", forward.port, asset, forward.token);
}

async function playAdbForwardFile(filePath: string) {
  const forward = await ensureAdbAudioForward();
  await postAudioFile("127.0.0.1", forward.port, filePath, forward.token);
}

export async function prepareAudioCueTransport(): Promise<AudioCueTransportResult> {
  if (isWifiMode()) {
    return { ready: true, mode: "wifi" };
  }

  try {
    await ensureAdbAudioForward();
    return { ready: true, mode: "adb-forward" };
  } catch (error: any) {
    return { ready: false, mode: "silent", reason: error?.message || "adb_audio_forward_unavailable" };
  }
}

export async function playAudioCue(cue: AudioCue): Promise<AudioCueResult> {
  const asset = cueToAsset(cue);
  if (isWifiMode()) {
    await playWifiAsset(asset);
    return { success: true, cue, mode: "wifi", asset };
  }

  try {
    await playAdbForwardAsset(asset);
    return { success: true, cue, mode: "adb-forward", asset };
  } catch (error: any) {
    return { success: true, cue, mode: "silent", reason: error?.message || "adb_audio_forward_unavailable" };
  }
}

export async function playDeviceAudioFile(filePath: string): Promise<DeviceAudioFileResult> {
  if (isWifiMode()) {
    await playWifiFile(filePath);
    return { success: true, mode: "wifi", path: filePath };
  }

  await playAdbForwardFile(filePath);
  return { success: true, mode: "adb-forward", path: filePath };
}
