import type { ERInputOptions } from "../../../../api";
import type { DemoMode, KitchenDemoSampleWithFrames, SourceVideoGroup } from "./types";

export const EST_VISUAL_TOKENS_PER_FRAME = 260;
export const EST_TEXT_OVERHEAD_TOKENS = 220;
export const PRIMITIVE_SUITE_CALLS = 11;

export function clipOpts(sample: KitchenDemoSampleWithFrames, fps: number): ERInputOptions {
  return {
    videoUrl: sample.videoUrl,
    videoStartOffsetSec: sample.clipStartSec,
    videoEndOffsetSec: sample.clipEndSec,
    videoFps: fps || sample.targetFps || 2,
    thinkingLevel: "medium",
  };
}

export async function loadStaticKitchenSamples() {
  const res = await fetch("/demo/kitchen-samples.json");
  if (!res.ok) throw new Error(`Static demo manifest unavailable: HTTP ${res.status}`);
  const data = await res.json();
  return {
    configured: Array.isArray(data.samples) && data.samples.length > 0,
    samples: (data.samples || []) as KitchenDemoSampleWithFrames[],
    error: data.samples?.length ? "" : "No static demo samples found.",
  };
}

export function clipTimeLabel(sample: KitchenDemoSampleWithFrames) {
  return `${sample.clipStartSec.toFixed(1)}s-${sample.clipEndSec.toFixed(1)}s`;
}

export function compactTitle(title: string) {
  return title.length > 76 ? `${title.slice(0, 73)}...` : title;
}

export function sourceKey(sample: KitchenDemoSampleWithFrames) {
  return sample.sourceId || sample.originalVideoUrl || sample.title || sample.sampleId;
}

export function sourceWindowLabel(group: SourceVideoGroup) {
  return `${group.startSec.toFixed(1)}s-${group.endSec.toFixed(1)}s covered`;
}

export function absoluteUrl(url?: string) {
  if (!url) return undefined;
  if (/^https?:\/\//i.test(url)) return url;
  return `${window.location.origin}${url.startsWith("/") ? url : `/${url}`}`;
}

export function estimatedFrameCount(sample: KitchenDemoSampleWithFrames, fps: number) {
  const sampled = sample.frameUrls?.length || sample.frameCount || 0;
  const durationFrames = Math.ceil(Math.max(0.5, sample.clipDurationSec || (sample.clipEndSec - sample.clipStartSec)) * (fps || sample.targetFps || 2));
  return Math.max(sampled, durationFrames, 1);
}

export function estimateTokensForSegment(sample: KitchenDemoSampleWithFrames, fps: number, calls = 1) {
  const frames = estimatedFrameCount(sample, fps);
  const visualTokens = frames * EST_VISUAL_TOKENS_PER_FRAME;
  const textTokens = Math.ceil(
    [
      sample.title,
      sample.stepHint,
      sample.labelHint,
      sample.notes,
      sample.protocolId,
    ].filter(Boolean).join(" ").length / 4,
  ) + EST_TEXT_OVERHEAD_TOKENS;
  return {
    frames,
    perCall: visualTokens + textTokens,
    total: (visualTokens + textTokens) * Math.max(1, calls),
    visualTokens,
    textTokens,
  };
}

export function formatTokens(tokens: number) {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}k`;
  return String(Math.round(tokens));
}

export function tokenBudget(samples: KitchenDemoSampleWithFrames[], fps: number, calls = 1) {
  return samples.reduce((sum, sample) => sum + estimateTokensForSegment(sample, fps, calls).total, 0);
}

export function previewUrlForSegment(sample: KitchenDemoSampleWithFrames, demoMode: DemoMode) {
  return demoMode === "api"
    ? sample.previewVideoUrl || sample.videoUrl
    : sample.videoUrl || sample.previewVideoUrl;
}

export function buildSourceGroups(samples: KitchenDemoSampleWithFrames[]) {
  const groups = new Map<string, SourceVideoGroup>();
  for (const sample of samples) {
    const key = sourceKey(sample);
    const existing = groups.get(key);
    if (existing) {
      existing.samples.push(sample);
      existing.startSec = Math.min(existing.startSec, sample.clipStartSec);
      existing.endSec = Math.max(existing.endSec, sample.clipEndSec);
      existing.frameCount += sample.frameUrls?.length || sample.frameCount || 0;
      existing.thumbnailUrl ||= sample.frameUrls?.[0];
      existing.originalVideoUrl ||= sample.originalVideoUrl;
      continue;
    }
    groups.set(key, {
      sourceId: key,
      title: sample.title,
      uploader: sample.uploader,
      protocolId: sample.protocolId,
      stepHint: sample.stepHint,
      originalVideoUrl: sample.originalVideoUrl,
      notes: sample.notes,
      samples: [sample],
      startSec: sample.clipStartSec,
      endSec: sample.clipEndSec,
      frameCount: sample.frameUrls?.length || sample.frameCount || 0,
      thumbnailUrl: sample.frameUrls?.[0],
    });
  }
  return Array.from(groups.values()).map((group) => ({
    ...group,
    samples: group.samples.sort((a, b) => a.clipStartSec - b.clipStartSec),
  }));
}
