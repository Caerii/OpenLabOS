/**
 * The DeviceAdapter contract — capability-based, transport-agnostic.
 *
 * The coordination plane never imports a vendor SDK and never speaks a
 * device's wire protocol. It addresses adapters by id and capability; an
 * adapter that *has* a capability is interchangeable with any other adapter
 * that has the same capability.
 *
 * This is the architectural lever that lets a webcam, a phone, an HMD, and a
 * ROS 2 station serve the same protocol run.
 */

export const Capability = {
  Camera: "camera",
  Imu: "imu",
  Audio: "audio",
  Shell: "shell",
  Packages: "packages",
  Files: "files",
  Battery: "battery",
  Wifi: "wifi",
  Mcu: "mcu",
  Ota: "ota",
  Settings: "settings",
  Events: "events",
  Preview: "preview",
  LiveCoach: "live-coach",
} as const;

export type Capability = (typeof Capability)[keyof typeof Capability];

export interface Frame {
  /** Monotonic sequence within the current preview stream. */
  seq: number;
  /** Capture timestamp in ISO 8601. */
  at: string;
  /** Wire payload, JPEG by default. */
  bytes: Uint8Array;
  /** Provenance for the audit trail. */
  source: { adapterId: string; format: "jpeg" | "png" | "raw" };
}

export interface SensorSample {
  at: string;
  kind: "imu" | "orientation" | "gesture" | "ambient" | "custom";
  payload: Record<string, unknown>;
}

export interface DeviceSessionOptions {
  /** Logical session id this adapter session is bound to. */
  sessionId: string;
  /** Capabilities the caller intends to exercise; adapter may decline. */
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
  /**
   * Stable, machine-readable list of what this adapter is willing to serve.
   * The router uses this to decide which adapter takes a request.
   */
  capabilities(): Promise<Capability[]>;
  /** Quick liveness probe; cheap, no side effects. */
  health(): Promise<{ ok: boolean; detail?: string }>;
  open(opts: DeviceSessionOptions): Promise<DeviceSession>;
}
