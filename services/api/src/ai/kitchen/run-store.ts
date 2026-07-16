import fs from "fs";
import path from "path";
import { openLabosDataDir } from "../../data-root.js";
import type { ProtocolRun, RunSummary, StepState } from "./tracker.js";

const DATA_DIR = openLabosDataDir();
const KITCHEN_DIR = path.join(DATA_DIR, "kitchen");
const KITCHEN_FRAMES_DIR = path.join(KITCHEN_DIR, "frames");
const KITCHEN_CHUNKS_DIR = path.join(KITCHEN_DIR, "chunks");
const KITCHEN_EVENTS_FILE = path.join(KITCHEN_DIR, "run_events.jsonl");
const KITCHEN_STEP_SEGMENTS_FILE = path.join(KITCHEN_DIR, "step_segments.jsonl");
const CURRENT_RUN_FILE = path.join(KITCHEN_DIR, "current_run.json");
const KITCHEN_MANIFESTS_DIR = path.join(KITCHEN_DIR, "manifests");
const MANIFEST_CACHE_TTL_MS = 10_000;

let manifestSummaryCache: { at: number; entries: KitchenSavedManifestSummary[] } | null = null;
const manifestFileCache = new Map<string, { at: number; value: unknown }>();

export type KitchenRunEventType =
  | "run_start"
  | "run_force_start"
  | "run_pause"
  | "run_resume"
  | "run_abort"
  | "workspace_check"
  | "confirm_step"
  | "undo_step"
  | "verify_step"
  | "step_analysis"
  | "vqa_annotation"
  | "skip_step"
  | "complete_step"
  | "rolling_evidence_start"
  | "rolling_evidence_marker"
  | "rolling_evidence_stop"
  | "run_snapshot";

export interface KitchenRunEvent {
  ts: number;
  type: KitchenRunEventType;
  runId?: string | null;
  protocolId?: string | null;
  payload?: any;
}

export type KitchenStepSegmentSource =
  | "confirm-step"
  | "adherence-advance"
  | "manual-complete"
  | "skip-step";

export interface KitchenStepSegment {
  id: string;
  createdAt: string;
  runId: string;
  protocolId: string;
  protocolName?: string;
  stepNumber: number;
  attemptId?: string;
  attemptNumber?: number;
  supersedesAttemptId?: string;
  stepInstruction?: string;
  startedAt?: number;
  endedAt: number;
  durationMs?: number;
  source: KitchenStepSegmentSource;
  frameRefs: string[];
  chunkRefs: string[];
  nativeRecording?: {
    active: boolean;
    activeVideoPath?: string;
    lastVideoPath?: string;
    startedAt?: string | null;
    stoppedAt?: string | null;
    healthRecording?: boolean;
    healthActiveVideoPath?: string;
    healthLastVideoPath?: string;
  };
  notes?: string[];
}

export interface KitchenSavedManifestSummary {
  runId: string;
  manifestRef: string;
  savedAt: string;
  generatedAt?: string;
  protocolId?: string;
  protocolName?: string;
  status?: string;
  stepsCompleted?: number;
  totalSteps?: number;
  frameCount?: number;
  chunkCount?: number;
  stepSegmentCount?: number;
  nativeVideoCount?: number;
  redoneAttemptCount?: number;
  deviationCount?: number;
  stepAnalysisCount?: number;
  completedStepAnalysisCount?: number;
  vqaAnnotationCount?: number;
  readinessGrade?: string;
}

async function ensureDirs(): Promise<void> {
  await fs.promises.mkdir(KITCHEN_FRAMES_DIR, { recursive: true });
  await fs.promises.mkdir(KITCHEN_CHUNKS_DIR, { recursive: true });
  await fs.promises.mkdir(KITCHEN_MANIFESTS_DIR, { recursive: true });
}

async function writeJsonFileAtomic(filePath: string, value: unknown): Promise<void> {
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`;
  await fs.promises.writeFile(tempPath, JSON.stringify(value, null, 2));
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await fs.promises.rename(tempPath, filePath);
      return;
    } catch (error: any) {
      if (error?.code !== "EPERM" && error?.code !== "EBUSY") throw error;
      await new Promise((resolve) => setTimeout(resolve, 25 * (attempt + 1)));
    }
  }
  await fs.promises.copyFile(tempPath, filePath);
  await fs.promises.unlink(tempPath).catch(() => {});
}

function clearManifestCaches(runId?: string) {
  manifestSummaryCache = null;
  if (runId) {
    manifestFileCache.delete(runId);
    return;
  }
  manifestFileCache.clear();
}

export function getKitchenDataPaths() {
  return {
    dataDir: DATA_DIR,
    kitchenDir: KITCHEN_DIR,
    framesDir: KITCHEN_FRAMES_DIR,
    chunksDir: KITCHEN_CHUNKS_DIR,
    eventsFile: KITCHEN_EVENTS_FILE,
    stepSegmentsFile: KITCHEN_STEP_SEGMENTS_FILE,
    currentRunFile: CURRENT_RUN_FILE,
    manifestsDir: KITCHEN_MANIFESTS_DIR,
  };
}

export async function saveKitchenFrame(frameBuffer: Buffer, opts?: { prefix?: string }): Promise<string> {
  await ensureDirs();
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const filename = `${opts?.prefix ? `${opts.prefix}-` : ""}${id}.jpg`;
  const filePath = path.join(KITCHEN_FRAMES_DIR, filename);
  await fs.promises.writeFile(filePath, frameBuffer);
  // Return a stable ref relative to the dashboard data dir.
  return `kitchen/frames/${filename}`;
}

export async function appendKitchenEvent(evt: Omit<KitchenRunEvent, "ts">): Promise<void> {
  await ensureDirs();
  const record: KitchenRunEvent = { ts: Date.now(), ...evt };
  await fs.promises.appendFile(KITCHEN_EVENTS_FILE, JSON.stringify(record) + "\n");
}

export async function readKitchenEvents(runId?: string): Promise<KitchenRunEvent[]> {
  await ensureDirs();
  try {
    const text = await fs.promises.readFile(KITCHEN_EVENTS_FILE, "utf-8");
    return text
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line) as KitchenRunEvent)
      .filter((event) => !runId || event.runId === runId);
  } catch (error: any) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

export async function appendKitchenStepSegment(segment: KitchenStepSegment): Promise<void> {
  await ensureDirs();
  await fs.promises.appendFile(KITCHEN_STEP_SEGMENTS_FILE, JSON.stringify(segment) + "\n");
}

export async function readKitchenStepSegments(runId?: string): Promise<KitchenStepSegment[]> {
  await ensureDirs();
  try {
    const text = await fs.promises.readFile(KITCHEN_STEP_SEGMENTS_FILE, "utf-8");
    return text
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line) as KitchenStepSegment)
      .filter((segment) => !runId || segment.runId === runId);
  } catch (error: any) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
}

export async function readCurrentRunSnapshot(): Promise<{ ts: number; run: ProtocolRun | null; summary: RunSummary | null } | null> {
  await ensureDirs();
  try {
    return JSON.parse(await fs.promises.readFile(CURRENT_RUN_FILE, "utf-8"));
  } catch (error: any) {
    if (error?.code === "ENOENT") return null;
    if (error instanceof SyntaxError) return null;
    throw error;
  }
}

export async function writeKitchenSessionManifest(runId: string, manifest: unknown): Promise<string> {
  await ensureDirs();
  const filePath = path.join(KITCHEN_MANIFESTS_DIR, `${runId}.json`);
  await writeJsonFileAtomic(filePath, manifest);
  clearManifestCaches(runId);
  return path.relative(DATA_DIR, filePath).replace(/\\/g, "/");
}

function assertSafeManifestRunId(runId: string) {
  if (!/^[A-Za-z0-9_.-]+$/.test(runId)) {
    throw new Error("Invalid manifest run id");
  }
}

function manifestRefForRunId(runId: string) {
  return `kitchen/manifests/${runId}.json`;
}

function evidenceSummaryForManifest(manifest: any) {
  const nativeVideos = new Set<string>();
  for (const attempt of manifest?.stepAttempts || []) {
    for (const videoPath of attempt?.nativeVideoPaths || []) {
      if (videoPath) nativeVideos.add(videoPath);
    }
  }
  for (const segment of manifest?.stepSegments || []) {
    const videoPath = segment?.nativeRecording?.lastVideoPath || segment?.nativeRecording?.activeVideoPath;
    const healthVideoPath = segment?.nativeRecording?.healthLastVideoPath || segment?.nativeRecording?.healthActiveVideoPath;
    if (videoPath) nativeVideos.add(videoPath);
    if (healthVideoPath) nativeVideos.add(healthVideoPath);
  }
  for (const videoPath of manifest?.rollingEvidence?.nativeVideoPaths || []) {
    if (videoPath) nativeVideos.add(videoPath);
  }
  for (const videoPath of manifest?.desktopNativeVideoPaths || []) {
    if (videoPath) nativeVideos.add(videoPath);
  }
  for (const artifact of manifest?.desktopNativeVideoArtifacts || []) {
    if (artifact?.devicePath) nativeVideos.add(artifact.devicePath);
  }
  return {
    frameCount: Array.isArray(manifest?.frames) ? manifest.frames.length : 0,
    chunkCount: Array.isArray(manifest?.chunks) ? manifest.chunks.length : 0,
    stepSegmentCount: Array.isArray(manifest?.stepSegments) ? manifest.stepSegments.length : 0,
    nativeVideoCount: nativeVideos.size,
    redoneAttemptCount: Array.isArray(manifest?.stepAttempts)
      ? manifest.stepAttempts.filter((attempt: any) => attempt?.status === "superseded").length
      : 0,
    deviationCount: Array.isArray(manifest?.adherence)
      ? manifest.adherence.filter((item: any) => item?.action === "possible_deviation" || item?.action === "blocked").length
      : 0,
    stepAnalysisCount: Array.isArray(manifest?.stepAnalyses) ? manifest.stepAnalyses.length : 0,
    completedStepAnalysisCount: Array.isArray(manifest?.stepAnalyses)
      ? manifest.stepAnalyses.filter((item: any) => item?.status === "completed").length
      : 0,
    vqaAnnotationCount: Array.isArray(manifest?.vqaAnnotations) ? manifest.vqaAnnotations.length : 0,
  };
}

export async function readKitchenSessionManifestFile(runId: string): Promise<unknown> {
  assertSafeManifestRunId(runId);
  await ensureDirs();
  const cached = manifestFileCache.get(runId);
  if (cached && Date.now() - cached.at < MANIFEST_CACHE_TTL_MS) {
    return cached.value;
  }
  const value = JSON.parse(await fs.promises.readFile(path.join(KITCHEN_MANIFESTS_DIR, `${runId}.json`), "utf-8"));
  manifestFileCache.set(runId, { at: Date.now(), value });
  return value;
}

export async function listKitchenSessionManifests(): Promise<KitchenSavedManifestSummary[]> {
  await ensureDirs();
  if (manifestSummaryCache && Date.now() - manifestSummaryCache.at < MANIFEST_CACHE_TTL_MS) {
    return manifestSummaryCache.entries;
  }
  const files = await fs.promises.readdir(KITCHEN_MANIFESTS_DIR).catch((error: any) => {
    if (error?.code === "ENOENT") return [] as string[];
    throw error;
  });
  const summaries = await Promise.all(files
    .filter((file) => file.endsWith(".json"))
    .map(async (file) => {
      const runId = path.basename(file, ".json");
      const filePath = path.join(KITCHEN_MANIFESTS_DIR, file);
      const [stat, manifest] = await Promise.all([
        fs.promises.stat(filePath),
        fs.promises.readFile(filePath, "utf-8").then((text) => JSON.parse(text)).catch(() => null),
      ]);
      if (manifest) {
        manifestFileCache.set(runId, { at: Date.now(), value: manifest });
      }
      return {
        runId,
        manifestRef: manifestRefForRunId(runId),
        savedAt: stat.mtime.toISOString(),
        generatedAt: manifest?.generatedAt,
        protocolId: manifest?.run?.protocolId,
        protocolName: manifest?.run?.protocolName,
        status: manifest?.run?.status,
        stepsCompleted: manifest?.run?.metrics?.stepsCompleted,
        totalSteps: Array.isArray(manifest?.steps) ? manifest.steps.length : undefined,
        ...evidenceSummaryForManifest(manifest),
        readinessGrade: manifest?.readiness?.grade,
      } satisfies KitchenSavedManifestSummary;
    }));
  const sorted = summaries.sort((a, b) => Date.parse(b.savedAt) - Date.parse(a.savedAt));
  manifestSummaryCache = { at: Date.now(), entries: sorted };
  return sorted;
}

export async function saveCurrentRunSnapshot(run: ProtocolRun | null, summary: RunSummary | null): Promise<void> {
  await ensureDirs();
  const snapshot = {
    ts: Date.now(),
    run,
    summary,
  };
  await writeJsonFileAtomic(CURRENT_RUN_FILE, snapshot);
  await appendKitchenEvent({
    type: "run_snapshot",
    runId: run?.id ?? null,
    protocolId: run?.protocolId ?? null,
    payload: { summary },
  });
}

export function toStepLite(step: StepState) {
  return {
    number: step.step.number,
    instruction: step.step.instruction,
    status: step.status,
    attemptId: step.attemptId,
    attemptNumber: step.attemptNumber,
    supersedesAttemptId: step.supersedesAttemptId,
    startedAt: step.startedAt,
    completedAt: step.completedAt,
    elapsedMs: step.elapsedMs,
    beforeFrameRef: step.beforeFrameRef,
    notes: step.notes,
    verifications: step.verifications.map((v) => ({
      timestamp: v.timestamp,
      success: v.success,
      confidence: v.confidence,
      reasoning: v.reasoning,
      frameRef: v.frameRef,
    })),
  };
}
