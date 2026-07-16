import { Router } from "express";
import crypto from "crypto";
import { execFile } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { adb, adbShell } from "../adb.js";
import { enrichKitchenMediaEvidenceEntries } from "../ai/kitchen/evidence-store.js";
import { openLabosDataDir } from "../data-root.js";
import { asyncRoute, badRequest, forbidden } from "../lib/http.js";

const router = Router();

const LABOS_ROOT = "/sdcard/LabOS";
const LABOS_ROOT_PREFIX = `${LABOS_ROOT}/`;
const ANDROID_STORAGE_LABOS_ROOT = "/storage/emulated/0/LabOS";
const ANDROID_STORAGE_LABOS_ROOT_PREFIX = `${ANDROID_STORAGE_LABOS_ROOT}/`;
const LABOS_MEDIA_DIR = `${LABOS_ROOT}/media`;
const DATA_DIR = openLabosDataDir();
const MEDIA_THUMBNAILS_DIR = path.join(DATA_DIR, "file-thumbnails");
const thumbnailJobs = new Map<string, Promise<string>>();

const DIRECTORY_ENTRY_RE =
  /^([drwxlsStT-]{10})\s+\d+\s+\S+\s+\S+\s+(\d+)\s+(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})\s+(.+)$/;
const PHOTO_EXTENSIONS_RE = /\.(jpg|jpeg|png|bmp|webp)$/i;
const VIDEO_EXTENSIONS_RE = /\.(mp4|avi|mkv|mov|webm)$/i;
const THUMBNAIL_EXTENSIONS_RE = /\.(jpg|jpeg|png|bmp|webp|mp4|avi|mkv|mov|webm)$/i;

const PHOTO_COUNT_COMMAND =
  'find /sdcard/LabOS/media -type f \\( -iname "*.jpg" -o -iname "*.jpeg" -o -iname "*.png" -o -iname "*.bmp" -o -iname "*.webp" \\) 2>/dev/null | wc -l';
const VIDEO_COUNT_COMMAND =
  'find /sdcard/LabOS/media -type f \\( -iname "*.mp4" -o -iname "*.avi" -o -iname "*.mkv" -o -iname "*.mov" -o -iname "*.webm" \\) 2>/dev/null | wc -l';

type DeviceDirectoryEntry = {
  name: string;
  path?: string;
  size: number | null;
  isDirectory: boolean;
  modified: string | null;
  permissions: string;
};

type DeviceMediaEntry = {
  name: string;
  path: string;
  size: number;
  modified: string | null;
};

function shellQuote(value: string) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function queryPath(value: string) {
  return encodeURIComponent(value);
}

export function normalizeLabosDevicePath(filePath: string) {
  const normalized = path.posix.normalize(filePath);
  if (normalized === ANDROID_STORAGE_LABOS_ROOT) return LABOS_ROOT;
  if (normalized.startsWith(ANDROID_STORAGE_LABOS_ROOT_PREFIX)) {
    return `${LABOS_ROOT}${normalized.slice(ANDROID_STORAGE_LABOS_ROOT.length)}`;
  }
  return normalized;
}

function normalizeLabosPathOrThrow(filePath: string, options?: { allowRoot?: boolean }) {
  const normalized = normalizeLabosDevicePath(filePath);
  if (normalized !== LABOS_ROOT && !normalized.startsWith(LABOS_ROOT_PREFIX)) {
    forbidden("Access denied: path must be under /sdcard/LabOS/");
  }
  if (options?.allowRoot === false && normalized === LABOS_ROOT) {
    forbidden("Cannot delete the root LabOS directory");
  }
  return normalized;
}

function readPathOrThrow(value: unknown, missingMessage: string, options?: { allowRoot?: boolean }) {
  if (typeof value !== "string" || !value) {
    badRequest(missingMessage);
  }
  return normalizeLabosPathOrThrow(value, options);
}

function readMediaPathOrThrow(value: unknown) {
  const mediaPath = readPathOrThrow(value, "path query parameter required");
  if (mediaPath !== LABOS_MEDIA_DIR && !mediaPath.startsWith(`${LABOS_MEDIA_DIR}/`)) {
    forbidden("Access denied: media thumbnails must be under /sdcard/LabOS/media/");
  }
  return mediaPath;
}

export function parseDirectoryEntries(output: string): DeviceDirectoryEntry[] {
  const entries: DeviceDirectoryEntry[] = [];
  for (const line of output.split("\n").filter((entry) => entry.trim())) {
    const match = line.match(DIRECTORY_ENTRY_RE);
    if (!match) continue;
    const name = match[4].trim();
    if (name === "." || name === "..") continue;
    entries.push({
      name,
      size: Number(match[2]),
      isDirectory: match[1].startsWith("d"),
      modified: match[3],
      permissions: match[1],
    });
  }
  return entries;
}

function shortModifiedDate(value: string | undefined) {
  return value ? value.slice(0, 16) : null;
}

export function parseStatDirectoryEntries(output: string): DeviceDirectoryEntry[] {
  const entries: DeviceDirectoryEntry[] = [];
  for (const line of output.split("\n").filter((entry) => entry.trim())) {
    const [kind, fullPath, size, modified, permissions] = line.replace(/\r$/, "").split(/\t|\\t/);
    if (!fullPath) continue;
    entries.push({
      name: path.posix.basename(fullPath),
      path: fullPath,
      size: Number(size) || 0,
      isDirectory: kind === "directory",
      modified: shortModifiedDate(modified),
      permissions: permissions || "",
    });
  }
  return entries;
}

export function parseStatMediaEntries(output: string): DeviceMediaEntry[] {
  return output
    .split("\n")
    .filter((entry) => entry.trim())
    .map((line) => {
      const [fullPath, size, modified] = line.replace(/\r$/, "").split(/\t|\\t/);
      if (!fullPath) return null;
      return {
        name: path.posix.basename(fullPath),
        path: fullPath,
        size: Number(size) || 0,
        modified: shortModifiedDate(modified),
      } satisfies DeviceMediaEntry;
    })
    .filter((entry): entry is DeviceMediaEntry => !!entry)
    .sort((a, b) => String(b.modified || "").localeCompare(String(a.modified || "")));
}

function thumbnailCachePath(filePath: string) {
  const hash = crypto.createHash("sha1").update(filePath).digest("hex");
  return path.join(MEDIA_THUMBNAILS_DIR, `${hash}.jpg`);
}

function thumbnailUrlForMediaPath(filePath: string, size?: number) {
  const sizeParam = Number.isFinite(Number(size)) ? `&size=${Number(size)}` : "";
  return `/api/files/thumbnail?path=${queryPath(filePath)}${sizeParam}`;
}

function sendThumbnailPlaceholder(res: any, label: string) {
  const safeLabel = label.replace(/[<>&"]/g, "");
  res
    .status(200)
    .type("image/svg+xml")
    .send(
      `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="240" viewBox="0 0 360 240">` +
      `<rect width="360" height="240" fill="#0f172a"/>` +
      `<rect x="1" y="1" width="358" height="238" fill="none" stroke="#334155" stroke-width="2"/>` +
      `<circle cx="180" cy="108" r="34" fill="#10b981" opacity="0.18"/>` +
      `<path d="M170 88v40l34-20-34-20z" fill="#34d399"/>` +
      `<text x="180" y="170" text-anchor="middle" fill="#cbd5e1" font-family="Arial,sans-serif" font-size="16">${safeLabel}</text>` +
      `</svg>`,
    );
}

function runExecFile(command: string, args: string[], timeoutMs: number) {
  return new Promise<void>((resolve, reject) => {
    execFile(command, args, { timeout: timeoutMs, windowsHide: true, maxBuffer: 1024 * 1024 }, (error, _stdout, stderr) => {
      if (error) {
        reject(new Error(`${command} ${args.join(" ")} failed: ${stderr || error.message}`));
        return;
      }
      resolve();
    });
  });
}

async function generateMediaThumbnail(filePath: string, outPath: string) {
  await fs.promises.mkdir(MEDIA_THUMBNAILS_DIR, { recursive: true });
  const { tmpFile } = await pullDeviceFile(filePath);
  try {
    const isVideo = VIDEO_EXTENSIONS_RE.test(filePath);
    await runExecFile(
      "ffmpeg",
      [
        "-y",
        ...(isVideo ? ["-ss", "00:00:01"] : []),
        "-i",
        tmpFile,
        "-frames:v",
        "1",
        "-vf",
        "scale=360:-2",
        "-q:v",
        "4",
        outPath,
      ],
      isVideo ? 120_000 : 45_000,
    );
    return outPath;
  } finally {
    cleanupTempFile(tmpFile);
  }
}

async function ensureMediaThumbnail(filePath: string) {
  const outPath = thumbnailCachePath(filePath);
  if (fs.existsSync(outPath)) return outPath;
  const existingJob = thumbnailJobs.get(outPath);
  if (existingJob) return existingJob;
  const job = generateMediaThumbnail(filePath, outPath).finally(() => {
    thumbnailJobs.delete(outPath);
  });
  thumbnailJobs.set(outPath, job);
  return job;
}

async function enrichMediaEntries(entries: DeviceMediaEntry[]) {
  const enrichedEntries = await enrichKitchenMediaEvidenceEntries(entries);
  return enrichedEntries.map((entry) => ({
    ...entry,
    thumbnailUrl: thumbnailUrlForMediaPath(entry.path, entry.size),
  }));
}

function selectMediaEntries(entries: DeviceDirectoryEntry[], extensionRe: RegExp): DeviceMediaEntry[] {
  return entries
    .filter((entry) => !entry.isDirectory && extensionRe.test(entry.name))
    .map((entry) => ({
      name: entry.name,
      path: entry.path || `${LABOS_MEDIA_DIR}/${entry.name}`,
      size: entry.size ?? 0,
      modified: entry.modified,
    }));
}

async function listDirectoryEntries(dirPath: string) {
  try {
    const output = await adbShell(
      `find ${shellQuote(dirPath)} -maxdepth 1 -mindepth 1 -exec stat -c '%F\\t%n\\t%s\\t%y\\t%A' {} \\;`,
      10000,
    );
    const entries = parseStatDirectoryEntries(output);
    if (entries.length > 0) return entries;
  } catch {}
  const output = await adbShell(`ls -la ${shellQuote(dirPath)}`, 10000);
  return parseDirectoryEntries(output).map((entry) => ({
    ...entry,
    path: `${dirPath.replace(/\/$/, "")}/${entry.name}`,
  }));
}

async function listMediaEntries(extensionRe: RegExp) {
  const extensionFilter = extensionRe === PHOTO_EXTENSIONS_RE
    ? '-iname "*.jpg" -o -iname "*.jpeg" -o -iname "*.png" -o -iname "*.bmp" -o -iname "*.webp"'
    : '-iname "*.mp4" -o -iname "*.avi" -o -iname "*.mkv" -o -iname "*.mov" -o -iname "*.webm"';
  const output = await adbShell(
    `find ${shellQuote(LABOS_MEDIA_DIR)} -type f \\( ${extensionFilter} \\) -exec stat -c '%n\\t%s\\t%y' {} \\;`,
    30000,
  ).catch(() => "");
  const entries = parseStatMediaEntries(output);
  if (entries.length > 0) return entries;
  return selectMediaEntries(await listDirectoryEntries(LABOS_MEDIA_DIR), extensionRe);
}

async function safeAdbShell(command: string, fallback: string, timeoutMs = 10000) {
  return adbShell(command, timeoutMs).catch(() => fallback);
}

function parseTotalSize(totalSize: string) {
  const match = totalSize.match(/^([\d.]+[A-Za-z]?)\s/);
  return match ? match[1] : "unknown";
}

function parseFreeSpace(dfOutput: string) {
  const lines = dfOutput.split("\n").filter((line) => line.trim());
  if (lines.length < 2) return null;
  const parts = lines[1].trim().split(/\s+/);
  return parts[3] || null;
}

async function pullDeviceFile(filePath: string) {
  const fileName = path.posix.basename(filePath);
  const tmpFile = path.join(os.tmpdir(), `labos-dl-${Date.now()}-${fileName}`);
  await adb(["pull", filePath, tmpFile], 60000);
  return { fileName, tmpFile };
}

function cleanupTempFile(filePath: string) {
  fs.unlink(filePath, () => {});
}

function mediaMimeType(filePath: string) {
  const ext = path.posix.extname(filePath).toLowerCase();
  if (ext === ".mp4") return "video/mp4";
  if (ext === ".webm") return "video/webm";
  if (ext === ".mov") return "video/quicktime";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  return "application/octet-stream";
}

function inlineFilename(fileName: string) {
  return fileName.replace(/[\\"]/g, "_");
}

router.get("/list", asyncRoute(async (req, res) => {
  const dirPath = typeof req.query.path === "string"
    ? normalizeLabosPathOrThrow(req.query.path)
    : LABOS_ROOT;
  const entries = await listDirectoryEntries(dirPath);
  res.json({ path: dirPath, entries });
}));

router.get("/thumbnail", asyncRoute(async (req, res) => {
  const filePath = readMediaPathOrThrow(req.query.path);
  if (!THUMBNAIL_EXTENSIONS_RE.test(filePath)) {
    badRequest("Unsupported thumbnail media type");
  }
  try {
    const thumbnailPath = await ensureMediaThumbnail(filePath);
    res.type("image/jpeg").sendFile(thumbnailPath);
  } catch (error) {
    sendThumbnailPlaceholder(res, VIDEO_EXTENSIONS_RE.test(filePath) ? "Video preview unavailable" : "Preview unavailable");
  }
}));

router.get("/download", asyncRoute(async (req, res) => {
  const filePath = readPathOrThrow(req.query.path, "path query parameter required");
  const { fileName, tmpFile } = await pullDeviceFile(filePath);
  res.download(tmpFile, fileName, () => {
    cleanupTempFile(tmpFile);
  });
}));

router.get("/view", asyncRoute(async (req, res) => {
  const filePath = readPathOrThrow(req.query.path, "path query parameter required");
  const { fileName, tmpFile } = await pullDeviceFile(filePath);
  res.setHeader("Content-Disposition", `inline; filename="${inlineFilename(fileName)}"`);
  res.type(mediaMimeType(filePath));
  res.sendFile(tmpFile, () => {
    cleanupTempFile(tmpFile);
  });
}));

router.delete("/delete", asyncRoute(async (req, res) => {
  const filePath = readPathOrThrow(req.body?.path, "path is required in request body", { allowRoot: false });
  await adbShell(`rm -rf ${shellQuote(filePath)}`, 10000);
  res.json({ success: true, deleted: filePath });
}));

router.get("/stats", asyncRoute(async (_req, res) => {
  const [photoCount, videoCount, totalSize, dfOutput] = await Promise.all([
    safeAdbShell(PHOTO_COUNT_COMMAND, "0"),
    safeAdbShell(VIDEO_COUNT_COMMAND, "0"),
    safeAdbShell(`du -sh ${shellQuote(LABOS_ROOT)} 2>/dev/null`, ""),
    safeAdbShell("df -h /sdcard", ""),
  ]);

  res.json({
    photoCount: Number(photoCount.trim()) || 0,
    videoCount: Number(videoCount.trim()) || 0,
    totalSize: parseTotalSize(totalSize),
    freeSpace: parseFreeSpace(dfOutput),
  });
}));

router.get("/photos", asyncRoute(async (_req, res) => {
  const photos = await enrichMediaEntries(await listMediaEntries(PHOTO_EXTENSIONS_RE));
  res.json({ photos, total: photos.length });
}));

router.get("/videos", asyncRoute(async (_req, res) => {
  const videos = await enrichMediaEntries(await listMediaEntries(VIDEO_EXTENSIONS_RE));
  res.json({ videos, total: videos.length });
}));

export default router;
