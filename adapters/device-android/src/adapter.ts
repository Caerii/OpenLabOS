/**
 * AndroidDeviceAdapter — implements the API-side DeviceAdapter contract by
 * forwarding to the on-device dashboard server. The TypeScript core never
 * speaks the device's wire format; this is the only place that knows the
 * URL paths and request shapes.
 */
import { DeviceClient, type DeviceClientOptions } from "./client.js";
import type {
  Capability,
  DeviceAdapter,
  DeviceSession,
  DeviceSessionOptions,
  Frame,
  SensorSample,
} from "./adapter-types.js";

const ALL_CAPABILITIES: Capability[] = [
  "camera",
  "imu",
  "audio",
  "shell",
  "packages",
  "files",
  "battery",
  "wifi",
  "mcu",
  "settings",
  "events",
  "preview",
  "live-coach",
];

export interface AndroidAdapterOptions extends DeviceClientOptions {
  id?: string;
  /** Override the capability list reported by `capabilities()`. */
  capabilities?: Capability[];
}

export class AndroidDeviceAdapter implements DeviceAdapter {
  readonly id: string;
  readonly client: DeviceClient;
  private readonly capList: Capability[];

  constructor(opts: AndroidAdapterOptions) {
    this.id = opts.id ?? `android@${new URL(opts.baseUrl).host}`;
    this.client = new DeviceClient(opts);
    this.capList = opts.capabilities ?? ALL_CAPABILITIES;
  }

  async capabilities(): Promise<Capability[]> {
    return this.capList;
  }

  async health(): Promise<{ ok: boolean; detail?: string }> {
    try {
      await this.client.health();
      return { ok: true };
    } catch (err) {
      return { ok: false, detail: err instanceof Error ? err.message : String(err) };
    }
  }

  async open(opts: DeviceSessionOptions): Promise<DeviceSession> {
    const adapterId = this.id;
    const client = this.client;
    return {
      adapterId,
      sessionId: opts.sessionId,
      capabilities: opts.request,
      preview: () => previewLoop(client),
      sensors: () => eventStream(client),
      invoke: (capability, op, payload) => dispatch(client, capability, op, payload),
      close: async () => {
        try {
          await client.cameraStop();
        } catch {
          /* not all sessions started a camera; ignore */
        }
      },
    };
  }
}

async function* previewLoop(client: DeviceClient): AsyncIterable<Frame> {
  // Polls /api/preview/frame at ~5 fps. A streaming MJPEG path is also
  // available (client.previewStreamUrl()); the consumer can opt in to it.
  let seq = 0;
  while (true) {
    try {
      const res = await fetch(client.previewFrameUrl(), { method: "GET" });
      if (!res.ok) {
        await new Promise((r) => setTimeout(r, 500));
        continue;
      }
      const buf = new Uint8Array(await res.arrayBuffer());
      yield {
        seq: seq++,
        at: new Date().toISOString(),
        bytes: buf,
        source: { adapterId: "android", format: "jpeg" },
      };
      await new Promise((r) => setTimeout(r, 200));
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

async function* eventStream(client: DeviceClient): AsyncIterable<SensorSample> {
  // The on-device server exposes SSE on /api/events. Without DOM EventSource
  // we'd add a node-friendly client; for now this yields nothing and the
  // consumer should use client.eventsStreamUrl() directly.
  void client;
}

async function dispatch(
  client: DeviceClient,
  capability: Capability,
  op: string,
  payload: unknown,
): Promise<unknown> {
  const p = (payload ?? {}) as Record<string, unknown>;
  switch (`${capability}.${op}`) {
    case "camera.start":
      return client.cameraStart(p);
    case "camera.stop":
      return client.cameraStop();
    case "camera.photo":
      return client.takePhoto();
    case "camera.video.start":
      return client.startVideoRecording(p);
    case "camera.video.stop":
      return client.stopVideoRecording();
    case "audio.play":
      return client.playAudio(p);
    case "audio.play-file":
      return client.playAudioFile(p.path as string);
    case "battery.summary":
      return client.batterySummary();
    case "battery.history":
      return client.batteryHistory();
    case "wifi.status":
      return client.wifiStatus();
    case "wifi.scan":
      return client.wifiScan();
    case "wifi.connect":
      return client.wifiConnect(p as { ssid: string; psk?: string });
    case "wifi.disconnect":
      return client.wifiDisconnect();
    case "settings.get":
      return client.getSettings();
    case "settings.put":
      return client.putSettings(p);
    case "mcu.status":
      return client.mcuStatus();
    case "mcu.command":
      return client.mcuCommand(p);
    case "shell.exec":
      return client.devShell({ command: (p.command ?? p.cmd) as string });
    case "files.list":
      return client.devListFiles(p.path as string);
    case "packages.list":
      return client.devListPackages();
    case "packages.install-url":
      return client.devInstallPackageFromUrl(p.url as string);
    case "packages.uninstall":
      return client.devUninstallPackage(p.package as string);
    case "live-coach.start":
      return client.liveCoachAudioStart(p);
    case "live-coach.stop":
      return client.liveCoachAudioStop();
    case "live-coach.status":
      return client.liveCoachAudioStatus();
    default:
      throw new Error(`Unsupported capability operation: ${capability}.${op}`);
  }
}
