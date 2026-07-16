import type { PreviewFrameTrace, PreviewPipelineStage } from "@openlabos/preview";
import {
  getLastStreamFrameMeta,
  getStreamFrameAgeMs,
  RollingLatencyRecorder,
} from "@openlabos/preview";

const recorder = new RollingLatencyRecorder(300);
let activeProfileId: string | undefined;

export function getPreviewPipelineRecorder() {
  return recorder;
}

export function setPreviewPipelineProfile(profileId: string | undefined) {
  activeProfileId = profileId;
}

export function recordHostHealthRtt(rttMs: number) {
  recorder.recordStage("hostHealthRtt", rttMs);
}

export function recordHostFrameFetchRtt(rttMs: number) {
  recorder.recordStage("hostFrameFetchRtt", rttMs);
}

export function recordClientDisplayMs(displayMs: number, glassToGlassMs?: number) {
  recorder.recordStage("clientDisplay", displayMs);
  if (glassToGlassMs !== undefined && Number.isFinite(glassToGlassMs)) {
    recorder.recordStage("glassToGlass", glassToGlassMs);
  }
  recorder.recordTrace({
    recordedAtMs: Date.now(),
    clientDisplayMs: displayMs,
    glassToGlassMs: glassToGlassMs ?? null,
    deviceFrameAgeMs: getStreamFrameAgeMs(),
    ...getLastStreamFrameMeta(),
  });
}

export async function mergeDeviceMetricsSnapshot(
  deviceMetrics: Record<string, unknown> | null | undefined,
) {
  if (!deviceMetrics || deviceMetrics.ok !== true) return;
  const lastTrace = deviceMetrics.lastTrace as Record<string, unknown> | undefined;
  if (lastTrace && typeof lastTrace === "object") {
    recorder.recordTrace({
      recordedAtMs: Date.now(),
      frameSeq: typeof lastTrace.frameSeq === "number" ? lastTrace.frameSeq : undefined,
      captureToEncodeMs: numericOrNull(lastTrace.captureToEncodeMs),
      encodeToPublishMs: numericOrNull(lastTrace.encodeToPublishMs),
      deviceFrameAgeMs: numericOrNull(lastTrace.deviceFrameAgeMs),
      glassToGlassMs: numericOrNull(lastTrace.glassToGlassMs),
      encodeMode: typeof lastTrace.encodeMode === "string" ? lastTrace.encodeMode : undefined,
      transport: typeof lastTrace.transport === "string" ? lastTrace.transport : undefined,
      width: typeof lastTrace.width === "number" ? lastTrace.width : undefined,
      height: typeof lastTrace.height === "number" ? lastTrace.height : undefined,
    });
  }
  const stages = deviceMetrics.stages;
  if (Array.isArray(stages)) {
    for (const stage of stages) {
      if (!stage || typeof stage !== "object") continue;
      const id = (stage as { stage?: string }).stage;
      const lastMs = numericOrNull((stage as { lastMs?: unknown }).lastMs);
      if (id && lastMs !== null) {
        const mapped = DEVICE_STAGE_MAP[id];
        if (mapped) recorder.recordStage(mapped, lastMs);
      }
    }
  }
}

const DEVICE_STAGE_MAP: Record<string, PreviewPipelineStage> = {
  captureToEncode: "captureToEncode",
  encodeToPublish: "encodeToPublish",
  deviceFrameAge: "deviceFrameAge",
  glassToGlass: "glassToGlass",
};

function numericOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function ingestStreamFrameMeta(extra: Partial<PreviewFrameTrace> = {}) {
  const meta = getLastStreamFrameMeta();
  const trace: PreviewFrameTrace = {
    recordedAtMs: Date.now(),
    deviceFrameAgeMs: getStreamFrameAgeMs(),
    ...meta,
    ...extra,
  };
  recorder.recordTrace(trace);
}

export function previewPipelineSnapshot(extra: Record<string, unknown> = {}) {
  return recorder.snapshot({
    profileId: activeProfileId,
    ...extra,
  });
}

export function resetPreviewPipelineRecorderForTests() {
  recorder.reset();
  activeProfileId = undefined;
}
