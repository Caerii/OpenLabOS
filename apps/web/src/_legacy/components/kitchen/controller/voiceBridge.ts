import {
  aiSensorsConnect,
  aiSensorsStatus,
  deviceStatus,
  liveCoachGlassesAudioStart,
  liveCoachGlassesAudioStatus,
  type GlassesLiveCoachAudioStatus,
} from "../../../api";

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

export function ipFromDeviceStatus(status: Awaited<ReturnType<typeof deviceStatus>>) {
  const directIp = typeof status.ip === "string" ? status.ip : "";
  if (directIp) return directIp;
  const serial = status.device || status.targetDevice || status.devices?.find((device) => device.status === "device")?.serial || "";
  const match = serial.match(/^(\d+\.\d+\.\d+\.\d+)(?::\d+)?$/);
  return match?.[1] || "";
}

export async function currentGlassesIp() {
  const status = await deviceStatus();
  return ipFromDeviceStatus(status);
}

export async function ensureWifiProxy() {
  const ip = await currentGlassesIp();
  if (!ip) return false;
  const response = await fetch("/api/wifi-proxy/enable", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ip }),
  });
  return response.ok;
}

export async function ensureSensorBridge() {
  await ensureWifiProxy().catch(() => false);
  const ip = await currentGlassesIp().catch(() => "");
  try {
    await aiSensorsConnect({ host: ip || "127.0.0.1", port: 8080, startImu: false });
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await sleep(250);
      const status = await aiSensorsStatus();
      if (status.connected) return status;
    }
    return await aiSensorsStatus();
  } catch {
    return null;
  }
}

/**
 * Canonical live-demo voice bootstrap.
 *
 * The guided run and supervisor controls both use this helper so "hands-free"
 * always means the same thing: glasses microphone streaming to Gemini Live and
 * Gemini audio playing back on the glasses. Failures are non-fatal because the
 * browser/static replay paths remain valid fallbacks.
 */
export async function ensureGlassesVoiceBridge(): Promise<GlassesLiveCoachAudioStatus | null> {
  await ensureWifiProxy().catch(() => false);
  try {
    const started = await liveCoachGlassesAudioStart({ playback: true });
    if (started.connected) return started;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await sleep(350);
      const status = await liveCoachGlassesAudioStatus();
      if (status.connected) return status;
    }
    return started;
  } catch {
    const proxyReady = await ensureWifiProxy().catch(() => false);
    if (!proxyReady) return null;
    try {
      const started = await liveCoachGlassesAudioStart({ playback: true });
      if (started.connected) return started;
      await sleep(500);
      return await liveCoachGlassesAudioStatus();
    } catch {
      return null;
    }
  }
}
