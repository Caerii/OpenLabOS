import { z } from "zod";

/** Ordered pipeline stages from sensor to browser. */
export const PreviewPipelineStageSchema = z.enum([
  "captureToEncode",
  "encodeToPublish",
  "deviceFrameAge",
  "hostIngest",
  "hostHealthRtt",
  "hostFrameFetchRtt",
  "clientDisplay",
  "glassToGlass",
]);

export type PreviewPipelineStage = z.infer<typeof PreviewPipelineStageSchema>;

export const PreviewFrameTraceSchema = z.object({
  frameSeq: z.number().int().optional(),
  publishedAtMs: z.number().int().optional(),
  captureToEncodeMs: z.number().nullable().optional(),
  encodeToPublishMs: z.number().nullable().optional(),
  deviceFrameAgeMs: z.number().nullable().optional(),
  hostIngestMs: z.number().nullable().optional(),
  hostHealthRttMs: z.number().nullable().optional(),
  hostFrameFetchRttMs: z.number().nullable().optional(),
  clientDisplayMs: z.number().nullable().optional(),
  glassToGlassMs: z.number().nullable().optional(),
  encodeMode: z.string().optional(),
  transport: z.string().optional(),
  width: z.number().int().optional(),
  height: z.number().int().optional(),
  recordedAtMs: z.number().int(),
});

export type PreviewFrameTrace = z.infer<typeof PreviewFrameTraceSchema>;

export const PreviewStageStatsSchema = z.object({
  stage: PreviewPipelineStageSchema,
  samples: z.number().int(),
  lastMs: z.number().nullable(),
  avgMs: z.number().nullable(),
  p50Ms: z.number().nullable(),
  p95Ms: z.number().nullable(),
  maxMs: z.number().nullable(),
});

export type PreviewStageStats = z.infer<typeof PreviewStageStatsSchema>;

export const PreviewPipelineSnapshotSchema = z.object({
  ok: z.boolean(),
  profileId: z.string().optional(),
  encodeMode: z.string().optional(),
  transport: z.string().optional(),
  width: z.number().int().optional(),
  height: z.number().int().optional(),
  fps: z.number().optional(),
  frameCount: z.number().int().optional(),
  updatedAtMs: z.number().int(),
  stages: z.array(PreviewStageStatsSchema),
  lastTrace: PreviewFrameTraceSchema.nullable(),
  recentTraces: z.array(PreviewFrameTraceSchema).optional(),
});

export type PreviewPipelineSnapshot = z.infer<typeof PreviewPipelineSnapshotSchema>;

export const MJPEG_FRAME_TIME_HEADER = "X-LabOS-Frame-Time";
export const MJPEG_CAPTURE_ENCODE_HEADER = "X-LabOS-Capture-To-Encode-Ms";
export const MJPEG_ENCODE_PUBLISH_HEADER = "X-LabOS-Encode-To-Publish-Ms";
export const MJPEG_FRAME_SEQ_HEADER = "X-LabOS-Frame-Seq";
