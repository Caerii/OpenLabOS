import type { KitchenSavedManifestSummary, KitchenSessionManifest, KitchenStepVqaAnswer } from "../../api";
import { getApiUrl } from "../../api/core";

export type RunLibrarySort = "newest" | "oldest" | "protocol" | "status" | "completion";
export type RunStatusFilter = "all" | "completed" | "partial" | "running";

export interface RunEvidenceStats {
  frameCount: number;
  chunkCount: number;
  stepSegmentCount: number;
  stepAnalysisCount: number;
  currentAttemptCount: number;
  redoneAttemptCount: number;
  nativeVideoCount: number;
  deviationCount: number;
  vqaAnnotationCount: number;
}

export interface RunAttemptEvidenceVideo {
  path: string;
  name: string;
  downloadUrl: string;
  viewUrl: string;
  deviceDownloadUrl: string;
  deviceViewUrl: string;
  thumbnailUrl?: string;
  segmentId?: string;
  durationMs?: number;
  source?: string;
  cacheStatus?: "cached" | "pending" | "missing" | "error";
  cacheSize?: number;
  cachedAt?: string;
  cacheError?: string;
}

export interface RunAttemptEvidence {
  attemptId: string;
  stepNumber: number;
  attemptNumber: number;
  status: "current" | "superseded";
  instruction?: string;
  segmentIds: string[];
  snapshotRefs: string[];
  chunkRefs: string[];
  videos: RunAttemptEvidenceVideo[];
  analyses: RunAttemptEvidenceAnalysis[];
  vqaAnnotations: RunAttemptEvidenceVqaAnnotation[];
  startedAt?: number;
  endedAt?: number;
  durationMs?: number;
}

export interface RunAttemptEvidenceAnalysis {
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

export interface RunAttemptEvidenceVqaAnnotation {
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
  answers?: KitchenStepVqaAnswer[];
  missingEvidence: string[];
  blockingIssues: string[];
  error?: string;
  completedAt?: string;
}

export interface RunVqaStepReview {
  id: string;
  stepNumber: number;
  attemptNumber?: number;
  segmentId: string;
  instruction?: string;
  status: RunAttemptEvidenceVqaAnnotation["status"];
  modelId: string;
  stepCompleteLikelihood?: number;
  recommendedNext?: string;
  frameSummary?: string;
  answerCount: number;
  questionCount: number;
  yesCount: number;
  noCount: number;
  uncertainCount: number;
  missingEvidence: string[];
  blockingIssues: string[];
  latencyMs?: number;
  completedAt?: string;
  error?: string;
  answers: KitchenStepVqaAnswer[];
}

export interface RunVqaReviewSummary {
  segmentCount: number;
  labeledSegmentCount: number;
  completedCount: number;
  errorCount: number;
  readyCount: number;
  reviewCount: number;
  queuedCount: number;
  runningCount: number;
  coverageRatio: number;
  averageLikelihood?: number;
  averageLatencyMs?: number;
  missingEvidenceCount: number;
  blockingIssueCount: number;
  steps: RunVqaStepReview[];
}

export interface NumberedRunSummary extends KitchenSavedManifestSummary {
  runNumber: number;
}

export function runStatusLabel(status?: string) {
  if (status === "completed") return "Completed";
  if (status === "aborted") return "Partial";
  if (status === "running") return "Running";
  if (status === "paused") return "Paused";
  return status ? status.replace(/_/g, " ") : "Saved";
}

export function runStatusBucket(status?: string): Exclude<RunStatusFilter, "all"> {
  if (status === "completed") return "completed";
  if (status === "running" || status === "paused") return "running";
  return "partial";
}

export function runCompletionRatio(summary: KitchenSavedManifestSummary) {
  const total = Math.max(0, Number(summary.totalSteps || 0));
  const completed = Math.max(0, Number(summary.stepsCompleted || 0));
  return total > 0 ? completed / total : 0;
}

export function runCompletionLabel(summary: KitchenSavedManifestSummary) {
  const completed = Math.max(0, Number(summary.stepsCompleted || 0));
  const total = Math.max(0, Number(summary.totalSteps || 0));
  return total > 0 ? `${completed}/${total} steps` : "steps saved";
}

export function runReviewHref(runId?: string | null) {
  return runId ? `/files?tab=runs&runId=${encodeURIComponent(runId)}` : "/files?tab=runs";
}

export function runDisplayId(runId?: string | null) {
  if (!runId) return "Run";
  const match = runId.match(/^run-(\d+)-(.+)$/);
  if (match) return `Run ${match[1].slice(-6)}-${match[2]}`;
  return `Run ${runId}`;
}

export function runNaturalLabel(runNumber?: number | null) {
  return Number.isFinite(Number(runNumber)) && Number(runNumber) > 0 ? `Run ${Number(runNumber)}` : "Run";
}

export function normalizeDeviceMediaPath(mediaPath: string) {
  return mediaPath.replace(/^\/storage\/emulated\/0\/LabOS\//, "/sdcard/LabOS/");
}

export function deviceMediaDownloadUrl(mediaPath: string) {
  return getApiUrl(`/api/files/download?path=${encodeURIComponent(normalizeDeviceMediaPath(mediaPath))}`);
}

export function deviceMediaViewUrl(mediaPath: string) {
  return getApiUrl(`/api/files/view?path=${encodeURIComponent(normalizeDeviceMediaPath(mediaPath))}`);
}

export function deviceMediaThumbnailUrl(mediaPath: string) {
  return getApiUrl(`/api/files/thumbnail?path=${encodeURIComponent(normalizeDeviceMediaPath(mediaPath))}`);
}

export function kitchenArtifactUrl(ref?: string | null, opts?: { download?: boolean }) {
  if (!ref) return "";
  const params = new URLSearchParams({ ref });
  if (opts?.download) params.set("download", "1");
  return getApiUrl(`/api/kitchen/session/artifact?${params.toString()}`);
}

function basename(mediaPath: string) {
  return mediaPath.split("/").filter(Boolean).pop() || mediaPath;
}

function plural(count: number, singular: string, pluralLabel = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralLabel}`;
}

export function attemptEvidenceSummary(attempt: Pick<RunAttemptEvidence, "snapshotRefs" | "chunkRefs" | "videos">) {
  const parts = [
    plural(attempt.videos.length, "video"),
    plural(attempt.snapshotRefs.length, "snapshot"),
  ];
  if (attempt.chunkRefs.length) parts.push(plural(attempt.chunkRefs.length, "preview clip"));
  return parts.join(", ");
}

export function runSearchText(summary: KitchenSavedManifestSummary) {
  return [
    summary.runId,
    summary.protocolId || "",
    summary.protocolName || "",
    summary.status || "",
    summary.manifestRef,
  ].join(" ").toLowerCase();
}

export function filterAndSortRuns<T extends KitchenSavedManifestSummary>(
  runs: T[],
  query: string,
  status: RunStatusFilter,
  sort: RunLibrarySort,
) {
  const q = query.trim().toLowerCase();
  return [...runs]
    .filter((run) => (!q || runSearchText(run).includes(q)))
    .filter((run) => status === "all" || runStatusBucket(run.status) === status)
    .sort((a, b) => {
      if (sort === "oldest") return Date.parse(a.savedAt) - Date.parse(b.savedAt);
      if (sort === "protocol") return (a.protocolName || a.protocolId || "").localeCompare(b.protocolName || b.protocolId || "");
      if (sort === "status") return runStatusLabel(a.status).localeCompare(runStatusLabel(b.status));
      if (sort === "completion") return runCompletionRatio(b) - runCompletionRatio(a) || Date.parse(b.savedAt) - Date.parse(a.savedAt);
      return Date.parse(b.savedAt) - Date.parse(a.savedAt);
    });
}

export function numberRunsBySavedOrder(runs: KitchenSavedManifestSummary[]): NumberedRunSummary[] {
  const oldestFirst = [...runs].sort((a, b) => Date.parse(a.savedAt) - Date.parse(b.savedAt));
  const numbers = new Map<string, number>();
  oldestFirst.forEach((run, index) => numbers.set(run.runId, index + 1));
  return runs.map((run) => ({ ...run, runNumber: numbers.get(run.runId) || 0 }));
}

export function runNumberForId(runs: KitchenSavedManifestSummary[], runId?: string | null) {
  if (!runId) return 0;
  return numberRunsBySavedOrder(runs).find((run) => run.runId === runId)?.runNumber || 0;
}

export function evidenceStatsForManifest(manifest: KitchenSessionManifest | null): RunEvidenceStats {
  if (!manifest) {
    return {
      frameCount: 0,
      chunkCount: 0,
      stepSegmentCount: 0,
      stepAnalysisCount: 0,
      currentAttemptCount: 0,
      redoneAttemptCount: 0,
      nativeVideoCount: 0,
      deviationCount: 0,
      vqaAnnotationCount: 0,
    };
  }
  const nativeVideos = new Set<string>();
  for (const attempt of manifest.stepAttempts || []) {
    for (const videoPath of attempt.nativeVideoPaths || []) nativeVideos.add(videoPath);
  }
  for (const segment of manifest.stepSegments || []) {
    const videoPath = segment.nativeRecording?.lastVideoPath || segment.nativeRecording?.activeVideoPath;
    if (videoPath) nativeVideos.add(videoPath);
  }
  for (const videoPath of manifest.rollingEvidence?.nativeVideoPaths || []) {
    if (videoPath) nativeVideos.add(videoPath);
  }
  for (const videoPath of manifest.desktopNativeVideoPaths || []) {
    if (videoPath) nativeVideos.add(videoPath);
  }
  for (const artifact of manifest.desktopNativeVideoArtifacts || []) {
    if (artifact?.devicePath) nativeVideos.add(artifact.devicePath);
  }
  const redoneAttemptCount = (manifest.stepAttempts || []).filter((attempt) => attempt.status === "superseded").length;
  const currentAttemptCount = (manifest.stepAttempts || []).filter((attempt) => attempt.status !== "superseded").length;
  const deviationCount = (manifest.adherence || []).filter((item) => item.action === "possible_deviation" || item.action === "blocked").length;
  const stepAnalysisCount = (manifest.stepAnalyses || []).filter((analysis) => analysis.status === "completed").length;
  const vqaAnnotationCount = (manifest.vqaAnnotations || []).length;

  return {
    frameCount: manifest.frames?.length || 0,
    chunkCount: manifest.chunks?.length || 0,
    stepSegmentCount: manifest.stepSegments?.length || 0,
    stepAnalysisCount,
    currentAttemptCount,
    redoneAttemptCount,
    nativeVideoCount: nativeVideos.size,
    deviationCount,
    vqaAnnotationCount,
  };
}

function isVqaDatasetReady(step: Pick<RunVqaStepReview, "status" | "recommendedNext" | "stepCompleteLikelihood" | "missingEvidence" | "blockingIssues" | "error">) {
  return (
    step.status === "completed" &&
    !step.error &&
    (step.recommendedNext === "advance" || step.recommendedNext === "continue") &&
    Number(step.stepCompleteLikelihood ?? 0) >= 0.7 &&
    step.missingEvidence.length === 0 &&
    step.blockingIssues.length === 0
  );
}

export function vqaReviewForManifest(manifest: KitchenSessionManifest | null): RunVqaReviewSummary | null {
  if (!manifest) return null;
  const segmentsById = new Map((manifest.stepSegments || []).map((segment) => [segment.id, segment]));
  const latestBySegment = new Map<string, NonNullable<KitchenSessionManifest["vqaAnnotationRecords"]>[number]>();
  for (const record of manifest.vqaAnnotationRecords || []) {
    if (!record?.segmentId) continue;
    latestBySegment.set(record.segmentId, record);
  }
  const steps = [...latestBySegment.values()]
    .map((record): RunVqaStepReview => {
      const segment = segmentsById.get(record.segmentId);
      const annotation = record.annotation;
      const answers = Array.isArray(annotation?.answers) ? annotation.answers : [];
      const blockingIssues = answers
        .map((answer) => answer.blockingIssue)
        .filter((issue): issue is string => typeof issue === "string" && issue.length > 0);
      return {
        id: record.id,
        stepNumber: record.stepNumber,
        attemptNumber: record.attemptNumber,
        segmentId: record.segmentId,
        instruction: segment?.stepInstruction || annotation?.instruction || stepInstructionFor(manifest, record.stepNumber),
        status: record.status,
        modelId: record.modelId,
        stepCompleteLikelihood: annotation?.stepCompleteLikelihood,
        recommendedNext: annotation?.recommendedNext,
        frameSummary: annotation?.frameSummary,
        answerCount: answers.length,
        questionCount: annotation?.questions?.length || answers.length,
        yesCount: answers.filter((answer) => answer.answer === "yes").length,
        noCount: answers.filter((answer) => answer.answer === "no").length,
        uncertainCount: answers.filter((answer) => answer.answer === "uncertain").length,
        missingEvidence: Array.isArray(annotation?.missingEvidence) ? annotation.missingEvidence : [],
        blockingIssues,
        latencyMs: record.latencyMs,
        completedAt: record.completedAt,
        error: record.error,
        answers,
      };
    })
    .sort((a, b) => a.stepNumber - b.stepNumber || (a.attemptNumber || 0) - (b.attemptNumber || 0));
  const completed = steps.filter((step) => step.status === "completed");
  const likelihoods = completed
    .map((step) => step.stepCompleteLikelihood)
    .filter((value): value is number => Number.isFinite(Number(value)));
  const latencies = completed
    .map((step) => step.latencyMs)
    .filter((value): value is number => Number.isFinite(Number(value)));
  const segmentCount = manifest.stepSegments?.length || 0;
  return {
    segmentCount,
    labeledSegmentCount: latestBySegment.size,
    completedCount: completed.length,
    errorCount: steps.filter((step) => step.status === "error").length,
    readyCount: steps.filter(isVqaDatasetReady).length,
    reviewCount: steps.filter((step) => step.status === "completed" && !isVqaDatasetReady(step)).length,
    queuedCount: steps.filter((step) => step.status === "queued").length,
    runningCount: steps.filter((step) => step.status === "running").length,
    coverageRatio: segmentCount > 0 ? latestBySegment.size / segmentCount : 0,
    averageLikelihood: likelihoods.length ? likelihoods.reduce((sum, value) => sum + value, 0) / likelihoods.length : undefined,
    averageLatencyMs: latencies.length ? latencies.reduce((sum, value) => sum + value, 0) / latencies.length : undefined,
    missingEvidenceCount: steps.reduce((sum, step) => sum + step.missingEvidence.length, 0),
    blockingIssueCount: steps.reduce((sum, step) => sum + step.blockingIssues.length, 0),
    steps,
  };
}

export function evidenceStatsForSummary(summary: KitchenSavedManifestSummary | null): RunEvidenceStats | null {
  if (!summary || summary.stepSegmentCount === undefined) return null;
  return {
    frameCount: Number(summary.frameCount || 0),
    chunkCount: Number(summary.chunkCount || 0),
    stepSegmentCount: Number(summary.stepSegmentCount || 0),
    stepAnalysisCount: Number(summary.completedStepAnalysisCount || 0),
    currentAttemptCount: 0,
    redoneAttemptCount: Number(summary.redoneAttemptCount || 0),
    nativeVideoCount: Number(summary.nativeVideoCount || 0),
    deviationCount: Number(summary.deviationCount || 0),
    vqaAnnotationCount: Number(summary.vqaAnnotationCount || 0),
  };
}

function stepInstructionFor(manifest: KitchenSessionManifest, stepNumber: number) {
  const step = (manifest.steps || [])[stepNumber - 1] as any;
  return typeof step?.instruction === "string" ? step.instruction : undefined;
}

function nativeVideoArtifactFor(manifest: KitchenSessionManifest, mediaPath: string) {
  const artifacts = manifest.nativeVideoArtifacts || {};
  const normalized = normalizeDeviceMediaPath(mediaPath);
  return artifacts[mediaPath] || artifacts[normalized] || artifacts[basename(mediaPath)];
}

export function attemptEvidenceForManifest(manifest: KitchenSessionManifest | null): RunAttemptEvidence[] {
  if (!manifest) return [];
  const safeManifest = manifest;
  const segmentsById = new Map((manifest.stepSegments || []).map((segment) => [segment.id, segment]));
  const analysesBySegment = new Map<string, RunAttemptEvidenceAnalysis[]>();
  const vqaBySegment = new Map<string, RunAttemptEvidenceVqaAnnotation[]>();
  for (const analysis of manifest.stepAnalyses || []) {
    if (!analysis?.segmentId) continue;
    const item: RunAttemptEvidenceAnalysis = {
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
    const item: RunAttemptEvidenceVqaAnnotation = {
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
      answers: annotation?.answers,
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
      .filter((segment): segment is NonNullable<typeof segment> => !!segment);
    const videos = new Map<string, RunAttemptEvidenceVideo>();
    const thumbnailUrl = kitchenArtifactUrl(frameRefs[0]);

    function addVideo(path: string, segment?: (typeof segments)[number]) {
      if (!path || videos.has(path)) return;
      const artifact = nativeVideoArtifactFor(safeManifest, path);
      const cached = artifact?.status === "cached";
      videos.set(path, {
        path,
        name: basename(path),
        downloadUrl: cached ? artifact.downloadUrl : deviceMediaDownloadUrl(path),
        viewUrl: cached ? artifact.url : deviceMediaViewUrl(path),
        deviceDownloadUrl: deviceMediaDownloadUrl(path),
        deviceViewUrl: deviceMediaViewUrl(path),
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
      addVideo(segment.nativeRecording?.lastVideoPath || "", segment);
      addVideo(segment.nativeRecording?.healthLastVideoPath || "", segment);
      addVideo(segment.nativeRecording?.activeVideoPath || "", segment);
      addVideo(segment.nativeRecording?.healthActiveVideoPath || "", segment);
    }
    for (const videoPath of nativeVideoPaths) addVideo(videoPath);
    const analyses = segmentIds.flatMap((id) => analysesBySegment.get(id) || []);
    const vqaAnnotations = segmentIds.flatMap((id) => vqaBySegment.get(id) || []);

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
      analyses,
      vqaAnnotations,
      startedAt,
      endedAt,
      durationMs: startedAt !== undefined && endedAt !== undefined ? Math.max(0, endedAt - startedAt) : undefined,
    };
  });
}

export function manifestJsonUrl(runId?: string | null) {
  return runId ? getApiUrl(`/api/kitchen/session/manifests/${encodeURIComponent(runId)}`) : "";
}
