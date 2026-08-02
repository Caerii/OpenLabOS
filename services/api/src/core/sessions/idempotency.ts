import { createHash } from "node:crypto";

export function payloadHash(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export type IdempotencyResult = { replay: boolean } | { conflict: true };

export function checkIdempotencyMemory(
  table: Map<string, string>,
  key: string | undefined,
  payload: unknown,
): IdempotencyResult {
  if (!key?.trim()) return { replay: false };
  const hash = payloadHash(payload);
  const existing = table.get(key.trim());
  if (existing) {
    if (existing !== hash) return { conflict: true };
    return { replay: true };
  }
  table.set(key.trim(), hash);
  return { replay: false };
}
