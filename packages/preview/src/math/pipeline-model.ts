/**
 * Mathematical model of the preview pipeline for pareto tuning.
 *
 * Treat each stage as a non-negative random variable L_i (ms). End-to-end latency:
 *   L_e2e = Σ L_i  (conditional independence approximation for tuning)
 *
 * Quality proxy (operational): Q = (W × H × F) / 10^6  [megapixel-fps]
 * Pareto set: configs c where ∄ c' with L_e2e(c') ≤ L_e2e(c) and Q(c') ≥ Q(c) strict on one axis.
 */

export type StageDistribution = {
  meanMs: number;
  p95Ms: number;
  varianceMs2?: number;
};

export type PipelineModel = {
  captureToEncode: StageDistribution;
  encodeToPublish: StageDistribution;
  publishToClient: StageDistribution;
  decodeToDisplay?: StageDistribution;
};

/** Sum of stage means / p95 (conservative e2e bound). */
export function modelEndToEndMs(model: PipelineModel, useP95 = true): number {
  const pick = (s: StageDistribution) => (useP95 ? s.p95Ms : s.meanMs);
  return Math.round(
    pick(model.captureToEncode) +
      pick(model.encodeToPublish) +
      pick(model.publishToClient) +
      (model.decodeToDisplay ? pick(model.decodeToDisplay) : 0),
  );
}

/** Megapixel×fps — proportional to pixel rate (information throughput lower bound). */
export function pixelRateScore(width: number, height: number, fps: number): number {
  return (width * height * fps) / 1_000_000;
}

/**
 * Rate–distortion style efficiency: quality per unit latency.
 * Higher η implies better pareto position for fixed hardware.
 */
export function paretoEfficiencyScore(qualityScore: number, latencyMs: number): number {
  if (!Number.isFinite(latencyMs) || latencyMs <= 0) return 0;
  return qualityScore / latencyMs;
}

/**
 * Representational cost hierarchy (encode complexity order):
 *   raw YUV > JPEG (DCT+quantize) > H.264 inter (motion+transform+entropy)
 * but H.264 uses hardware surface-in → lower L_captureToEncode on supported SoCs.
 */
export const REPRESENTATION_LATENCY_ORDER = [
  "hardware-h264-surface",
  "libjpeg-turbo-neon",
  "software-jpeg-cpu",
  "mjpeg-multipart-framing",
] as const;

/** Transport framing overhead model (bytes on wire per frame, approximate). */
export function transportFramingOverheadBytes(transport: string, payloadBytes: number): number {
  switch (transport) {
    case "mjpeg-http":
      return 120 + payloadBytes * 0.002;
    case "h264-annexb-http":
      return 4 + payloadBytes * 0.001;
    case "h264-fmp4-http":
      return 32 + payloadBytes * 0.008;
    case "webrtc":
      return 48 + payloadBytes * 0.012;
    default:
      return payloadBytes * 0.01;
  }
}
