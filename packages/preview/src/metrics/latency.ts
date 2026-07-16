export interface PreviewLatencyBreakdown {
  captureToEncodeMs: number | null;
  encodeToPublishMs: number | null;
  publishToClientMs: number | null;
  streamFrameAgeMs: number | null;
  glassToGlassMs: number | null;
}

export function computeGlassToGlassMs(parts: PreviewLatencyBreakdown): number | null {
  const values = [
    parts.captureToEncodeMs,
    parts.encodeToPublishMs,
    parts.publishToClientMs,
  ].filter((value): value is number => value !== null && Number.isFinite(value));
  if (!values.length) return parts.streamFrameAgeMs;
  return values.reduce((sum, value) => sum + value, 0);
}

export function pickDisplayedLatencyMs(
  health: { streamFrameAgeMs?: number | null; encodeLatencyMs?: number | null },
  fallbackMs: number | null = null,
): number | null {
  if (health.streamFrameAgeMs !== undefined && health.streamFrameAgeMs !== null) {
    return Math.round(health.streamFrameAgeMs);
  }
  if (health.encodeLatencyMs !== undefined && health.encodeLatencyMs !== null && Number.isFinite(health.encodeLatencyMs)) {
    return Math.round(health.encodeLatencyMs);
  }
  return fallbackMs;
}
