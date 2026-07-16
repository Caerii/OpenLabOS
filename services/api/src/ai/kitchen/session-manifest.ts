import { protocolTracker, type ProtocolRun } from "./tracker.js";
import type { KitchenRunEvent, KitchenStepSegment } from "./run-store.js";
import { resolveKitchenArtifactRef } from "./artifact-refs.js";
import type { MultiscaleValidationCheck } from "./multiscale-validation.js";
import {
  probeNativeVideoMetadata,
  type KitchenNativeVideoMetadata,
} from "./native-video-metadata.js";
import { nativeRecordingPathsForKitchenSegment } from "./evidence-store.js";
import {
  buildKitchenCaptureReadiness,
  type KitchenCaptureReadiness,
} from "./capture-readiness.js";
import type { KitchenStepAnalysisRecord } from "./step-analysis-types.js";
import type { StepVqaAnnotation, StepVqaAnnotationRecord } from "./vqa-annotations.js";
import type { SavedRunBoundaryAnalysis } from "./saved-run-boundary-analysis.js";
import {
  readCurrentRunSnapshot,
  readKitchenEvents,
  readKitchenSessionManifestFile,
  readKitchenStepSegments,
  toStepLite,
  writeKitchenSessionManifest,
} from "./run-store.js";
import {
  registerCachedKitchenNativeVideo,
  type KitchenNativeVideoArtifact,
} from "./video-artifact-cache.js";

export interface KitchenSessionManifestFrame {
  frameRef: string;
  stepNumber?: number;
  source: "verification" | "event" | "step_segment";
}

export interface KitchenSessionManifestChunk {
  chunkRef: string;
  indexRef?: string;
  stepNumber?: number;
  source: "event" | "evidence" | "step_segment";
  frameCount?: number;
  durationMs?: number;
  actualFps?: number;
}

export interface KitchenStepAttemptSummary {
  attemptId: string;
  stepNumber: number;
  attemptNumber: number;
  supersedesAttemptId?: string;
  supersededByAttemptId?: string;
  segmentIds: string[];
  frameRefs: string[];
  chunkRefs: string[];
  nativeVideoPaths: string[];
  startedAt?: number;
  endedAt?: number;
  status: "current" | "superseded";
}

export interface KitchenSessionManifest {
  schemaVersion: "labos.kitchen.session-manifest.v1";
  generatedAt: string;
  run: {
    id: string;
    protocolId: string;
    protocolName: string;
    status: string;
    createdAt: number;
    startedAt?: number;
    endedAt?: number;
    currentStepIndex: number;
    metrics: unknown;
  };
  captureContract: {
    primaryArtifact: "frame_sequence" | "native_rolling_video";
    frameRefRoot: "dashboard/data";
    temporalChunks: "optional" | "rolling_preview_mp4" | "native_rolling_video";
    stepBoundaries: "step_segments";
  };
  validationCatalog: {
    checks: MultiscaleValidationCheck[];
  };
  steps: ReturnType<typeof toStepLite>[];
  stepAttempts: KitchenStepAttemptSummary[];
  stepSegments: KitchenStepSegment[];
  frames: KitchenSessionManifestFrame[];
  chunks: KitchenSessionManifestChunk[];
  adherence: Array<{
    ts: number;
    stepNumber?: number;
    action?: string;
    state?: string;
    confidence?: number;
    reason?: string;
  }>;
  stepAnalyses?: KitchenStepAnalysisRecord[];
  vqaAnnotationRecords?: StepVqaAnnotationRecord[];
  vqaAnnotations?: StepVqaAnnotation[];
  vqaBoundaryAnalysis?: SavedRunBoundaryAnalysis;
  readiness?: KitchenCaptureReadiness;
  rollingEvidence?: {
    enabled: boolean;
    nativeVideoPaths: string[];
    markers: Array<{
      ts: number;
      markerType?: string;
      stepNumber?: number;
      videoPath?: string;
    }>;
  };
  desktopNativeVideoPaths?: string[];
  desktopNativeVideoArtifacts?: Array<{
    devicePath: string;
    artifactRef: string;
    importedAt: string;
    size?: number;
    sha256?: string;
    sourceDeviceSerial?: string;
    metadata?: KitchenNativeVideoMetadata;
    attachedStepNumber?: number;
    attachedAttemptId?: string;
  }>;
  events: KitchenRunEvent[];
  exportHints: {
    trainingRepoRawTarget: string;
    stableJoinKeys: string[];
  };
}

export interface AttachKitchenNativeVideoArtifactInput {
  devicePath: string;
  localPath: string;
  sha256?: string;
  sourceDeviceSerial?: string;
  stepNumber?: number;
  attemptId?: string;
}

export interface BuildKitchenSessionManifestInput {
  run: ProtocolRun;
  rawEvents: KitchenRunEvent[];
  stepSegments: KitchenStepSegment[];
  generatedAt?: string;
}

function compactRollingChunk(chunk: any) {
  if (!chunk || typeof chunk !== "object") return chunk;
  return {
    chunkRef: chunk.chunkRef,
    indexRef: chunk.indexRef,
    frameCount: chunk.frameCount,
    requestedFps: chunk.requestedFps,
    actualFps: chunk.actualFps,
    startTs: chunk.startTs,
    endTs: chunk.endTs,
    durationMs: chunk.durationMs,
  };
}

function collectValidationCatalog(events: KitchenRunEvent[]) {
  const checks = new Map<string, MultiscaleValidationCheck>();
  for (const event of events) {
    for (const validationCheck of event.payload?.selectedChecks || []) {
      if (typeof validationCheck?.id === "string" && !checks.has(validationCheck.id)) {
        checks.set(validationCheck.id, validationCheck as MultiscaleValidationCheck);
      }
    }
  }
  return { checks: [...checks.values()].sort((a, b) => a.id.localeCompare(b.id)) };
}

function normalizeEventsForManifest(events: KitchenRunEvent[]): KitchenRunEvent[] {
  return events.map((event) => {
    if (!event.payload || typeof event.payload !== "object") return event;
    const payload = { ...event.payload };
    if (Array.isArray(payload.selectedChecks)) {
      payload.selectedCheckIds = payload.selectedChecks
        .map((validationCheck: any) => validationCheck?.id)
        .filter((id: unknown): id is string => typeof id === "string" && id.length > 0);
      delete payload.selectedChecks;
    }
    if (payload.rollingChunk) {
      payload.rollingChunk = compactRollingChunk(payload.rollingChunk);
    }
    return { ...event, payload };
  });
}

function collectFrames(
  steps: ReturnType<typeof toStepLite>[],
  events: KitchenRunEvent[],
  stepSegments: KitchenStepSegment[],
): KitchenSessionManifestFrame[] {
  const seen = new Set<string>();
  const frames: KitchenSessionManifestFrame[] = [];

  function push(frameRef: unknown, source: KitchenSessionManifestFrame["source"], stepNumber?: number) {
    if (typeof frameRef !== "string" || !frameRef) return;
    if (seen.has(frameRef)) return;
    seen.add(frameRef);
    frames.push({ frameRef, source, stepNumber });
  }

  for (const step of steps) {
    for (const verification of step.verifications) {
      push(verification.frameRef, "verification", step.number);
    }
  }
  for (const event of events) {
    const payload = event.payload || {};
    push(payload.frameRef, "event", payload.stepNumber);
    push(payload.verification?.frameRef, "event", payload.stepNumber);
  }
  for (const segment of stepSegments) {
    for (const frameRef of segment.frameRefs) {
      push(frameRef, "step_segment", segment.stepNumber);
    }
  }

  return frames;
}

function collectChunks(events: KitchenRunEvent[], stepSegments: KitchenStepSegment[]): KitchenSessionManifestChunk[] {
  const seen = new Set<string>();
  const chunks: KitchenSessionManifestChunk[] = [];

  function push(chunk: any, source: KitchenSessionManifestChunk["source"], stepNumber?: number) {
    const chunkRef = typeof chunk?.chunkRef === "string"
      ? chunk.chunkRef
      : typeof chunk?.artifactRef === "string"
        ? chunk.artifactRef
        : undefined;
    if (!chunkRef || seen.has(chunkRef)) return;
    seen.add(chunkRef);
    chunks.push({
      chunkRef,
      indexRef: typeof chunk?.indexRef === "string" ? chunk.indexRef : undefined,
      stepNumber,
      source,
      frameCount: Number.isFinite(Number(chunk?.frameCount)) ? Number(chunk.frameCount) : undefined,
      durationMs: Number.isFinite(Number(chunk?.durationMs)) ? Number(chunk.durationMs) : undefined,
      actualFps: Number.isFinite(Number(chunk?.actualFps)) ? Number(chunk.actualFps) : undefined,
    });
  }

  for (const event of events) {
    const payload = event.payload || {};
    push(payload.rollingChunk, "event", payload.stepNumber);
    for (const evidence of payload.evidence || []) {
      if (evidence?.artifactKind === "video_chunk") {
        push(evidence, "evidence", payload.stepNumber);
      }
    }
  }
  for (const segment of stepSegments) {
    for (const chunkRef of segment.chunkRefs) {
      push({ chunkRef }, "step_segment", segment.stepNumber);
    }
  }

  return chunks;
}

function collectStepAttempts(stepSegments: KitchenStepSegment[]): KitchenStepAttemptSummary[] {
  const attempts = new Map<string, KitchenStepAttemptSummary>();
  const supersededBy = new Map<string, string>();

  for (const segment of stepSegments) {
    const attemptNumber = Math.max(1, Number(segment.attemptNumber || 1));
    const attemptId = segment.attemptId || `${segment.runId}-step${segment.stepNumber}-attempt${attemptNumber}`;
    if (segment.supersedesAttemptId) {
      supersededBy.set(segment.supersedesAttemptId, attemptId);
    }
    const existing = attempts.get(attemptId) || {
      attemptId,
      stepNumber: segment.stepNumber,
      attemptNumber,
      supersedesAttemptId: segment.supersedesAttemptId,
      segmentIds: [],
      frameRefs: [],
      chunkRefs: [],
      nativeVideoPaths: [],
      startedAt: segment.startedAt,
      endedAt: segment.endedAt,
      status: "current" as const,
    };
    existing.segmentIds.push(segment.id);
    existing.frameRefs.push(...segment.frameRefs.filter((ref) => !existing.frameRefs.includes(ref)));
    existing.chunkRefs.push(...segment.chunkRefs.filter((ref) => !existing.chunkRefs.includes(ref)));
    for (const videoPath of nativeRecordingPathsForKitchenSegment(segment)) {
      if (videoPath && !existing.nativeVideoPaths.includes(videoPath)) {
        existing.nativeVideoPaths.push(videoPath);
      }
    }
    if (segment.startedAt !== undefined) {
      existing.startedAt = existing.startedAt === undefined ? segment.startedAt : Math.min(existing.startedAt, segment.startedAt);
    }
    existing.endedAt = existing.endedAt === undefined ? segment.endedAt : Math.max(existing.endedAt, segment.endedAt);
    attempts.set(attemptId, existing);
  }

  for (const attempt of attempts.values()) {
    attempt.supersededByAttemptId = supersededBy.get(attempt.attemptId);
    attempt.status = attempt.supersededByAttemptId ? "superseded" : "current";
  }

  return [...attempts.values()].sort((a, b) => (
    a.stepNumber - b.stepNumber ||
    a.attemptNumber - b.attemptNumber ||
    a.attemptId.localeCompare(b.attemptId)
  ));
}

function collectAdherence(events: KitchenRunEvent[]) {
  return events
    .filter((event) => event.payload?.source === "adherence-tick" || event.payload?.adherence)
    .map((event) => ({
      ts: event.ts,
      stepNumber: event.payload?.stepNumber,
      action: event.payload?.adherence?.action,
      state: event.payload?.adherence?.state,
      confidence: event.payload?.adherence?.confidence,
      reason: event.payload?.adherence?.reason,
    }));
}

function collectRollingEvidence(events: KitchenRunEvent[], stepSegments: KitchenStepSegment[]) {
  const rollingEvents = events.filter((event) => event.type.startsWith("rolling_evidence_"));
  const enabled = rollingEvents.length > 0;
  const nativeVideoPaths = new Set<string>();
  const markers: NonNullable<KitchenSessionManifest["rollingEvidence"]>["markers"] = [];

  for (const segment of stepSegments) {
    for (const videoPath of nativeRecordingPathsForKitchenSegment(segment)) {
      if (videoPath) nativeVideoPaths.add(videoPath);
    }
  }

  for (const event of rollingEvents) {
    const payload = event.payload || {};
    const videoPath = payload.activeVideoPath || payload.lastVideoPath;
    if (typeof payload.activeVideoPath === "string" && payload.activeVideoPath) nativeVideoPaths.add(payload.activeVideoPath);
    if (typeof payload.lastVideoPath === "string" && payload.lastVideoPath) nativeVideoPaths.add(payload.lastVideoPath);
    if (event.type === "rolling_evidence_marker") {
      markers.push({
        ts: event.ts,
        markerType: typeof payload.markerType === "string" ? payload.markerType : undefined,
        stepNumber: Number.isFinite(Number(payload.stepNumber)) ? Number(payload.stepNumber) : undefined,
        videoPath: typeof videoPath === "string" && videoPath ? videoPath : undefined,
      });
    }
  }

  return {
    enabled,
    nativeVideoPaths: [...nativeVideoPaths].sort(),
    markers,
  };
}

function normalizeStepAnalysis(payload: any, event: KitchenRunEvent): KitchenStepAnalysisRecord | null {
  const analysis = payload?.analysis;
  if (!analysis || typeof analysis !== "object") return null;
  if (typeof analysis.id !== "string" || typeof analysis.segmentId !== "string") return null;
  const status = analysis.status;
  if (status !== "queued" && status !== "running" && status !== "completed" && status !== "error") return null;
  const stepNumber = Number(analysis.stepNumber ?? payload.stepNumber);
  if (!Number.isFinite(stepNumber)) return null;
  const confidence = analysis.confidence === undefined ? undefined : Number(analysis.confidence);
  const latencyMs = analysis.latencyMs === undefined ? undefined : Number(analysis.latencyMs);
  return {
    id: analysis.id,
    status,
    runId: typeof analysis.runId === "string" ? analysis.runId : event.runId || "",
    protocolId: typeof analysis.protocolId === "string" ? analysis.protocolId : event.protocolId || "",
    segmentId: analysis.segmentId,
    attemptId: typeof analysis.attemptId === "string" ? analysis.attemptId : undefined,
    attemptNumber: Number.isFinite(Number(analysis.attemptNumber)) ? Number(analysis.attemptNumber) : undefined,
    stepNumber,
    modelId: typeof analysis.modelId === "string" ? analysis.modelId : "",
    queuedAt: typeof analysis.queuedAt === "string" ? analysis.queuedAt : undefined,
    startedAt: typeof analysis.startedAt === "string" ? analysis.startedAt : undefined,
    completedAt: typeof analysis.completedAt === "string" ? analysis.completedAt : undefined,
    latencyMs: Number.isFinite(latencyMs) ? latencyMs : undefined,
    evidenceRefs: Array.isArray(analysis.evidenceRefs)
      ? analysis.evidenceRefs.filter((ref: unknown): ref is string => typeof ref === "string" && ref.length > 0)
      : [],
    performedCorrectly: typeof analysis.performedCorrectly === "boolean" ? analysis.performedCorrectly : undefined,
    confidence: Number.isFinite(confidence) ? confidence : undefined,
    summary: typeof analysis.summary === "string" ? analysis.summary : undefined,
    deviation: typeof analysis.deviation === "string" || analysis.deviation === null ? analysis.deviation : undefined,
    visibleEvidence: Array.isArray(analysis.visibleEvidence)
      ? analysis.visibleEvidence.filter((item: unknown): item is string => typeof item === "string" && item.length > 0)
      : undefined,
    missingEvidence: Array.isArray(analysis.missingEvidence)
      ? analysis.missingEvidence.filter((item: unknown): item is string => typeof item === "string" && item.length > 0)
      : undefined,
    rawText: typeof analysis.rawText === "string" ? analysis.rawText : undefined,
    error: typeof analysis.error === "string" ? analysis.error : undefined,
  };
}

function collectStepAnalyses(events: KitchenRunEvent[]): KitchenStepAnalysisRecord[] {
  const latestById = new Map<string, { ts: number; value: KitchenStepAnalysisRecord }>();
  for (const event of events) {
    if (event.type !== "step_analysis") continue;
    const normalized = normalizeStepAnalysis(event.payload, event);
    if (!normalized) continue;
    const existing = latestById.get(normalized.id);
    if (!existing || event.ts >= existing.ts) {
      latestById.set(normalized.id, { ts: event.ts, value: normalized });
    }
  }
  return [...latestById.values()]
    .map((entry) => entry.value)
    .sort((a, b) => (
      a.stepNumber - b.stepNumber ||
      (a.attemptNumber || 0) - (b.attemptNumber || 0) ||
      a.id.localeCompare(b.id)
    ));
}

function collectVqaAnnotations(events: KitchenRunEvent[]): StepVqaAnnotation[] {
  const annotations: StepVqaAnnotation[] = [];
  const seen = new Set<string>();
  for (const event of events) {
    const stepNumber = Number(event.payload?.stepNumber);
    for (const evidence of event.payload?.evidence || []) {
      if (evidence?.modeId !== "vqa-annotation") continue;
      const parsed = evidence.parsed;
      if (!parsed || parsed.schemaVersion !== "labos.vqa.step.v1") continue;
      const key = [
        event.runId || parsed.protocolId || "",
        Number.isFinite(stepNumber) ? stepNumber : parsed.stepNumber,
        event.ts,
        evidence.checkId || "",
      ].join(":");
      if (seen.has(key)) continue;
      seen.add(key);
      annotations.push(parsed as StepVqaAnnotation);
    }
  }
  return annotations.sort((a, b) => a.stepNumber - b.stepNumber || a.stepId.localeCompare(b.stepId));
}

function normalizeVqaAnnotationRecord(payload: any, event: KitchenRunEvent): StepVqaAnnotationRecord | null {
  const record = payload?.annotationRecord;
  if (!record || typeof record !== "object") return null;
  if (typeof record.id !== "string" || typeof record.segmentId !== "string") return null;
  const status = record.status;
  if (status !== "queued" && status !== "running" && status !== "completed" && status !== "error") return null;
  const stepNumber = Number(record.stepNumber ?? payload.stepNumber);
  if (!Number.isFinite(stepNumber)) return null;
  const latencyMs = record.latencyMs === undefined ? undefined : Number(record.latencyMs);
  return {
    id: record.id,
    status,
    runId: typeof record.runId === "string" ? record.runId : event.runId || "",
    protocolId: typeof record.protocolId === "string" ? record.protocolId : event.protocolId || "",
    segmentId: record.segmentId,
    attemptId: typeof record.attemptId === "string" ? record.attemptId : undefined,
    attemptNumber: Number.isFinite(Number(record.attemptNumber)) ? Number(record.attemptNumber) : undefined,
    stepNumber,
    modelId: typeof record.modelId === "string" ? record.modelId : "",
    queuedAt: typeof record.queuedAt === "string" ? record.queuedAt : undefined,
    startedAt: typeof record.startedAt === "string" ? record.startedAt : undefined,
    completedAt: typeof record.completedAt === "string" ? record.completedAt : undefined,
    latencyMs: Number.isFinite(latencyMs) ? latencyMs : undefined,
    evidenceRefs: Array.isArray(record.evidenceRefs)
      ? record.evidenceRefs.filter((ref: unknown): ref is string => typeof ref === "string" && ref.length > 0)
      : [],
    annotation: record.annotation?.schemaVersion === "labos.vqa.step.v1" ? record.annotation : undefined,
    rawText: typeof record.rawText === "string" ? record.rawText : undefined,
    error: typeof record.error === "string" ? record.error : undefined,
  };
}

function collectVqaAnnotationRecords(events: KitchenRunEvent[]): StepVqaAnnotationRecord[] {
  const latestById = new Map<string, { ts: number; value: StepVqaAnnotationRecord }>();
  for (const event of events) {
    if (event.type !== "vqa_annotation") continue;
    const normalized = normalizeVqaAnnotationRecord(event.payload, event);
    if (!normalized) continue;
    const existing = latestById.get(normalized.id);
    if (!existing || event.ts >= existing.ts) {
      latestById.set(normalized.id, { ts: event.ts, value: normalized });
    }
  }
  return [...latestById.values()]
    .map((entry) => entry.value)
    .sort((a, b) => (
      a.stepNumber - b.stepNumber ||
      (a.attemptNumber || 0) - (b.attemptNumber || 0) ||
      a.id.localeCompare(b.id)
    ));
}

export async function buildKitchenSessionManifest(runId?: string): Promise<KitchenSessionManifest> {
  const snapshot = await readCurrentRunSnapshot();
  const run =
    (runId ? protocolTracker.getRun(runId) : protocolTracker.getCurrentRun()) ||
    (snapshot?.run && (!runId || snapshot.run.id === runId) ? snapshot.run : null);

  if (!run) {
    throw new Error(runId ? `Run "${runId}" not found for manifest` : "No current kitchen run for manifest");
  }

  const rawEvents = await readKitchenEvents(run.id);
  const stepSegments = await readKitchenStepSegments(run.id);
  return buildKitchenSessionManifestFromArtifacts({ run, rawEvents, stepSegments });
}

export function buildKitchenSessionManifestFromArtifacts({
  run,
  rawEvents,
  stepSegments,
  generatedAt = new Date().toISOString(),
}: BuildKitchenSessionManifestInput): KitchenSessionManifest {
  const steps = run.steps.map(toStepLite);
  const validationCatalog = collectValidationCatalog(rawEvents);
  const events = normalizeEventsForManifest(rawEvents);
  const stepAnalyses = collectStepAnalyses(rawEvents);
  const vqaAnnotationRecords = collectVqaAnnotationRecords(rawEvents);
  const vqaAnnotations = collectVqaAnnotations(rawEvents);
  const frames = collectFrames(steps, rawEvents, stepSegments);
  const chunks = collectChunks(rawEvents, stepSegments);
  const rollingEvidence = collectRollingEvidence(rawEvents, stepSegments);

  return {
    schemaVersion: "labos.kitchen.session-manifest.v1",
    generatedAt,
    run: {
      id: run.id,
      protocolId: run.protocolId,
      protocolName: run.protocolName,
      status: run.status,
      createdAt: run.createdAt,
      startedAt: run.startedAt,
      endedAt: run.endedAt,
      currentStepIndex: run.currentStepIndex,
      metrics: run.metrics,
    },
    captureContract: {
      primaryArtifact: rollingEvidence.enabled ? "native_rolling_video" : "frame_sequence",
      frameRefRoot: "dashboard/data",
      temporalChunks: rollingEvidence.enabled ? "native_rolling_video" : "rolling_preview_mp4",
      stepBoundaries: "step_segments",
    },
    validationCatalog,
    steps,
    stepAttempts: collectStepAttempts(stepSegments),
    stepSegments,
    frames,
    chunks,
    adherence: collectAdherence(rawEvents),
    stepAnalyses,
    vqaAnnotationRecords,
    vqaAnnotations: [
      ...vqaAnnotations,
      ...vqaAnnotationRecords
        .filter((record) => record.status === "completed" && record.annotation)
        .map((record) => record.annotation as StepVqaAnnotation),
    ],
    readiness: buildKitchenCaptureReadiness({
      run,
      steps,
      stepSegments,
      frames,
      chunks,
      stepAnalyses,
    }),
    rollingEvidence,
    events,
    exportHints: {
      trainingRepoRawTarget: "openlabos-training/data/raw/openlabos-runs",
      stableJoinKeys: ["run.id", "run.protocolId", "steps.number", "stepAttempts.attemptId", "stepSegments.id", "frames.frameRef"],
    },
  };
}

export async function saveKitchenSessionManifest(runId?: string) {
  const manifest = await buildKitchenSessionManifest(runId);
  const manifestRef = await writeKitchenSessionManifest(manifest.run.id, manifest);
  return { manifest, manifestRef };
}

export async function attachKitchenNativeVideoArtifact(
  runId: string,
  input: AttachKitchenNativeVideoArtifactInput,
): Promise<{ manifest: KitchenSessionManifest; manifestRef: string; artifact: KitchenNativeVideoArtifact }> {
  const manifest = await readKitchenSessionManifestFile(runId) as KitchenSessionManifest;
  if (!manifest?.run?.id || manifest.run.id !== runId) {
    throw new Error("Saved kitchen session manifest does not match requested run");
  }

  const artifact = await registerCachedKitchenNativeVideo(runId, input.devicePath, input.localPath);
  const devicePath = artifact.devicePath;
  const importedAt = new Date().toISOString();
  const cachedPath = resolveKitchenArtifactRef(artifact.ref, { allowedKinds: ["native_video"] }).localPath;
  const metadata = await probeNativeVideoMetadata(cachedPath).catch(() => undefined);

  const desktopNativeVideoPaths = new Set(manifest.desktopNativeVideoPaths || []);
  desktopNativeVideoPaths.add(devicePath);
  manifest.desktopNativeVideoPaths = [...desktopNativeVideoPaths].sort();
  manifest.desktopNativeVideoArtifacts = [
    ...(manifest.desktopNativeVideoArtifacts || []).filter((item) => item.devicePath !== devicePath),
    {
      devicePath,
      artifactRef: artifact.ref,
      importedAt,
      size: artifact.size,
      sha256: input.sha256,
      sourceDeviceSerial: input.sourceDeviceSerial,
      metadata,
      attachedStepNumber: Number.isFinite(Number(input.stepNumber)) ? Number(input.stepNumber) : undefined,
      attachedAttemptId: input.attemptId,
    },
  ].sort((a, b) => a.devicePath.localeCompare(b.devicePath));

  const stepNumber = Number(input.stepNumber);
  const attempts = Array.isArray(manifest.stepAttempts) ? manifest.stepAttempts : [];
  const targetAttempt = attempts.find((attempt) => (
    (input.attemptId && attempt.attemptId === input.attemptId) ||
    (Number.isFinite(stepNumber) && attempt.stepNumber === stepNumber)
  )) || [...attempts]
    .sort((a, b) => (b.endedAt || b.startedAt || 0) - (a.endedAt || a.startedAt || 0))
    .find((attempt) => attempt.status === "current") || attempts[attempts.length - 1];
  if (targetAttempt) {
    targetAttempt.nativeVideoPaths = Array.isArray(targetAttempt.nativeVideoPaths) ? targetAttempt.nativeVideoPaths : [];
  }
  if (targetAttempt && !targetAttempt.nativeVideoPaths.includes(devicePath)) {
    targetAttempt.nativeVideoPaths = [...targetAttempt.nativeVideoPaths, devicePath].sort();
  }

  const manifestRef = await writeKitchenSessionManifest(runId, manifest);
  return { manifest, manifestRef, artifact };
}
