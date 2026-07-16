export interface RollingPreviewFrame {
  id: number;
  ts: number;
  jpeg: Buffer;
  sizeBytes: number;
}

export interface RollingPreviewFrameStats {
  frameCount: number;
  newestFrameAt: number | null;
  oldestFrameAt: number | null;
  spanMs: number;
  totalBytes: number;
  approxFps: number;
}

export interface RollingPreviewWindow {
  frames: RollingPreviewFrame[];
  windowMs: number;
  requestedFps: number;
  actualFps: number;
  startTs: number | null;
  endTs: number | null;
}

const DEFAULT_MAX_AGE_MS = 30_000;
const DEFAULT_MAX_FRAMES = 480;
const DEFAULT_MAX_BYTES = 96 * 1024 * 1024;

export class RollingPreviewFrameBuffer {
  private frames: RollingPreviewFrame[] = [];
  private nextId = 1;
  private totalBytes = 0;

  constructor(
    private readonly maxAgeMs = DEFAULT_MAX_AGE_MS,
    private readonly maxFrames = DEFAULT_MAX_FRAMES,
    private readonly maxBytes = DEFAULT_MAX_BYTES,
  ) {}

  push(jpeg: Buffer, ts = Date.now()) {
    const frame: RollingPreviewFrame = {
      id: this.nextId++,
      ts,
      jpeg: Buffer.from(jpeg),
      sizeBytes: jpeg.length,
    };
    this.frames.push(frame);
    this.totalBytes += frame.sizeBytes;
    this.prune(ts);
  }

  latest(maxAgeMs = 5_000): RollingPreviewFrame | null {
    const latest = this.frames.at(-1);
    if (!latest || Date.now() - latest.ts > maxAgeMs) return null;
    return latest;
  }

  selectWindow(opts: { windowMs: number; fps: number; now?: number }): RollingPreviewWindow {
    const now = opts.now ?? Date.now();
    const windowMs = Math.max(250, opts.windowMs);
    const requestedFps = Math.max(0.2, opts.fps);
    const minTs = now - windowMs;
    const candidates = this.frames.filter((frame) => frame.ts >= minTs && frame.ts <= now);
    if (!candidates.length) {
      return { frames: [], windowMs, requestedFps, actualFps: 0, startTs: null, endTs: null };
    }

    const minIntervalMs = 1000 / requestedFps;
    const selected: RollingPreviewFrame[] = [];
    let lastSelectedTs = -Infinity;
    for (const frame of candidates) {
      if (frame.ts - lastSelectedTs >= minIntervalMs || frame === candidates.at(-1)) {
        selected.push(frame);
        lastSelectedTs = frame.ts;
      }
    }

    const startTs = selected[0]?.ts ?? null;
    const endTs = selected.at(-1)?.ts ?? null;
    const spanMs = startTs !== null && endTs !== null ? Math.max(1, endTs - startTs) : 0;
    return {
      frames: selected,
      windowMs,
      requestedFps,
      actualFps: selected.length > 1 ? (selected.length - 1) / (spanMs / 1000) : selected.length,
      startTs,
      endTs,
    };
  }

  stats(now = Date.now()): RollingPreviewFrameStats {
    this.prune(now);
    const oldest = this.frames[0] ?? null;
    const newest = this.frames.at(-1) ?? null;
    const spanMs = oldest && newest ? Math.max(0, newest.ts - oldest.ts) : 0;
    return {
      frameCount: this.frames.length,
      newestFrameAt: newest?.ts ?? null,
      oldestFrameAt: oldest?.ts ?? null,
      spanMs,
      totalBytes: this.totalBytes,
      approxFps: this.frames.length > 1 && spanMs > 0 ? (this.frames.length - 1) / (spanMs / 1000) : 0,
    };
  }

  clear() {
    this.frames = [];
    this.totalBytes = 0;
  }

  private prune(now = Date.now()) {
    const minTs = now - this.maxAgeMs;
    while (this.frames.length > 0) {
      const head = this.frames[0];
      if (!head || head.ts >= minTs) break;
      this.frames.shift();
      this.totalBytes -= head.sizeBytes;
    }
    while (this.frames.length > this.maxFrames) {
      const removed = this.frames.shift();
      if (!removed) break;
      this.totalBytes -= removed.sizeBytes;
    }
    while (this.frames.length && this.totalBytes > this.maxBytes) {
      const removed = this.frames.shift();
      if (!removed) break;
      this.totalBytes -= removed.sizeBytes;
    }
  }
}
