import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { previewFrameBuffer } from "../../preview/rolling-frame-buffer.js";
import { getKitchenDataPaths } from "./run-store.js";

export interface MaterializedPreviewChunk {
  id: string;
  chunkRef: string;
  videoFilePath: string;
  indexRef: string;
  frameCount: number;
  requestedFps: number;
  actualFps: number;
  startTs: number;
  endTs: number;
  durationMs: number;
}

function safePart(value: string | number | undefined) {
  return String(value || "x").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 80);
}

function runFfmpeg(args: string[], timeoutMs = 30_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", args, { windowsHide: true });
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("ffmpeg timed out while materializing live preview chunk"));
    }, timeoutMs);

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg failed with exit code ${code}: ${stderr.slice(-1200)}`));
    });
  });
}

export async function materializeRecentPreviewChunk(opts: {
  runId?: string;
  protocolId: string;
  stepNumber: number;
  windowMs: number;
  fps: number;
  minFrames?: number;
}): Promise<MaterializedPreviewChunk | null> {
  if (!opts.runId) return null;
  const window = previewFrameBuffer.selectWindow({ windowMs: opts.windowMs, fps: opts.fps });
  const minFrames = opts.minFrames ?? Math.max(3, Math.ceil(opts.fps * 1.5));
  if (window.frames.length < minFrames || window.startTs === null || window.endTs === null) {
    return null;
  }

  const paths = getKitchenDataPaths();
  const id = [
    safePart(opts.runId || opts.protocolId),
    `step${safePart(opts.stepNumber)}`,
    String(Date.now()),
  ].join("-");
  const chunkDir = path.join(paths.chunksDir, id);
  await fs.mkdir(chunkDir, { recursive: true });

  for (let i = 0; i < window.frames.length; i++) {
    const filename = `frame_${String(i + 1).padStart(4, "0")}.jpg`;
    await fs.writeFile(path.join(chunkDir, filename), window.frames[i].jpeg);
  }

  const videoFilePath = path.join(chunkDir, "chunk.mp4");
  const inputPattern = path.join(chunkDir, "frame_%04d.jpg");
  await runFfmpeg([
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-framerate",
    String(Math.max(0.2, opts.fps)),
    "-i",
    inputPattern,
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    videoFilePath,
  ]);

  const index = {
    id,
    runId: opts.runId,
    protocolId: opts.protocolId,
    stepNumber: opts.stepNumber,
    createdAt: new Date().toISOString(),
    frameCount: window.frames.length,
    requestedFps: window.requestedFps,
    actualFps: window.actualFps,
    startTs: window.startTs,
    endTs: window.endTs,
    durationMs: window.endTs - window.startTs,
    frameIds: window.frames.map((frame) => frame.id),
    chunkRef: `kitchen/chunks/${id}/chunk.mp4`,
  };
  await fs.writeFile(path.join(chunkDir, "index.json"), JSON.stringify(index, null, 2));

  return {
    id,
    chunkRef: index.chunkRef,
    videoFilePath,
    indexRef: `kitchen/chunks/${id}/index.json`,
    frameCount: window.frames.length,
    requestedFps: window.requestedFps,
    actualFps: window.actualFps,
    startTs: window.startTs,
    endTs: window.endTs,
    durationMs: window.endTs - window.startTs,
  };
}
