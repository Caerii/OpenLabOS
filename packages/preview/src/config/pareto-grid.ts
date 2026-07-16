import { type PreviewProtocolConfig, PreviewProtocolConfigSchema } from "./schema.js";

function h264(
  id: string,
  width: number,
  height: number,
  fps: number,
  h264Bitrate: number,
  h264KeyframeIntervalSec: number,
): { id: string; config: PreviewProtocolConfig } {
  return {
    id,
    config: PreviewProtocolConfigSchema.parse({
      encodeMode: "hardware-h264",
      transport: "h264-annexb-http",
      width,
      height,
      fps,
      h264Bitrate,
      h264KeyframeIntervalSec,
      lowLatency: true,
    }),
  };
}

function mjpeg(
  id: string,
  width: number,
  height: number,
  fps: number,
  jpegQuality: number,
): { id: string; config: PreviewProtocolConfig } {
  return {
    id,
    config: PreviewProtocolConfigSchema.parse({
      encodeMode: "software-jpeg",
      transport: "mjpeg-http",
      width,
      height,
      fps,
      jpegQuality,
      lowLatency: true,
    }),
  };
}

/** Baseline lattice — fast nightly sweep (~7 points). */
export const PREVIEW_PARETO_CANDIDATES: Array<{ id: string; config: PreviewProtocolConfig }> = [
  mjpeg("mjpeg-480x360-q45-6fps", 480, 360, 6, 45),
  mjpeg("mjpeg-640x480-q42-12fps", 640, 480, 12, 42),
  mjpeg("mjpeg-640x480-q38-15fps", 640, 480, 15, 38),
  mjpeg("mjpeg-1280x720-q50-12fps", 1280, 720, 12, 50),
  h264("h264-640x360-1mbps-30fps", 640, 360, 30, 1_000_000, 0.5),
  h264("h264-854x480-1.5mbps-30fps", 854, 480, 30, 1_500_000, 0.5),
  h264("h264-1280x720-2mbps-30fps", 1280, 720, 30, 2_000_000, 0.5),
];

/** Extended lattice — `LABOS_PARETO_DEEP=1` (~28 points). */
export const PREVIEW_PARETO_DEEP_CANDIDATES: Array<{ id: string; config: PreviewProtocolConfig }> = [
  ...PREVIEW_PARETO_CANDIDATES,
  // MJPEG: push quality at same target latency band (~90–110ms)
  mjpeg("mjpeg-640x480-q35-18fps", 640, 480, 18, 35),
  mjpeg("mjpeg-640x480-q32-20fps", 640, 480, 20, 32),
  mjpeg("mjpeg-960x540-q38-15fps", 960, 540, 15, 38),
  mjpeg("mjpeg-1280x720-q42-15fps", 1280, 720, 15, 42),
  mjpeg("mjpeg-1280x720-q35-18fps", 1280, 720, 18, 35),
  mjpeg("mjpeg-1280x720-q32-12fps", 1280, 720, 12, 32),
  // H.264: GOP + bitrate sweep at 720p30
  h264("h264-1280x720-1.5mbps-gop0.25-30fps", 1280, 720, 30, 1_500_000, 0.25),
  h264("h264-1280x720-2mbps-gop0.25-30fps", 1280, 720, 30, 2_000_000, 0.25),
  h264("h264-1280x720-2.5mbps-gop0.25-30fps", 1280, 720, 30, 2_500_000, 0.25),
  h264("h264-1280x720-3mbps-gop0.25-30fps", 1280, 720, 30, 3_000_000, 0.25),
  h264("h264-1280x720-3.5mbps-gop0.5-30fps", 1280, 720, 30, 3_500_000, 0.5),
  h264("h264-1280x720-4mbps-gop0.5-30fps", 1280, 720, 30, 4_000_000, 0.5),
  h264("h264-1280x720-2.5mbps-gop0.1-30fps", 1280, 720, 30, 2_500_000, 0.1),
  // H.264: mid-tier resolution sweeps
  h264("h264-854x480-2mbps-gop0.25-30fps", 854, 480, 30, 2_000_000, 0.25),
  h264("h264-854x480-2.5mbps-gop0.25-30fps", 854, 480, 30, 2_500_000, 0.25),
  h264("h264-640x360-1.5mbps-gop0.25-30fps", 640, 360, 30, 1_500_000, 0.25),
  h264("h264-640x360-2mbps-gop0.25-30fps", 640, 360, 30, 2_000_000, 0.25),
  // H.264: fps/quality trade (same pixels, lower fps = potentially lower latency)
  h264("h264-1280x720-2mbps-24fps", 1280, 720, 24, 2_000_000, 0.25),
  h264("h264-1280x720-3mbps-24fps", 1280, 720, 24, 3_000_000, 0.25),
];

export function resolveParetoCandidates(deep = false): Array<{ id: string; config: PreviewProtocolConfig }> {
  return deep ? PREVIEW_PARETO_DEEP_CANDIDATES : PREVIEW_PARETO_CANDIDATES;
}
