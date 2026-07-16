import type { PreviewProtocolConfig } from "../config/schema.js";

/** Megapixel×fps proxy for perceptual stream quality (higher = better). */
export function previewQualityScore(width: number, height: number, fps: number): number {
  return Math.round(((width * height * fps) / 1_000_000) * 100) / 100;
}

/** End-to-end device latency from stage summaries (lower = better). */
export function endToEndLatencyMs(
  summary: Record<string, { p50Ms?: number | null; p95Ms?: number | null }>,
  streamFrameAgeP95Ms?: number | null,
): number {
  if (streamFrameAgeP95Ms !== null && streamFrameAgeP95Ms !== undefined && Number.isFinite(streamFrameAgeP95Ms)) {
    const encode = summary.captureToEncode?.p95Ms ?? summary.captureToEncode?.p50Ms ?? 0;
    const publish = summary.encodeToPublish?.p95Ms ?? summary.encodeToPublish?.p50Ms ?? 0;
    return Math.round(streamFrameAgeP95Ms + (encode || 0) + (publish || 0));
  }
  const age = summary.deviceFrameAge?.p95Ms ?? summary.deviceFrameAge?.p50Ms;
  const encode = summary.captureToEncode?.p95Ms ?? summary.captureToEncode?.p50Ms ?? 0;
  const publish = summary.encodeToPublish?.p95Ms ?? summary.encodeToPublish?.p50Ms ?? 0;
  if (age !== null && age !== undefined && Number.isFinite(age)) {
    return Math.round(age + (encode || 0) + (publish || 0));
  }
  const g2g = summary.glassToGlass?.p95Ms ?? summary.glassToGlass?.p50Ms;
  return g2g !== null && g2g !== undefined && Number.isFinite(g2g) ? Math.round(g2g) : Number.POSITIVE_INFINITY;
}

export type ParetoPoint<T> = T & {
  latencyMs: number;
  qualityScore: number;
};

/** Non-dominated configs: minimize latency, maximize quality. */
export function paretoFrontier<T extends { latencyMs: number; qualityScore: number }>(points: T[]): T[] {
  return points
    .filter(
      (a) =>
        !points.some(
          (b) =>
            b !== a &&
            b.latencyMs <= a.latencyMs &&
            b.qualityScore >= a.qualityScore &&
            (b.latencyMs < a.latencyMs || b.qualityScore > a.qualityScore),
        ),
    )
    .sort((a, b) => a.latencyMs - b.latencyMs || b.qualityScore - a.qualityScore);
}

/** Rank candidates by quality per ms of latency (higher = better pareto efficiency). */
export function paretoEfficiency(latencyMs: number, qualityScore: number): number {
  if (!Number.isFinite(latencyMs) || latencyMs <= 0) return 0;
  return Math.round((qualityScore / latencyMs) * 1000) / 1000;
}

export function bestQualityAtLatency<T extends { latencyMs: number; qualityScore: number }>(
  points: T[],
  maxLatencyMs: number,
): T | null {
  return (
    points
      .filter((p) => Number.isFinite(p.latencyMs) && p.latencyMs <= maxLatencyMs)
      .sort((a, b) => b.qualityScore - a.qualityScore || a.latencyMs - b.latencyMs)[0] ?? null
  );
}
export function scorePreviewConfig(
  id: string,
  config: PreviewProtocolConfig,
  deviceSummary: Record<string, { p50Ms?: number | null; p95Ms?: number | null }>,
  streamFrameAgeP95Ms?: number | null,
  observedFps?: number | null,
): ParetoPoint<{ id: string; config: PreviewProtocolConfig }> {
  const fps = observedFps && observedFps > 0 ? observedFps : config.fps;
  return {
    id,
    config,
    qualityScore: previewQualityScore(config.width, config.height, fps),
    latencyMs: endToEndLatencyMs(deviceSummary, streamFrameAgeP95Ms),
  };
}
