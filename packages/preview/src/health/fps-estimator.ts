export interface RawPreviewHealth {
  ok: boolean;
  fps: number;
  frameCount: number;
  streaming: boolean;
  [key: string]: unknown;
}

export type PreviewFpsSource = "idle" | "frame-delta" | "stream-buffer" | "device";

export interface PreviewFpsEstimate {
  fps: number;
  deviceFps: number;
  observedFps: number;
  bufferApproxFps: number;
  fpsSource: PreviewFpsSource;
}

interface FpsSample {
  frameCount: number;
  atMs: number;
}

function roundFps(value: number) {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.round(value * 10) / 10;
}

export class PreviewFpsEstimator {
  private lastSample: FpsSample | null = null;

  update(
    health: RawPreviewHealth,
    opts: { nowMs?: number; bufferApproxFps?: number } = {},
  ): PreviewFpsEstimate {
    const nowMs = opts.nowMs ?? Date.now();
    const frameCount = Number.isFinite(Number(health.frameCount)) ? Number(health.frameCount) : 0;
    const deviceFps = roundFps(Number(health.fps || 0));
    const bufferApproxFps = roundFps(Number(opts.bufferApproxFps || 0));

    if (!health.streaming) {
      this.lastSample = null;
      return {
        fps: 0,
        deviceFps,
        observedFps: 0,
        bufferApproxFps,
        fpsSource: "idle",
      };
    }

    let observedFps = 0;
    if (this.lastSample && frameCount >= this.lastSample.frameCount) {
      const elapsedSec = Math.max(0.001, (nowMs - this.lastSample.atMs) / 1000);
      observedFps = roundFps((frameCount - this.lastSample.frameCount) / elapsedSec);
    }
    this.lastSample = { frameCount, atMs: nowMs };

    if (observedFps > 0) {
      return { fps: observedFps, deviceFps, observedFps, bufferApproxFps, fpsSource: "frame-delta" };
    }
    if (bufferApproxFps > 0) {
      return { fps: bufferApproxFps, deviceFps, observedFps, bufferApproxFps, fpsSource: "stream-buffer" };
    }
    return { fps: deviceFps, deviceFps, observedFps, bufferApproxFps, fpsSource: "device" };
  }

  reset() {
    this.lastSample = null;
  }
}

export const previewFpsEstimator = new PreviewFpsEstimator();
