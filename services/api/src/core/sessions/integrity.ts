import { createHash } from "node:crypto";

export interface FrameIntegrity {
  sha256: string;
  captured_at: string;
  adapter_id: string;
  operator_id?: string;
  byte_length: number;
}

export function hashBuffer(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

export function buildFrameIntegrity(input: {
  data: Buffer | string;
  adapterId: string;
  operatorId?: string;
  capturedAt?: string;
}): FrameIntegrity {
  const buf = typeof input.data === "string" ? Buffer.from(input.data) : input.data;
  return {
    sha256: `sha256:${hashBuffer(buf)}`,
    captured_at: input.capturedAt ?? new Date().toISOString(),
    adapter_id: input.adapterId,
    operator_id: input.operatorId,
    byte_length: buf.byteLength,
  };
}
