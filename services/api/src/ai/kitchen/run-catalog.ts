import path from "path";
import type { KitchenSavedManifestSummary, KitchenStepSegment } from "./run-store.js";
import {
  listKitchenSessionManifests,
  readKitchenSessionManifestFile,
} from "./run-store.js";
import type { KitchenSessionManifest } from "./session-manifest.js";
import { ensureKitchenCaptureReadiness } from "./capture-readiness.js";
import { coerceKitchenSessionManifest } from "./manifest-domain.js";
import {
  cachedNativeVideoArtifactsForManifest,
  type KitchenNativeVideoArtifact,
  warmKitchenNativeVideoCacheForManifest,
} from "./video-artifact-cache.js";
import { kitchenArtifactUrl } from "./artifact-refs.js";

export interface KitchenRunCatalogSummary extends KitchenSavedManifestSummary {
  runNumber: number;
  completionRatio: number;
  statusBucket: "completed" | "running" | "partial";
}

export interface KitchenRunEvidenceStats {
  frameCount: number;
  chunkCount: number;
  stepSegmentCount: number;
  stepAnalysisCount: number;
  currentAttemptCount: number;
  redoneAttemptCount: number;
  nativeVideoCount: number;
  deviationCount: number;
}

export interface KitchenRunEvidenceVideo {
  path: string;
  name: string;
  viewUrl: string;
  downloadUrl: string;
  deviceViewUrl: string;
  deviceDownloadUrl: string;
  thumbnailUrl?: string;
  segmentId?: string;
  durationMs?: number;
  source?: string;
  cacheStatus?: KitchenNativeVideoArtifact["status"];
  cacheSize?: number;
  cachedAt?: string;
  cacheError?: string;
}

export interface KitchenRunEvidenceAnalysis {
  id: string;
  status: "queued" | "running" | "completed" | "error";
  modelId: string;
  segmentId: string;
  performedCorrectly?: boolean;
  confidence?: number;
  summary?: string;
  deviation?: string | null;
  visibleEvidence: string[];
  missingEvidence: string[];
  error?: string;
  completedAt?: string;
}

export interface KitchenRunEvidenceVqaAnnotation {
  id: string;
  status: "queued" | "running" | "completed" | "error";
  modelId: string;
  segmentId: string;
  stepCompleteLikelihood?: number;
  recommendedNext?: string;
  frameSummary?: string;
  answerCount: number;
  questionCount?: number;
  latencyMs?: number;
  evidenceRefs?: string[];
  missingEvidence: string[];
  blockingIssues: string[];
  error?: string;
  completedAt?: string;
}

export interface KitchenRunEvidenceAttempt {
  attemptId: string;
  stepNumber: number;
  attemptNumber: number;
  status: "current" | "superseded";
  instruction?: string;
  segmentIds: string[];
  snapshotRefs: string[];
  chunkRefs: string[];
  videos: KitchenRunEvidenceVideo[];
  analyses: KitchenRunEvidenceAnalysis[];
  vqaAnnotations: KitchenRunEvidenceVqaAnnotation[];
  startedAt?: number;
  endedAt?: number;
  durationMs?: number;
}

export interface KitchenRunLibrary {
  generatedAt: string;
  runs: KitchenRunCatalogSummary[];
}

export interface KitchenRunReview {
  generatedAt: string;
  run: KitchenRunCatalogSummary;
  manifest: KitchenSessionManifest & {
    nativeVideoArtifacts?: Record<string, KitchenNativeVideoArtifact>;
  };
  stats: KitchenRunEvidenceStats;
  attempts: KitchenRunEvidenceAttempt[];
}

function completionRatio(summary: KitchenSavedManifestSummary) {
  const total = Math.max(0, Number(summary.totalSteps || 0));
  const completed = Math.max(0, Number(summary.stepsCompleted || 0));
  return total > 0 ? completed / total : 0;
}

function statusBucket(status?: string): KitchenRunCatalogSummary["statusBucket"] {
  if (status === "completed") return "completed";
  if (status === "running" || status === "paused") return "running";
  return "partial";
}

export function numberKitchenRunsBySavedOrder(
  runs: KitchenSavedManifestSummary[],
): KitchenRunCatalogSummary[] {
  const oldestFirst = [...runs].sort((a, b) => Date.parse(a.savedAt) - Date.parse(b.savedAt));
  const numbers = new Map<string, number>();
  oldestFirst.forEach((run, index) => numbers.set(run.runId, index + 1));
  return runs.map((run) => ({
    ...run,
    runNumber: numbers.get(run.runId) || 0,
    completionRatio: completionRatio(run),
    statusBucket: statusBucket(run.status),
  }));
}

function normalizeDeviceMediaPath(mediaPath: string) {
  return mediaPath.replace(/^\/storage\/emulated\/0\/LabOS\//, "/sdcard/LabOS/");
}

function deviceMediaUrl(mediaPath: string, endpoint: "view" | "download") {
  return `/api/files/${endpoint}?path=${encodeURIComponent(normalizeDeviceMediaPath(mediaPath))}`;
}

function basename(mediaPath: string) {
  return mediaPath.split("/").filter(Boolean).pop() || mediaPath;
}

function stepInstructionFor(manifest: KitchenSessionManifest, stepNumber: number) {
  const step = (manifest.steps || [])[stepNumber - 1] as any;
  return typeof step?.instruction === "string" ? step.instruction : undefined;
}

function nativeVideoArtifactFor(
  artifacts: Record<string, KitchenNativeVideoArtifact>,
  mediaPath: string,
) {
  const normalized = normalizeDeviceMediaPath(mediaPath);
  return artifacts[mediaPath] || artifacts[normalized] || artifacts[basename(mediaPath)];
}

function nativeVideoPathsForSegment(segment?: KitchenStepSegment | null) {
  const nativeRecording = segment?.nativeRecording;
  if (!nativeRecording) return [];
  return [
    nativeRecording.lastVideoPath,
    nativeRecording.healthLastVideoPath,
    nativeRecording.activeVideoPath,
    nativeRecording.healthActiveVideoPath,
  ].filter((value): value is string => typeof value === "string" && value.length > 0);
}

export function evidenceStatsForKitchenManifest(manifest: KitchenSessionManifest): KitchenRunEvidenceStats {
  const nativeVideos = new Set<string>();
  for (const attempt of manifest.stepAttempts || []) {
    for (const videoPath of attempt.nativeVideoPaths || []) nativeVideos.add(videoPath);
  }
  for (const segment of manifest.stepSegments || []) {
    for (const videoPath of nativeVideoPathsForSegment(segment)) nativeVideos.add(videoPath);
  }
  return {
    frameCount: manifest.frames?.length || 0,
    chunkCount: manifest.chunks?.length || 0,
    stepSegmentCount: manifest.stepSegments?.length || 0,
    stepAnalysisCount: (manifest.stepAnalyses || []).filter((analysis) => analysis.status === "completed").length,
    currentAttemptCount: (manifest.stepAttempts || []).filter((attempt) => attempt.status !== "superseded").length,
    redoneAttemptCount: (manifest.stepAttempts || []).filter((attempt) => attempt.status === "superseded").length,
    nativeVideoCount: nativeVideos.size,
    deviationCount: (manifest.adherence || [])
      .filter((item) => item.action === "possible_deviation" || item.action === "blocked")
      .length,
  };
}

export function attemptsForKitchenManifest(
  manifest: KitchenSessionManifest,
  artifacts: Record<string, KitchenNativeVideoArtifact> = {},
): KitchenRunEvidenceAttempt[] {
  const segmentsById = new Map((manifest.stepSegments || []).map((segment) => [segment.id, segment]));
  const analysesBySegment = new Map<string, KitchenRunEvidenceAnalysis[]>();
  const vqaBySegment = new Map<string, KitchenRunEvidenceVqaAnnotation[]>();
  for (const analysis of manifest.stepAnalyses || []) {
    if (!analysis?.segmentId) continue;
    const item: KitchenRunEvidenceAnalysis = {
      id: analysis.id,
      status: analysis.status,
      modelId: analysis.modelId,
      segmentId: analysis.segmentId,
      performedCorrectly: analysis.performedCorrectly,
      confidence: analysis.confidence,
      summary: analysis.summary,
      deviation: analysis.deviation,
      visibleEvidence: Array.isArray(analysis.visibleEvidence) ? analysis.visibleEvidence : [],
      missingEvidence: Array.isArray(analysis.missingEvidence) ? analysis.missingEvidence : [],
      error: analysis.error,
      completedAt: analysis.completedAt,
    };
    analysesBySegment.set(analysis.segmentId, [...(analysesBySegment.get(analysis.segmentId) || []), item]);
  }
  for (const record of manifest.vqaAnnotationRecords || []) {
    if (!record?.segmentId) continue;
    const annotation = record.annotation;
    const blockingIssues = (annotation?.answers || [])
      .map((answer) => answer.blockingIssue)
      .filter((issue): issue is string => typeof issue === "string" && issue.length > 0);
    const item: KitchenRunEvidenceVqaAnnotation = {
      id: record.id,
      status: record.status,
      modelId: record.modelId,
      segmentId: record.segmentId,
      stepCompleteLikelihood: annotation?.stepCompleteLikelihood,
      recommendedNext: annotation?.recommendedNext,
      frameSummary: annotation?.frameSummary,
      answerCount: annotation?.answers?.length || 0,
      questionCount: annotation?.questions?.length,
      latencyMs: record.latencyMs,
      evidenceRefs: record.evidenceRefs,
      missingEvidence: Array.isArray(annotation?.missingEvidence) ? annotation.missingEvidence : [],
      blockingIssues,
      error: record.error,
      completedAt: record.completedAt,
    };
    vqaBySegment.set(record.segmentId, [...(vqaBySegment.get(record.segmentId) || []), item]);
  }

  return (manifest.stepAttempts || []).map((attempt) => {
    const segmentIds = Array.isArray(attempt.segmentIds) ? attempt.segmentIds : [];
    const frameRefs = Array.isArray(attempt.frameRefs) ? attempt.frameRefs : [];
    const chunkRefs = Array.isArray(attempt.chunkRefs) ? attempt.chunkRefs : [];
    const nativeVideoPaths = Array.isArray(attempt.nativeVideoPaths) ? attempt.nativeVideoPaths : [];
    const segments = segmentIds
      .map((id) => segmentsById.get(id))
      .filter((segment): segment is KitchenStepSegment => !!segment);
    const videos = new Map<string, KitchenRunEvidenceVideo>();
    const thumbnailUrl = frameRefs[0] ? kitchenArtifactUrl(frameRefs[0]) : undefined;

    function addVideo(mediaPath: string, segment?: KitchenStepSegment) {
      if (!mediaPath || videos.has(mediaPath)) return;
      const artifact = nativeVideoArtifactFor(artifacts, mediaPath);
      const cached = artifact?.status === "cached";
      videos.set(mediaPath, {
        path: mediaPath,
        name: path.posix.basename(mediaPath),
        viewUrl: cached ? artifact.url : deviceMediaUrl(mediaPath, "view"),
        downloadUrl: cached ? artifact.downloadUrl : deviceMediaUrl(mediaPath, "download"),
        deviceViewUrl: deviceMediaUrl(mediaPath, "view"),
        deviceDownloadUrl: deviceMediaUrl(mediaPath, "download"),
        thumbnailUrl,
        segmentId: segment?.id,
        durationMs: segment?.durationMs,
        source: segment?.source,
        cacheStatus: artifact?.status,
        cacheSize: artifact?.size,
        cachedAt: artifact?.cachedAt,
        cacheError: artifact?.error,
      });
    }

    for (const segment of segments) {
      for (const mediaPath of nativeVideoPathsForSegment(segment)) addVideo(mediaPath, segment);
    }
    for (const mediaPath of nativeVideoPaths) addVideo(mediaPath);

    const startedAt = attempt.startedAt;
    const endedAt = attempt.endedAt;
    return {
      attemptId: attempt.attemptId,
      stepNumber: attempt.stepNumber,
      attemptNumber: attempt.attemptNumber,
      status: attempt.status,
      instruction: segments.find((segment) => segment.stepInstruction)?.stepInstruction || stepInstructionFor(manifest, attempt.stepNumber),
      segmentIds,
      snapshotRefs: frameRefs,
      chunkRefs,
      videos: [...videos.values()],
      analyses: segmentIds.flatMap((id) => analysesBySegment.get(id) || []),
      vqaAnnotations: segmentIds.flatMap((id) => vqaBySegment.get(id) || []),
      startedAt,
      endedAt,
      durationMs: startedAt !== undefined && endedAt !== undefined ? Math.max(0, endedAt - startedAt) : undefined,
    };
  });
}

export function buildKitchenRunReviewFromManifest(
  summary: KitchenSavedManifestSummary | KitchenRunCatalogSummary,
  manifest: KitchenSessionManifest,
  artifacts: Record<string, KitchenNativeVideoArtifact> = {},
): KitchenRunReview {
  const run = "runNumber" in summary
    ? summary
    : numberKitchenRunsBySavedOrder([summary])[0];
  return {
    generatedAt: new Date().toISOString(),
    run,
    manifest: { ...manifest, nativeVideoArtifacts: artifacts },
    stats: evidenceStatsForKitchenManifest(manifest),
    attempts: attemptsForKitchenManifest(manifest, artifacts),
  };
}

export async function buildKitchenRunLibrary(): Promise<KitchenRunLibrary> {
  return {
    generatedAt: new Date().toISOString(),
    runs: numberKitchenRunsBySavedOrder(await listKitchenSessionManifests()),
  };
}

export async function buildKitchenRunReview(runId: string): Promise<KitchenRunReview> {
  const library = await buildKitchenRunLibrary();
  const summary = library.runs.find((run) => run.runId === runId);
  if (!summary) throw new Error(`Saved kitchen run "${runId}" not found`);
  const manifest = ensureKitchenCaptureReadiness(coerceKitchenSessionManifest(await readKitchenSessionManifestFile(runId))) as KitchenSessionManifest;
  warmKitchenNativeVideoCacheForManifest(manifest);
  const artifacts = await cachedNativeVideoArtifactsForManifest(manifest);
  return {
    ...buildKitchenRunReviewFromManifest(summary, manifest, artifacts),
    generatedAt: new Date().toISOString(),
  };
}
