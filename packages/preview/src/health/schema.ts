import { z } from "zod";
import { PreviewEncodeModeSchema, PreviewTransportSchema } from "../config/schema.js";

export const PreviewHealthSchema = z
  .object({
    ok: z.boolean().optional(),
    fps: z.number().optional(),
    deviceFps: z.number().optional(),
    observedFps: z.number().optional(),
    bufferApproxFps: z.number().optional(),
    fpsSource: z.enum(["idle", "frame-delta", "stream-buffer", "device"]).optional(),
    frameCount: z.number().optional(),
    streaming: z.boolean().optional(),
    frameReachable: z.boolean().optional(),
    frameBytes: z.number().optional(),
    previewReady: z.boolean().optional(),
    previewStatus: z
      .enum(["ready", "server_unreachable", "not_streaming", "waiting_for_frames", "frame_unreachable"])
      .optional(),
    previewDetail: z.string().optional(),
    previewServerReachable: z.boolean().optional(),
    previewHealthError: z.string().optional(),
    previewFrameError: z.string().optional(),
    streamFrameAgeMs: z.number().nullable().optional(),
    encodeMode: PreviewEncodeModeSchema.optional(),
    transport: PreviewTransportSchema.optional(),
    encodeLatencyMs: z.number().optional(),
    lastFrameAtMs: z.number().optional(),
    recording: z.boolean().optional(),
    activeVideoPath: z.string().optional(),
    lastVideoPath: z.string().optional(),
  })
  .passthrough();

export type PreviewHealth = z.infer<typeof PreviewHealthSchema>;

export const PreviewMetricsSchema = z.object({
  ok: z.boolean(),
  streaming: z.boolean(),
  encodeMode: PreviewEncodeModeSchema,
  transport: PreviewTransportSchema,
  width: z.number().int(),
  height: z.number().int(),
  fps: z.number(),
  frameCount: z.number().int(),
  lastCaptureToEncodeMs: z.number().nullable(),
  lastEncodeToPublishMs: z.number().nullable(),
  lastPublishToClientMs: z.number().nullable(),
  lastGlassToGlassMs: z.number().nullable(),
  avgEncodeMs: z.number().nullable(),
  avgTransportMs: z.number().nullable(),
  streamFrameAgeMs: z.number().nullable(),
  updatedAtMs: z.number().int(),
});

export type PreviewMetrics = z.infer<typeof PreviewMetricsSchema>;

export function parsePreviewHealth(input: unknown): PreviewHealth {
  return PreviewHealthSchema.parse(input);
}

export function parsePreviewMetrics(input: unknown): PreviewMetrics {
  return PreviewMetricsSchema.parse(input);
}
