import type { LabOSFeatureFlags } from "../../../config/features.js";
import {
  buildOperatorReadiness,
  type OperatorReadiness,
} from "./operator-readiness.js";

export interface OperatorDeviceStatus {
  connected: boolean;
  device?: string;
  ip?: string;
  devices?: Array<{ serial: string; status: string }>;
  targetDevice?: string | null;
}

export interface OperatorSensorBridgePort {
  connected: boolean;
  connect: (opts?: { host?: string; port?: number; token?: string }) => void;
  getStats: () => unknown;
}

export interface OperatorButtonConfirmStatus {
  mapped?: boolean;
  sensorBridgeConnected?: boolean;
  mappings?: Record<string, string> | null;
}

export interface OperatorDeviceServicePorts {
  featureFlags: () => LabOSFeatureFlags;
  getDeviceStatus: () => Promise<OperatorDeviceStatus>;
  getLabosStatus: () => Promise<{ isInstalled?: boolean; isRunning?: boolean } | null>;
  previewHealthSnapshot: () => Promise<Record<string, unknown> | null>;
  refreshNativeRecordingStatus: () => Promise<Record<string, unknown> | null>;
  getButtonConfirmStatus: () => Promise<OperatorButtonConfirmStatus | null>;
  enableWifiProxy: (ip: string, token?: string | null) => Promise<unknown>;
  getToken: () => string | null;
  sensorBridge: OperatorSensorBridgePort;
  sleep?: (ms: number) => Promise<void>;
}

export interface EnsureButtonConfirmBridgeResult {
  connected: boolean;
  ip?: string;
  reason?: "no_glasses_ip";
  proxy?: unknown;
  stats: unknown;
}

const defaultSleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function ipFromDeviceStatus(status: OperatorDeviceStatus | null | undefined) {
  const directIp = typeof status?.ip === "string" ? status.ip : "";
  if (directIp) return directIp;
  const serial = status?.device
    || status?.targetDevice
    || status?.devices?.find((device) => device.status === "device")?.serial
    || "";
  const match = serial.match(/^(\d+\.\d+\.\d+\.\d+)(?::\d+)?$/);
  return match?.[1] || "";
}

export class KitchenOperatorDeviceService {
  constructor(private readonly ports: OperatorDeviceServicePorts) {}

  async ensureButtonConfirmBridge(): Promise<EnsureButtonConfirmBridgeResult> {
    const device = await this.ports.getDeviceStatus();
    const ip = ipFromDeviceStatus(device);
    if (!ip) {
      return {
        connected: false,
        reason: "no_glasses_ip",
        stats: this.ports.sensorBridge.getStats(),
      };
    }

    let proxy: unknown = null;
    await this.ports.enableWifiProxy(ip, this.ports.getToken()).then((result) => {
      proxy = result;
    }).catch(() => null);

    this.ports.sensorBridge.connect({
      host: ip,
      port: 8080,
      token: this.ports.getToken() || undefined,
    });

    const sleep = this.ports.sleep || defaultSleep;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await sleep(250);
      if (this.ports.sensorBridge.connected) break;
    }

    return {
      connected: this.ports.sensorBridge.connected,
      ip,
      proxy,
      stats: this.ports.sensorBridge.getStats(),
    };
  }

  async readiness(): Promise<OperatorReadiness> {
    const flags = this.ports.featureFlags();
    const [device, labos, preview, recording, buttonConfirm] = await Promise.all([
      this.ports.getDeviceStatus().catch(() => null),
      this.ports.getLabosStatus().catch(() => null),
      this.ports.previewHealthSnapshot().catch(() => null),
      this.ports.refreshNativeRecordingStatus().catch(() => null),
      this.ports.getButtonConfirmStatus().catch(() => null),
    ]);
    const healedButtonConfirm = await this.buttonConfirmStatusAfterAutoConnect({
      flags,
      device,
      labos,
      buttonConfirm,
    });

    const recordingState = (recording as any)?.state || {};
    const recordingHealth = (recording as any)?.health || {};
    return buildOperatorReadiness({
      connected: device?.connected === true,
      labosInstalled: labos?.isInstalled === true,
      labosRunning: labos?.isRunning === true,
      previewReachable: (preview as any)?.frameReachable === true,
      previewStreaming: (preview as any)?.streaming === true,
      previewFrameCount: Number((preview as any)?.frameCount || 0),
      previewFrameBytes: Number((preview as any)?.frameBytes || 0),
      previewFps: Number((preview as any)?.fps || 0),
      previewStatus: typeof (preview as any)?.previewStatus === "string" ? (preview as any).previewStatus : undefined,
      previewDetail: typeof (preview as any)?.previewDetail === "string" ? (preview as any).previewDetail : undefined,
      recordingActive: recordingState.active === true || recordingHealth.recording === true,
      activeVideoPath: recordingState.activeVideoPath || recordingHealth.activeVideoPath || "",
      buttonConfirmEnabled: flags.buttonConfirmEnabled,
      buttonMapped: healedButtonConfirm?.mapped === true,
      buttonStreamConnected: healedButtonConfirm?.sensorBridgeConnected === true,
      buttonMappingValue: healedButtonConfirm?.mappings?.camera_short || null,
      voicePerceptionEnabled: flags.handsFreeEnabled || flags.realtimeSupervisorEnabled || flags.confirmStepValidationEnabled,
      featureFlags: flags,
    });
  }

  private async buttonConfirmStatusAfterAutoConnect({
    flags,
    device,
    labos,
    buttonConfirm,
  }: {
    flags: LabOSFeatureFlags;
    device: OperatorDeviceStatus | null;
    labos: { isRunning?: boolean } | null;
    buttonConfirm: OperatorButtonConfirmStatus | null;
  }) {
    if (
      flags.buttonConfirmEnabled === false ||
      device?.connected !== true ||
      labos?.isRunning !== true ||
      buttonConfirm?.sensorBridgeConnected === true
    ) {
      return buttonConfirm;
    }

    await this.ensureButtonConfirmBridge().catch(() => null);
    return this.ports.getButtonConfirmStatus().catch(() => buttonConfirm);
  }
}
