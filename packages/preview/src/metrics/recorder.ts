import type { PreviewFrameTrace, PreviewPipelineStage, PreviewStageStats } from "./pipeline-stages.js";

function percentile(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index] ?? null;
}

export class RollingLatencyRecorder {
  private readonly maxSamples: number;
  private readonly buckets = new Map<PreviewPipelineStage, number[]>();
  private lastTrace: PreviewFrameTrace | null = null;
  private recentTraces: PreviewFrameTrace[] = [];

  constructor(maxSamples = 240) {
    this.maxSamples = maxSamples;
  }

  recordStage(stage: PreviewPipelineStage, valueMs: number) {
    if (!Number.isFinite(valueMs) || valueMs < 0) return;
    const bucket = this.buckets.get(stage) || [];
    bucket.push(Math.round(valueMs));
    while (bucket.length > this.maxSamples) bucket.shift();
    this.buckets.set(stage, bucket);
  }

  recordTrace(trace: PreviewFrameTrace) {
    this.lastTrace = trace;
    this.recentTraces.push(trace);
    while (this.recentTraces.length > 64) this.recentTraces.shift();

    const pairs: Array<[PreviewPipelineStage, number | null | undefined]> = [
      ["captureToEncode", trace.captureToEncodeMs],
      ["encodeToPublish", trace.encodeToPublishMs],
      ["deviceFrameAge", trace.deviceFrameAgeMs],
      ["hostIngest", trace.hostIngestMs],
      ["hostHealthRtt", trace.hostHealthRttMs],
      ["hostFrameFetchRtt", trace.hostFrameFetchRttMs],
      ["clientDisplay", trace.clientDisplayMs],
      ["glassToGlass", trace.glassToGlassMs],
    ];
    for (const [stage, value] of pairs) {
      if (value !== null && value !== undefined && Number.isFinite(value)) {
        this.recordStage(stage, value);
      }
    }
  }

  stageStats(stage: PreviewPipelineStage): PreviewStageStats {
    const values = [...(this.buckets.get(stage) || [])].sort((a, b) => a - b);
    const sum = values.reduce((acc, value) => acc + value, 0);
    return {
      stage,
      samples: values.length,
      lastMs: values.length ? values[values.length - 1]! : null,
      avgMs: values.length ? Math.round(sum / values.length) : null,
      p50Ms: percentile(values, 50),
      p95Ms: percentile(values, 95),
      maxMs: values.length ? values[values.length - 1]! : null,
    };
  }

  snapshot(extra: Record<string, unknown> = {}) {
    const stages: PreviewPipelineStage[] = [
      "captureToEncode",
      "encodeToPublish",
      "deviceFrameAge",
      "hostIngest",
      "hostHealthRtt",
      "hostFrameFetchRtt",
      "clientDisplay",
      "glassToGlass",
    ];
    return {
      ok: true,
      updatedAtMs: Date.now(),
      stages: stages.map((stage) => this.stageStats(stage)),
      lastTrace: this.lastTrace,
      recentTraces: [...this.recentTraces],
      ...extra,
    };
  }

  reset() {
    this.buckets.clear();
    this.lastTrace = null;
    this.recentTraces = [];
  }
}
