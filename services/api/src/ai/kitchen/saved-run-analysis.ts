import {
  readKitchenSessionManifestFile,
  writeKitchenSessionManifest,
  type KitchenStepSegment,
} from "./run-store.js";
import {
  runKitchenStepSegmentAnalysis,
  asyncStepAnalysisModel,
} from "./async-step-analysis.js";
import { isSafeKitchenFrameRef } from "./artifact-refs.js";
import { buildKitchenCaptureReadiness } from "./capture-readiness.js";
import type { KitchenSessionManifest } from "./session-manifest.js";
import type { KitchenStepAnalysisRecord } from "./step-analysis-types.js";

export interface SavedRunAnalysisOptions {
  modelId?: string;
  force?: boolean;
  retryErrors?: boolean;
}

export interface SavedRunAnalysisQueueResult {
  runId: string;
  modelId: string;
  queuedSegmentCount: number;
  skippedSegmentCount: number;
  queuedStepNumbers: number[];
}

let savedRunAnalysisQueue: Promise<void> = Promise.resolve();

function isoNow() {
  return new Date().toISOString();
}

function analysisIdForSegment(segment: KitchenStepSegment) {
  return `analysis-${segment.id}`;
}

function usableFrameRefs(segment: KitchenStepSegment) {
  return (Array.isArray(segment.frameRefs) ? segment.frameRefs : []).filter(isSafeKitchenFrameRef);
}

function hasUsableFrameEvidence(segment: KitchenStepSegment) {
  return usableFrameRefs(segment).length > 0;
}

function analysisBelongsToManifest(
  manifest: Partial<Pick<KitchenSessionManifest, "run">>,
  analysis: KitchenStepAnalysisRecord,
) {
  if (manifest.run?.id && analysis.runId && analysis.runId !== manifest.run.id) return false;
  if (manifest.run?.protocolId && analysis.protocolId && analysis.protocolId !== manifest.run.protocolId) return false;
  return true;
}

function segmentBelongsToManifest(
  manifest: Partial<Pick<KitchenSessionManifest, "run" | "steps">>,
  segment: KitchenStepSegment,
) {
  if (manifest.run?.id && segment.runId !== manifest.run.id) return false;
  if (manifest.run?.protocolId && segment.protocolId !== manifest.run.protocolId) return false;
  if (Array.isArray(manifest.steps) && manifest.steps.length > 0) {
    const stepNumbers = new Set(
      manifest.steps
        .map((step: any) => Number(step?.number))
        .filter((stepNumber) => Number.isFinite(stepNumber) && stepNumber > 0),
    );
    if (stepNumbers.size > 0 && !stepNumbers.has(segment.stepNumber)) return false;
  }
  return true;
}

function latestAnalysesBySegment(
  manifest: Pick<KitchenSessionManifest, "stepAnalyses"> & Partial<Pick<KitchenSessionManifest, "run">>,
) {
  const latest = new Map<string, KitchenStepAnalysisRecord>();
  for (const analysis of manifest.stepAnalyses || []) {
    if (!analysis?.segmentId) continue;
    if (!analysisBelongsToManifest(manifest, analysis)) continue;
    latest.set(analysis.segmentId, analysis);
  }
  return latest;
}

export function segmentsNeedingSavedRunAnalysis(
  manifest: Pick<KitchenSessionManifest, "stepSegments" | "stepAnalyses"> & Partial<Pick<KitchenSessionManifest, "run" | "steps">>,
  opts: Pick<SavedRunAnalysisOptions, "force" | "retryErrors"> = {},
) {
  const retryErrors = opts.retryErrors !== false;
  const latest = latestAnalysesBySegment(manifest);
  return (manifest.stepSegments || []).filter((segment) => {
    if (!segmentBelongsToManifest(manifest, segment)) return false;
    if (!hasUsableFrameEvidence(segment)) return false;
    if (opts.force) return true;
    const existing = latest.get(segment.id);
    if (!existing) return true;
    if (existing.status === "error") return retryErrors;
    return false;
  });
}

function queuedRecordForSegment(
  segment: KitchenStepSegment,
  modelId: string,
): KitchenStepAnalysisRecord {
  return {
    id: analysisIdForSegment(segment),
    status: "queued",
    runId: segment.runId,
    protocolId: segment.protocolId,
    segmentId: segment.id,
    attemptId: segment.attemptId,
    attemptNumber: segment.attemptNumber,
    stepNumber: segment.stepNumber,
    modelId,
    queuedAt: isoNow(),
    evidenceRefs: usableFrameRefs(segment),
  };
}

export function upsertSavedRunStepAnalyses(
  manifest: KitchenSessionManifest,
  records: KitchenStepAnalysisRecord[],
): KitchenSessionManifest {
  const byId = new Map<string, KitchenStepAnalysisRecord>();
  for (const analysis of manifest.stepAnalyses || []) {
    if (analysis?.id) byId.set(analysis.id, analysis);
  }
  for (const record of records) {
    byId.set(record.id, record);
  }
  const stepAnalyses = [...byId.values()].sort((a, b) => (
    a.stepNumber - b.stepNumber ||
    (a.attemptNumber || 0) - (b.attemptNumber || 0) ||
    a.id.localeCompare(b.id)
  ));
  const nextManifest = {
    ...manifest,
    generatedAt: isoNow(),
    stepAnalyses,
  };
  return {
    ...nextManifest,
    readiness: buildKitchenCaptureReadiness({
      run: nextManifest.run,
      steps: nextManifest.steps || [],
      stepSegments: nextManifest.stepSegments || [],
      frames: nextManifest.frames || [],
      chunks: nextManifest.chunks || [],
      stepAnalyses,
    }),
  };
}

async function readSavedManifest(runId: string): Promise<KitchenSessionManifest> {
  return await readKitchenSessionManifestFile(runId) as KitchenSessionManifest;
}

async function writeSavedManifest(runId: string, manifest: KitchenSessionManifest) {
  await writeKitchenSessionManifest(runId, manifest);
}

async function markSavedRunAnalysisQueued(
  runId: string,
  opts: SavedRunAnalysisOptions,
) {
  const manifest = await readSavedManifest(runId);
  const modelId = opts.modelId || asyncStepAnalysisModel();
  const segments = segmentsNeedingSavedRunAnalysis(manifest, opts);
  if (!segments.length) {
    return { manifest, modelId, segments };
  }
  const queuedManifest = upsertSavedRunStepAnalyses(
    manifest,
    segments.map((segment) => queuedRecordForSegment(segment, modelId)),
  );
  await writeSavedManifest(runId, queuedManifest);
  return { manifest: queuedManifest, modelId, segments };
}

async function processSavedRunAnalysis(
  runId: string,
  segments: KitchenStepSegment[],
  opts: SavedRunAnalysisOptions,
) {
  for (const segment of segments) {
    const result = await runKitchenStepSegmentAnalysis(segment, { modelId: opts.modelId });
    const current = await readSavedManifest(runId);
    await writeSavedManifest(runId, upsertSavedRunStepAnalyses(current, [result]));
  }
}

export async function analyzeSavedKitchenSessionManifest(
  runId: string,
  opts: SavedRunAnalysisOptions = {},
) {
  const queued = await markSavedRunAnalysisQueued(runId, opts);
  await processSavedRunAnalysis(runId, queued.segments, opts);
  return {
    runId,
    modelId: queued.modelId,
    analyzedSegmentCount: queued.segments.length,
    skippedSegmentCount: Math.max(0, (queued.manifest.stepSegments || []).length - queued.segments.length),
  };
}

export async function queueSavedKitchenSessionManifestAnalysis(
  runId: string,
  opts: SavedRunAnalysisOptions = {},
): Promise<SavedRunAnalysisQueueResult> {
  const queued = await markSavedRunAnalysisQueued(runId, opts);
  savedRunAnalysisQueue = savedRunAnalysisQueue
    .catch(() => {})
    .then(() => processSavedRunAnalysis(runId, queued.segments, opts));
  return {
    runId,
    modelId: queued.modelId,
    queuedSegmentCount: queued.segments.length,
    skippedSegmentCount: Math.max(0, (queued.manifest.stepSegments || []).length - queued.segments.length),
    queuedStepNumbers: queued.segments.map((segment) => segment.stepNumber),
  };
}
