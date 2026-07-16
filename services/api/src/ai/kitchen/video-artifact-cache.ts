import crypto from "crypto";
import fs from "fs";
import path from "path";
import { adb } from "../../adb.js";
import {
  kitchenArtifactUrl,
  resolveKitchenArtifactRef,
} from "./artifact-refs.js";

const ANDROID_STORAGE_LABOS_MEDIA_ROOT = "/storage/emulated/0/LabOS/media";
const SDCARD_LABOS_MEDIA_ROOT = "/sdcard/LabOS/media";
const cacheJobs = new Map<string, Promise<KitchenNativeVideoArtifact>>();
let cacheQueue: Promise<unknown> = Promise.resolve();

export interface KitchenNativeVideoArtifact {
  devicePath: string;
  name: string;
  ref: string;
  url: string;
  downloadUrl: string;
  status: "cached" | "pending" | "missing" | "error";
  size?: number;
  cachedAt?: string;
  error?: string;
}

function normalizeNativeVideoPath(videoPath: string) {
  const normalized = path.posix.normalize(videoPath);
  if (normalized.startsWith(`${ANDROID_STORAGE_LABOS_MEDIA_ROOT}/`)) {
    return `${SDCARD_LABOS_MEDIA_ROOT}${normalized.slice(ANDROID_STORAGE_LABOS_MEDIA_ROOT.length)}`;
  }
  return normalized;
}

function assertNativeVideoPath(videoPath: string) {
  const normalized = normalizeNativeVideoPath(videoPath);
  if (!normalized.startsWith(`${SDCARD_LABOS_MEDIA_ROOT}/`)) {
    throw new Error("Native video path must be under LabOS media");
  }
  return normalized;
}

function nativeVideoPathError(videoPath: string) {
  try {
    assertNativeVideoPath(videoPath);
    return null;
  } catch (error: any) {
    return error?.message || String(error);
  }
}

function safeCacheRunId(runId: string) {
  return runId.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 96) || "run";
}

function videoCacheRef(runId: string, devicePath: string) {
  const name = path.posix.basename(devicePath).replace(/[^A-Za-z0-9_.-]/g, "_");
  const hash = crypto.createHash("sha1").update(devicePath).digest("hex").slice(0, 12);
  return `kitchen/native-videos/${safeCacheRunId(runId)}/${hash}-${name}`;
}

function artifactFor(runId: string, devicePath: string, status: KitchenNativeVideoArtifact["status"], opts: Partial<KitchenNativeVideoArtifact> = {}) {
  const normalized = normalizeNativeVideoPath(devicePath);
  const ref = videoCacheRef(runId, normalized);
  return {
    devicePath: normalized,
    name: path.posix.basename(normalized),
    ref,
    url: kitchenArtifactUrl(ref),
    downloadUrl: kitchenArtifactUrl(ref, { download: true }),
    status,
    ...opts,
  } satisfies KitchenNativeVideoArtifact;
}

function localPathForRef(ref: string) {
  return resolveKitchenArtifactRef(ref, { allowedKinds: ["native_video"] }).localPath;
}

async function moveFileIntoCache(sourcePath: string, localPath: string) {
  await fs.promises.mkdir(path.dirname(localPath), { recursive: true });
  if (path.resolve(sourcePath) === path.resolve(localPath)) {
    return;
  }
  const tempPath = `${localPath}.${process.pid}.${Date.now()}.tmp`;
  try {
    await fs.promises.copyFile(sourcePath, tempPath);
    await fs.promises.rm(localPath, { force: true }).catch(() => {});
    await fs.promises.rename(tempPath, localPath);
  } catch (error) {
    await fs.promises.unlink(tempPath).catch(() => {});
    throw error;
  }
}

function enqueueCacheJob<T>(task: () => Promise<T>): Promise<T> {
  const job = cacheQueue.then(task, task);
  cacheQueue = job.catch(() => {});
  return job;
}

export function nativeVideoPathsForManifest(manifest: any): string[] {
  const paths = new Set<string>();
  for (const attempt of manifest?.stepAttempts || []) {
    for (const videoPath of attempt?.nativeVideoPaths || []) {
      if (typeof videoPath === "string" && videoPath) paths.add(normalizeNativeVideoPath(videoPath));
    }
  }
  for (const segment of manifest?.stepSegments || []) {
    const nativeRecording = segment?.nativeRecording;
    for (const videoPath of [
      nativeRecording?.lastVideoPath,
      nativeRecording?.healthLastVideoPath,
      nativeRecording?.activeVideoPath,
      nativeRecording?.healthActiveVideoPath,
    ]) {
      if (typeof videoPath === "string" && videoPath) paths.add(normalizeNativeVideoPath(videoPath));
    }
  }
  for (const videoPath of manifest?.rollingEvidence?.nativeVideoPaths || []) {
    if (typeof videoPath === "string" && videoPath) paths.add(normalizeNativeVideoPath(videoPath));
  }
  for (const videoPath of manifest?.desktopNativeVideoPaths || []) {
    if (typeof videoPath === "string" && videoPath) paths.add(normalizeNativeVideoPath(videoPath));
  }
  for (const artifact of manifest?.desktopNativeVideoArtifacts || []) {
    if (typeof artifact?.devicePath === "string" && artifact.devicePath) {
      paths.add(normalizeNativeVideoPath(artifact.devicePath));
    }
  }
  return [...paths];
}

export async function cachedNativeVideoArtifactsForManifest(manifest: any): Promise<Record<string, KitchenNativeVideoArtifact>> {
  const runId = manifest?.run?.id;
  if (typeof runId !== "string" || !runId) return {};

  const artifacts: Record<string, KitchenNativeVideoArtifact> = {};
  for (const devicePath of nativeVideoPathsForManifest(manifest)) {
    try {
      const validationError = nativeVideoPathError(devicePath);
      if (validationError) {
        artifacts[devicePath] = artifactFor(runId, devicePath, "error", { error: validationError });
        continue;
      }
      const pending = cacheJobs.has(`${runId}:${devicePath}`);
      const cached = artifactFor(runId, devicePath, pending ? "pending" : "missing");
      const localPath = localPathForRef(cached.ref);
      if (fs.existsSync(localPath)) {
        const stat = await fs.promises.stat(localPath);
        if (stat.size <= 0) {
          artifacts[devicePath] = artifactFor(runId, devicePath, "error", {
            error: "Cached native video is empty",
          });
          continue;
        }
        artifacts[devicePath] = artifactFor(runId, devicePath, "cached", {
          size: stat.size,
          cachedAt: stat.mtime.toISOString(),
        });
      } else {
        artifacts[devicePath] = cached;
      }
    } catch (error: any) {
      artifacts[devicePath] = artifactFor(runId, devicePath, "error", { error: error?.message || String(error) });
    }
  }
  return artifacts;
}

export async function cacheKitchenNativeVideo(runId: string, devicePath: string): Promise<KitchenNativeVideoArtifact> {
  const normalized = assertNativeVideoPath(devicePath);
  const cacheKey = `${runId}:${normalized}`;
  const existing = cacheJobs.get(cacheKey);
  if (existing) return existing;

  const job = enqueueCacheJob(async () => {
    const artifact = artifactFor(runId, normalized, "pending");
    const localPath = localPathForRef(artifact.ref);
    if (fs.existsSync(localPath)) {
      const stat = await fs.promises.stat(localPath);
      if (stat.size <= 0) {
        await fs.promises.unlink(localPath).catch(() => {});
      } else {
        return artifactFor(runId, normalized, "cached", { size: stat.size, cachedAt: stat.mtime.toISOString() });
      }
    }
    await fs.promises.mkdir(path.dirname(localPath), { recursive: true });
    const tempPath = `${localPath}.${process.pid}.${Date.now()}.tmp`;
    try {
      await adb(["pull", normalized, tempPath], 180_000);
      await fs.promises.rename(tempPath, localPath);
      const stat = await fs.promises.stat(localPath);
      if (stat.size <= 0) {
        await fs.promises.unlink(localPath).catch(() => {});
        throw new Error("Pulled native video is empty");
      }
      return artifactFor(runId, normalized, "cached", { size: stat.size, cachedAt: stat.mtime.toISOString() });
    } catch (error: any) {
      await fs.promises.unlink(tempPath).catch(() => {});
      return artifactFor(runId, normalized, "error", { error: error?.message || String(error) });
    }
  }).finally(() => {
    cacheJobs.delete(cacheKey);
  });

  cacheJobs.set(cacheKey, job);
  return job;
}

export async function registerCachedKitchenNativeVideo(
  runId: string,
  devicePath: string,
  sourcePath: string,
): Promise<KitchenNativeVideoArtifact> {
  const normalized = assertNativeVideoPath(devicePath);
  const sourceStat = await fs.promises.stat(sourcePath);
  if (!sourceStat.isFile()) {
    throw new Error("Imported native video source must be a file");
  }
  if (sourceStat.size <= 0) {
    throw new Error("Imported native video source is empty");
  }

  const artifact = artifactFor(runId, normalized, "pending");
  const localPath = localPathForRef(artifact.ref);
  await moveFileIntoCache(sourcePath, localPath);
  const stat = await fs.promises.stat(localPath);
  if (stat.size <= 0) {
    await fs.promises.unlink(localPath).catch(() => {});
    throw new Error("Cached native video is empty");
  }
  return artifactFor(runId, normalized, "cached", {
    size: stat.size,
    cachedAt: stat.mtime.toISOString(),
  });
}

export function warmKitchenNativeVideoCacheForManifest(manifest: any) {
  const runId = manifest?.run?.id;
  if (typeof runId !== "string" || !runId) return [];
  return nativeVideoPathsForManifest(manifest).map((devicePath) => {
    void cacheKitchenNativeVideo(runId, devicePath).catch(() => {});
    return devicePath;
  });
}
