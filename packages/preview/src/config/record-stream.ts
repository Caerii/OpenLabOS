import { z } from "zod";
import { PREVIEW_PROFILES, type PreviewProfileId, type PreviewProtocolConfig } from "./schema.js";

/** Local MP4 capture settings (MediaRecorder) — independent of preview protocol stream dims. */
export const RecordStreamVideoSettingsSchema = z.object({
  video_width: z.number().int().min(320).max(3840).default(1280),
  video_height: z.number().int().min(240).max(2160).default(720),
  video_fps: z.number().int().min(1).max(60).default(15),
  video_bitrate: z.number().int().min(1_000_000).max(50_000_000).default(3_000_000),
  camera_keep_alive_ms: z.number().int().min(1_000).max(300_000).default(60_000),
});

export type RecordStreamVideoSettings = z.infer<typeof RecordStreamVideoSettingsSchema>;

export type RecordStreamProfile = {
  label: string;
  description: string;
  /** Preview / live stream protocol config. */
  previewProfileId: PreviewProfileId;
  config: PreviewProtocolConfig;
  video: RecordStreamVideoSettings;
};

/** Aligned record+stream operating points for sustained dual-encode on wearables. */
export const RECORD_STREAM_PROFILES = {
  recordAndStreamSustained: {
    label: "Record + stream (sustained)",
    description:
      "HW H.264 preview 720p24 + MP4 720p15 @ 3Mbps. Preview-first workflow; sensor masters at video_fps during record.",
    previewProfileId: "lowLatencySustained",
    config: PREVIEW_PROFILES.lowLatencySustained.config,
    video: RecordStreamVideoSettingsSchema.parse({
      video_width: 1280,
      video_height: 720,
      video_fps: 15,
      video_bitrate: 3_000_000,
      camera_keep_alive_ms: 60_000,
    }),
  },
  recordAndStreamCompact: {
    label: "Record + stream (compact)",
    description: "HW H.264 854×480 @ 24fps stream + 720p12 record — lower dual-encode thermal load.",
    previewProfileId: "h264Fast",
    config: PREVIEW_PROFILES.h264Fast.config,
    video: RecordStreamVideoSettingsSchema.parse({
      video_width: 1280,
      video_height: 720,
      video_fps: 12,
      video_bitrate: 2_500_000,
      camera_keep_alive_ms: 60_000,
    }),
  },
  recordAndStreamBurst: {
    label: "Record + stream (burst)",
    description: "Lab-only: 720p30 stream + 720p15 record. Expect thermal governor / shutdown without charging.",
    previewProfileId: "lowLatency",
    config: PREVIEW_PROFILES.lowLatency.config,
    video: RecordStreamVideoSettingsSchema.parse({
      video_width: 1280,
      video_height: 720,
      video_fps: 15,
      video_bitrate: 4_000_000,
      camera_keep_alive_ms: 60_000,
    }),
  },
} as const satisfies Record<string, RecordStreamProfile>;

export type RecordStreamProfileId = keyof typeof RECORD_STREAM_PROFILES;

export function resolveRecordStreamProfile(profileId: string): RecordStreamProfile | null {
  if (profileId in RECORD_STREAM_PROFILES) {
    return RECORD_STREAM_PROFILES[profileId as RecordStreamProfileId];
  }
  return null;
}

/** Lab settings JSON for core service / kitchen power profile. */
export function recordStreamLabSettings(profile: RecordStreamProfile) {
  return {
    ...profile.video,
    stream_width: profile.config.width,
    stream_height: profile.config.height,
    stream_fps: profile.config.fps,
    stream_jpeg_quality: profile.config.jpegQuality,
  };
}
