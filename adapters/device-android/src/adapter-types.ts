/**
 * Local mirror of the DeviceAdapter contract. The canonical types live in
 * services/api/src/core/adapters/types.ts; we duplicate them here only to
 * avoid a runtime cross-package import. Keep them in lockstep — a future
 * decision will move the contract into a shared @openlabos/device-contract
 * package and remove this duplication.
 */

export type Capability =
  | "camera"
  | "imu"
  | "audio"
  | "shell"
  | "packages"
  | "files"
  | "battery"
  | "wifi"
  | "mcu"
  | "ota"
  | "settings"
  | "events"
  | "preview"
  | "live-coach";

export interface Frame {
  seq: number;
  at: string;
  bytes: Uint8Array;
  source: { adapterId: string; format: "jpeg" | "png" | "raw" };
}

export interface SensorSample {
  at: string;
  kind: "imu" | "orientation" | "gesture" | "ambient" | "custom";
  payload: Record<string, unknown>;
}

export interface DeviceSessionOptions {
  sessionId: string;
  request: Capability[];
}

export interface DeviceSession {
  readonly adapterId: string;
  readonly sessionId: string;
  readonly capabilities: Capability[];
  preview(): AsyncIterable<Frame>;
  sensors(): AsyncIterable<SensorSample>;
  invoke(capability: Capability, op: string, payload?: unknown): Promise<unknown>;
  close(): Promise<void>;
}

export interface DeviceAdapter {
  readonly id: string;
  capabilities(): Promise<Capability[]>;
  health(): Promise<{ ok: boolean; detail?: string }>;
  open(opts: DeviceSessionOptions): Promise<DeviceSession>;
}
