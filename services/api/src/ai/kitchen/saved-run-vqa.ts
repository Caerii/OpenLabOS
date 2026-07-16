import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { labosGenerateText } from "../labos-inference.js";
import {
  asyncStepAnalysisModel,
  resolveAsyncStepAnalysisModel,
} from "./async-step-analysis.js";
import {
  isSafeKitchenFrameRef,
  resolveKitchenArtifactRef,
} from "./artifact-refs.js";
import { buildKitchenCaptureReadiness } from "./capture-readiness.js";
import { getProtocol } from "./protocols.js";
import {
  appendKitchenEvent,
  getKitchenDataPaths,
  readKitchenSessionManifestFile,
  writeKitchenSessionManifest,
  type KitchenStepSegment,
} from "./run-store.js";
import { nativeRecordingPathsForKitchenSegment } from "./evidence-store.js";
import {
  cacheKitchenNativeVideo,
} from "./video-artifact-cache.js";
import type { KitchenSessionManifest } from "./session-manifest.js";
import {
  buildStepVqaQuestions,
  normalizeStepVqaAnnotation,
  type StepVqaAnnotation,
  type StepVqaAnnotationRecord,
} from "./vqa-annotations.js";

export interface SavedRunVqaOptions {
  modelId?: string;
  force?: boolean;
  retryErrors?: boolean;
}

export interface SavedRunVqaQueueResult {
  runId: string;
  modelId: string;
  queuedSegmentCount: number;
  skippedSegmentCount: number;
  queuedStepNumbers: number[];
}

interface SavedRunSegmentVqaOptions {
  modelId?: string;
  recordEvents?: boolean;
  manifest?: Partial<Pick<KitchenSessionManifest, "stepAttempts">>;
}

const MAX_VQA_FRAMES = 5;
const TEMPORAL_VQA_CONTACT_SHEET_FRAMES = 6;

let savedRunVqaQueue: Promise<void> = Promise.resolve();

function isoNow() {
  return new Date().toISOString();
}

function savedRunVqaModel(env: NodeJS.ProcessEnv = process.env) {
  return env.LABOS_POST_RUN_VQA_MODEL?.trim() || asyncStepAnalysisModel(env);
}

function safePart(value: string | number | undefined) {
  return String(value || "x").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 80);
}

function vqaIdForSegment(segment: KitchenStepSegment) {
  return `vqa-${segment.id}`;
}

function usableFrameRefs(segment: KitchenStepSegment) {
  return (Array.isArray(segment.frameRefs) ? segment.frameRefs : []).filter(isSafeKitchenFrameRef);
}

function recordBelongsToManifest(
  manifest: Partial<Pick<KitchenSessionManifest, "run">>,
  record: StepVqaAnnotationRecord,
) {
  if (manifest.run?.id && record.runId && record.runId !== manifest.run.id) return false;
  if (manifest.run?.protocolId && record.protocolId && record.protocolId !== manifest.run.protocolId) return false;
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

function latestRecordsBySegment(
  manifest: Pick<KitchenSessionManifest, "vqaAnnotationRecords"> & Partial<Pick<KitchenSessionManifest, "run">>,
) {
  const latest = new Map<string, StepVqaAnnotationRecord>();
  for (const record of manifest.vqaAnnotationRecords || []) {
    if (!record?.segmentId) continue;
    if (!recordBelongsToManifest(manifest, record)) continue;
    latest.set(record.segmentId, record);
  }
  return latest;
}

function hasPotentialSavedRunVqaEvidence(segment: KitchenStepSegment) {
  return usableFrameRefs(segment).length > 0 || nativeRecordingPathsForKitchenSegment(segment).length > 0;
}

function nativeVideoPathsForSavedSegment(
  manifest: Partial<Pick<KitchenSessionManifest, "stepAttempts">>,
  segment: KitchenStepSegment,
) {
  const paths = new Set(nativeRecordingPathsForKitchenSegment(segment));
  for (const attempt of manifest.stepAttempts || []) {
    const segmentIds = Array.isArray(attempt.segmentIds) ? attempt.segmentIds : [];
    if (
      (segment.attemptId && attempt.attemptId === segment.attemptId) ||
      segmentIds.includes(segment.id)
    ) {
      for (const videoPath of attempt.nativeVideoPaths || []) {
        if (typeof videoPath === "string" && videoPath) paths.add(videoPath);
      }
    }
  }
  return [...paths];
}

function hasPotentialSavedRunVqaEvidenceInManifest(
  manifest: Partial<Pick<KitchenSessionManifest, "stepAttempts">>,
  segment: KitchenStepSegment,
) {
  return hasPotentialSavedRunVqaEvidence(segment) || nativeVideoPathsForSavedSegment(manifest, segment).length > 0;
}

export function segmentsNeedingSavedRunVqa(
  manifest: Pick<KitchenSessionManifest, "stepSegments" | "vqaAnnotationRecords"> & Partial<Pick<KitchenSessionManifest, "run" | "steps" | "stepAttempts">>,
  opts: Pick<SavedRunVqaOptions, "force" | "retryErrors"> = {},
) {
  const retryErrors = opts.retryErrors !== false;
  const latest = latestRecordsBySegment(manifest);
  return (manifest.stepSegments || []).filter((segment) => {
    if (!segmentBelongsToManifest(manifest, segment)) return false;
    if (!hasPotentialSavedRunVqaEvidenceInManifest(manifest, segment)) return false;
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
): StepVqaAnnotationRecord {
  return {
    id: vqaIdForSegment(segment),
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

function completedAnnotations(records: StepVqaAnnotationRecord[]) {
  return records
    .filter((record) => record.status === "completed" && record.annotation)
    .map((record) => record.annotation as StepVqaAnnotation);
}

export function upsertSavedRunVqaAnnotationRecords(
  manifest: KitchenSessionManifest,
  records: StepVqaAnnotationRecord[],
): KitchenSessionManifest {
  const byId = new Map<string, StepVqaAnnotationRecord>();
  for (const record of manifest.vqaAnnotationRecords || []) {
    if (record?.id) byId.set(record.id, record);
  }
  for (const record of records) {
    byId.set(record.id, record);
  }
  const vqaAnnotationRecords = [...byId.values()].sort((a, b) => (
    a.stepNumber - b.stepNumber ||
    (a.attemptNumber || 0) - (b.attemptNumber || 0) ||
    a.id.localeCompare(b.id)
  ));
  const liveAnnotations = (manifest.vqaAnnotations || [])
    .filter((annotation) => annotation.source !== "saved-run-batch");
  const nextManifest = {
    ...manifest,
    generatedAt: isoNow(),
    vqaAnnotationRecords,
    vqaAnnotations: [...liveAnnotations, ...completedAnnotations(vqaAnnotationRecords)],
  };
  return {
    ...nextManifest,
    readiness: buildKitchenCaptureReadiness({
      run: nextManifest.run,
      steps: nextManifest.steps || [],
      stepSegments: nextManifest.stepSegments || [],
      frames: nextManifest.frames || [],
      chunks: nextManifest.chunks || [],
      stepAnalyses: nextManifest.stepAnalyses || [],
    }),
  };
}

async function readSavedManifest(runId: string): Promise<KitchenSessionManifest> {
  return await readKitchenSessionManifestFile(runId) as KitchenSessionManifest;
}

async function writeSavedManifest(runId: string, manifest: KitchenSessionManifest) {
  await writeKitchenSessionManifest(runId, manifest);
}

async function loadEvidenceFrames(frameRefs: string[]) {
  const refs = frameRefs.filter(isSafeKitchenFrameRef).slice(0, MAX_VQA_FRAMES + 1);
  if (!refs.length) throw new Error("No saved frame evidence is available for VQA annotation");
  const frames: Array<{ ref: string; buffer: Buffer }> = [];
  for (const ref of refs) {
    const artifact = resolveKitchenArtifactRef(ref, { allowedKinds: ["frame"] });
    frames.push({ ref: artifact.ref, buffer: await fs.promises.readFile(artifact.localPath) });
  }
  return frames;
}

function runProcess(command: string, args: string[], timeoutMs: number, timeoutMessage: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(timeoutMessage));
    }, timeoutMs);

    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout);
      else reject(new Error(`${command} failed with exit code ${code}: ${stderr.slice(-1200)}`));
    });
  });
}

async function probeVideoDurationSec(videoPath: string) {
  const output = await runProcess(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      videoPath,
    ],
    30_000,
    "ffprobe timed out while reading native step video",
  );
  const duration = Number(output.trim());
  return Number.isFinite(duration) && duration > 0 ? duration : null;
}

async function extractVideoContactSheet(videoPath: string, outputPath: string, durationSec: number | null) {
  const fps = durationSec && durationSec > 0
    ? Math.max(0.2, Math.min(2, TEMPORAL_VQA_CONTACT_SHEET_FRAMES / durationSec))
    : 1;
  await runProcess(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      videoPath,
      "-vf",
      `fps=${fps.toFixed(3)},scale=512:-2,tile=3x2:padding=8:margin=4`,
      "-frames:v",
      "1",
      "-q:v",
      "3",
      outputPath,
    ],
    90_000,
    "ffmpeg timed out while extracting VQA evidence frames",
  );
}

async function extractTemporalEvidenceFrameRefs(
  segment: KitchenStepSegment,
  manifest?: Partial<Pick<KitchenSessionManifest, "stepAttempts">>,
) {
  const runId = segment.runId;
  const devicePath = manifest
    ? nativeVideoPathsForSavedSegment(manifest, segment)[0]
    : nativeRecordingPathsForKitchenSegment(segment)[0];
  if (!runId || !devicePath) return [];

  const cached = await cacheKitchenNativeVideo(runId, devicePath);
  if (cached.status !== "cached") return [];
  const nativeArtifact = resolveKitchenArtifactRef(cached.ref, { allowedKinds: ["native_video"] });
  if (!fs.existsSync(nativeArtifact.localPath)) return [];

  const paths = getKitchenDataPaths();
  await fs.promises.mkdir(paths.framesDir, { recursive: true });
  const durationSec = await probeVideoDurationSec(nativeArtifact.localPath).catch(() => null);
  const segmentPart = safePart(segment.id);
  const filename = [
    "vqa-contact",
    segmentPart,
    `${Date.now()}`,
  ].join("-") + ".jpg";
  const outputPath = path.join(paths.framesDir, filename);
  try {
    await extractVideoContactSheet(nativeArtifact.localPath, outputPath, durationSec);
    const stat = await fs.promises.stat(outputPath);
    if (stat.size > 0) return [`kitchen/frames/${filename}`];
  } catch {
    await fs.promises.unlink(outputPath).catch(() => {});
  }
  return [];
}

async function evidenceFrameRefsForSegment(
  segment: KitchenStepSegment,
  manifest?: Partial<Pick<KitchenSessionManifest, "stepAttempts">>,
) {
  const temporalRefs = await extractTemporalEvidenceFrameRefs(segment, manifest).catch(() => []);
  const snapshotRefs = usableFrameRefs(segment);
  const refs = [...temporalRefs, ...snapshotRefs];
  return [...new Set(refs)].slice(0, 2);
}

function extractJsonObject(text: string) {
  const trimmed = text.trim();
  const codeBlock = trimmed.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/i);
  if (codeBlock) return codeBlock[1];
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first >= 0 && last > first) return trimmed.slice(first, last + 1);
  return trimmed;
}

function promptForSavedVqa(protocolName: string, step: { number: number; instruction: string; successCriteria?: string; requiredObjects?: string[]; spatialHint?: string }, questions: ReturnType<typeof buildStepVqaQuestions>, segment: KitchenStepSegment) {
  return [
    "You are creating dataset-quality VQA annotations from saved smart-glasses evidence after a kitchen protocol run.",
    "The attached images are chronological snapshots from one step segment. Answer from visible evidence only.",
    "If different frames disagree, prefer uncertain and explain what evidence is missing.",
    "For step completion and recommended_next, visible final state can be sufficient even if a required tool used earlier is no longer visible. Keep object-presence answers literal, but do not force collect_more_evidence solely because a prior tool is absent when the completed state is clear.",
    "",
    `Protocol: ${protocolName}`,
    `Step ${step.number}: ${step.instruction}`,
    step.successCriteria ? `Success criteria: ${step.successCriteria}` : "",
    step.requiredObjects?.length ? `Required objects: ${step.requiredObjects.join(", ")}` : "",
    step.spatialHint ? `Spatial hint: ${step.spatialHint}` : "",
    `Segment id: ${segment.id}`,
    `Attempt: ${segment.attemptNumber || 1}`,
    "",
    "Questions:",
    ...questions.map((question) => `- ${question.id}: ${question.question}`),
    "",
    "Return ONLY valid JSON with this schema:",
    "{",
    '  "answers": [',
    '    {"question_id": string, "question": string, "answer": "yes|no|uncertain", "confidence": number, "evidence": string[], "object_refs": string[], "blocking_issue": string|null}',
    "  ],",
    '  "frame_summary": string,',
    '  "step_complete_likelihood": number,',
    '  "recommended_next": "advance|continue|collect_more_evidence|manual_review",',
    '  "missing_evidence": string[]',
    "}",
  ].filter(Boolean).join("\n");
}

function eventRecord(segment: KitchenStepSegment, record: StepVqaAnnotationRecord) {
  return appendKitchenEvent({
    type: "vqa_annotation",
    runId: segment.runId,
    protocolId: segment.protocolId,
    payload: { annotationRecord: record },
  });
}

async function runSavedKitchenSegmentVqa(
  segment: KitchenStepSegment,
  opts: SavedRunSegmentVqaOptions = {},
) {
  const recordEvents = opts.recordEvents !== false;
  const requestedModelId = opts.modelId || savedRunVqaModel();
  const modelId = await resolveAsyncStepAnalysisModel(requestedModelId);
  const protocol = getProtocol(segment.protocolId);
  const step = protocol?.steps.find((item) => item.number === segment.stepNumber);
  const evidenceRefs = await evidenceFrameRefsForSegment(segment, opts.manifest);
  const base: StepVqaAnnotationRecord = {
    ...queuedRecordForSegment(segment, modelId),
    evidenceRefs,
  };

  if (recordEvents) await eventRecord(segment, base);
  const startedAt = Date.now();
  if (recordEvents) await eventRecord(segment, { ...base, status: "running", startedAt: isoNow() });

  try {
    if (!protocol || !step) throw new Error(`Protocol step not found for ${segment.protocolId} step ${segment.stepNumber}`);
    const questions = buildStepVqaQuestions(protocol, step);
    const frames = await loadEvidenceFrames(evidenceRefs);
    const content: any[] = frames.map((frame) => ({ type: "image", image: frame.buffer }));
    content.push({ type: "text", text: promptForSavedVqa(protocol.name, step, questions, segment) });

    const result = await labosGenerateText({
      modelId,
      messages: [
        {
          role: "system" as const,
          content: "You produce strict JSON visual-question-answer annotations for kitchen protocol evidence. Return JSON only.",
        },
        { role: "user" as const, content },
      ],
      temperature: 0,
      maxOutputTokens: 1200,
    });
    const parsed = JSON.parse(extractJsonObject(result.text));
    const annotation: StepVqaAnnotation = {
      ...normalizeStepVqaAnnotation({ protocol, step, parsed, questions }),
      source: "saved-run-batch",
      runId: segment.runId,
      segmentId: segment.id,
      attemptId: segment.attemptId,
      attemptNumber: segment.attemptNumber,
      modelId,
      evidenceRefs: frames.map((frame) => frame.ref),
      createdAt: isoNow(),
    };
    const completed: StepVqaAnnotationRecord = {
      ...base,
      status: "completed",
      startedAt: new Date(startedAt).toISOString(),
      completedAt: isoNow(),
      latencyMs: Date.now() - startedAt,
      evidenceRefs: annotation.evidenceRefs || [],
      annotation,
      rawText: result.text.slice(0, 4000),
    };
    if (recordEvents) await eventRecord(segment, completed);
    return completed;
  } catch (error: any) {
    const failed: StepVqaAnnotationRecord = {
      ...base,
      status: "error",
      startedAt: new Date(startedAt).toISOString(),
      completedAt: isoNow(),
      latencyMs: Date.now() - startedAt,
      error: error?.message || String(error),
    };
    if (recordEvents) await eventRecord(segment, failed);
    return failed;
  }
}

export async function runSavedKitchenSegmentVqaAnnotation(
  segment: KitchenStepSegment,
  opts: { modelId?: string; manifest?: Partial<Pick<KitchenSessionManifest, "stepAttempts">> } = {},
) {
  return runSavedKitchenSegmentVqa(segment, { ...opts, recordEvents: true });
}

export async function runSavedKitchenSegmentVqaProbe(
  segment: KitchenStepSegment,
  opts: { modelId?: string; manifest?: Partial<Pick<KitchenSessionManifest, "stepAttempts">> } = {},
) {
  return runSavedKitchenSegmentVqa(segment, { ...opts, recordEvents: false });
}

async function markSavedRunVqaQueued(runId: string, opts: SavedRunVqaOptions) {
  const manifest = await readSavedManifest(runId);
  const modelId = opts.modelId || savedRunVqaModel();
  const segments = segmentsNeedingSavedRunVqa(manifest, opts);
  if (!segments.length) return { manifest, modelId, segments };
  const queuedManifest = upsertSavedRunVqaAnnotationRecords(
    manifest,
    segments.map((segment) => queuedRecordForSegment(segment, modelId)),
  );
  await writeSavedManifest(runId, queuedManifest);
  return { manifest: queuedManifest, modelId, segments };
}

async function processSavedRunVqa(
  runId: string,
  segments: KitchenStepSegment[],
  opts: SavedRunVqaOptions,
) {
  for (const segment of segments) {
    const current = await readSavedManifest(runId);
    const result = await runSavedKitchenSegmentVqaAnnotation(segment, {
      modelId: opts.modelId,
      manifest: current,
    });
    await writeSavedManifest(runId, upsertSavedRunVqaAnnotationRecords(current, [result]));
  }
}

export async function annotateSavedKitchenSessionManifestVqa(
  runId: string,
  opts: SavedRunVqaOptions = {},
) {
  const queued = await markSavedRunVqaQueued(runId, opts);
  await processSavedRunVqa(runId, queued.segments, opts);
  return {
    runId,
    modelId: queued.modelId,
    annotatedSegmentCount: queued.segments.length,
    skippedSegmentCount: Math.max(0, (queued.manifest.stepSegments || []).length - queued.segments.length),
  };
}

export async function queueSavedKitchenSessionManifestVqa(
  runId: string,
  opts: SavedRunVqaOptions = {},
): Promise<SavedRunVqaQueueResult> {
  const queued = await markSavedRunVqaQueued(runId, opts);
  savedRunVqaQueue = savedRunVqaQueue
    .catch(() => {})
    .then(() => processSavedRunVqa(runId, queued.segments, opts));
  return {
    runId,
    modelId: queued.modelId,
    queuedSegmentCount: queued.segments.length,
    skippedSegmentCount: Math.max(0, (queued.manifest.stepSegments || []).length - queued.segments.length),
    queuedStepNumbers: queued.segments.map((segment) => segment.stepNumber),
  };
}
