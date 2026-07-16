import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { loadProvidersFromEnv } from "../providers.js";
import { runERMode } from "./er-runtime.js";
import { getProtocol } from "./protocols.js";
import {
  aggregateMultiscaleEvidence,
  buildModeForValidationCheck,
  evidenceFromError,
  evidenceFromResult,
  getStepPlanOrThrow,
  selectExecutableValidationChecks,
  type MultiscaleDecision,
  type MultiscaleEvidence,
  type ValidationScale,
} from "./multiscale-validation.js";
import { buildStepVqaQuestions, normalizeStepVqaAnnotation } from "./vqa-annotations.js";
import { nativeRecordingPathsForKitchenSegment } from "./evidence-store.js";
import {
  getKitchenDataPaths,
  readKitchenSessionManifestFile,
  type KitchenStepSegment,
} from "./run-store.js";
import type { KitchenSessionManifest } from "./session-manifest.js";
import { cacheKitchenNativeVideo } from "./video-artifact-cache.js";
import { resolveKitchenArtifactRef } from "./artifact-refs.js";

export type LiveAnnotationSimProfile =
  | "success-live"
  | "vqa-live"
  | "multiscale-frame"
  | "object-localization"
  | "safety-live";

export interface LiveAnnotationSimOptions {
  runIds: string[];
  modelId: string;
  profile: LiveAnnotationSimProfile;
  fps?: number;
  maxTicksPerSegment?: number;
  maxSegmentsPerRun?: number;
  stepNumbers?: number[];
  width?: number;
  parallelChecks?: boolean;
  label?: string;
}

export interface LiveAnnotationSimCheckRow {
  checkId: string;
  modeId: string;
  scale: ValidationScale;
  ok: boolean;
  passed?: boolean;
  confidence?: number;
  latencyMs?: number;
  warningCount: number;
  blockerCount: number;
  parseError?: boolean;
  outputShape?: string;
  answerCount?: number;
  questionCount?: number;
  missingEvidenceCount?: number;
  rawPreview?: string;
  parsed?: unknown;
  error?: string;
}

export interface LiveAnnotationSimTickRow {
  runId: string;
  protocolId: string;
  segmentId: string;
  stepNumber: number;
  attemptNumber?: number;
  tickIndex: number;
  simulatedTimeSec: number;
  frameRef: string;
  frameBytes: number;
  modelId: string;
  profile: LiveAnnotationSimProfile;
  checkCount: number;
  tickLatencyMs: number;
  decision: MultiscaleDecision;
  checks: LiveAnnotationSimCheckRow[];
}

export interface LiveAnnotationSimSummary {
  totalTicks: number;
  completedTicks: number;
  errorChecks: number;
  avgTickLatencyMs: number | null;
  medianTickLatencyMs: number | null;
  p95TickLatencyMs: number | null;
  avgCheckLatencyMs: number | null;
  medianCheckLatencyMs: number | null;
  p95CheckLatencyMs: number | null;
  avgConfidence: number | null;
  advanceCount: number;
  retryFrameCount: number;
  collectShortChunkCount: number;
  manualReviewCount: number;
  ticksPerMinute: number;
}

export interface LiveAnnotationSimResult {
  schemaVersion: "labos.kitchen.live-annotation-sim.v1";
  generatedAt: string;
  label?: string;
  runIds: string[];
  modelId: string;
  profile: LiveAnnotationSimProfile;
  fps: number;
  width: number;
  maxTicksPerSegment?: number;
  maxSegmentsPerRun?: number;
  stepNumbers?: number[];
  parallelChecks: boolean;
  preparationMs: number;
  elapsedMs: number;
  segmentCount: number;
  rows: LiveAnnotationSimTickRow[];
  summary: LiveAnnotationSimSummary;
}

export interface LiveAnnotationSimArtifact {
  path: string;
  ref: string;
  result: LiveAnnotationSimResult;
}

const DEFAULT_MODEL = "google:gemini-robotics-er-1.6-preview";

function isoStamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function safePart(value: string | number | undefined) {
  return String(value || "x").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 80);
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, item) => sum + item, 0) / values.length : null;
}

function percentile(values: number[], p: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

function finiteNumbers(values: Array<number | undefined>) {
  return values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
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

async function extractSimFrames(inputPath: string, outDir: string, opts: { fps: number; width: number; maxFrames?: number }) {
  await fs.promises.mkdir(outDir, { recursive: true });
  const outputPattern = path.join(outDir, "frame-%05d.jpg");
  const vf = `fps=${opts.fps.toFixed(3)},scale=${opts.width}:-2`;
  await runProcess(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      inputPath,
      "-vf",
      vf,
      ...(opts.maxFrames ? ["-frames:v", String(opts.maxFrames)] : []),
      "-q:v",
      "3",
      outputPattern,
    ],
    180_000,
    "ffmpeg timed out while extracting simulated live frames",
  );
  const files = await fs.promises.readdir(outDir).catch(() => []);
  return files
    .filter((file) => /^frame-\d+\.jpg$/i.test(file))
    .sort()
    .map((file) => path.join(outDir, file));
}

function selectedModeIds(profile: LiveAnnotationSimProfile) {
  switch (profile) {
    case "success-live":
      return new Set(["success-check"]);
    case "vqa-live":
      return new Set(["vqa-annotation"]);
    case "object-localization":
      return new Set(["object-pointing"]);
    case "safety-live":
      return new Set(["safety-check"]);
    case "multiscale-frame":
    default:
      return new Set(["object-pointing", "success-check", "vqa-annotation", "safety-check", "liquid-level", "instrument-read"]);
  }
}

function maxChecksForProfile(profile: LiveAnnotationSimProfile) {
  if (profile === "multiscale-frame") return 4;
  if (profile === "object-localization") return 2;
  return 1;
}

function outputShape(parsed: unknown) {
  if (Array.isArray(parsed)) return `array:${parsed.length}`;
  if (parsed && typeof parsed === "object") return `object:${Object.keys(parsed as Record<string, unknown>).slice(0, 8).join(",")}`;
  return typeof parsed;
}

async function runCheck(input: {
  validationCheck: ReturnType<typeof selectExecutableValidationChecks>[number];
  protocol: NonNullable<ReturnType<typeof getProtocol>>;
  step: NonNullable<ReturnType<typeof getProtocol>>["steps"][number];
  frameBuffer: Buffer;
  modelId: string;
}) {
  const { validationCheck, protocol, step, frameBuffer, modelId } = input;
  try {
    const mode = buildModeForValidationCheck(protocol, step, validationCheck);
    const result = await runERMode(mode, {
      modelId,
      frameBuffer,
      thinkingLevel: mode.thinkingBudget === 0 ? "minimal" : undefined,
    });
    const normalizedResult = validationCheck.modeId === "vqa-annotation"
      ? {
          ...result,
          parsed: normalizeStepVqaAnnotation({
            protocol,
            step,
            parsed: result.parsed,
            questions: buildStepVqaQuestions(protocol, step),
          }),
        }
      : result;
    return evidenceFromResult(validationCheck, normalizedResult, step);
  } catch (error) {
    return evidenceFromError(validationCheck, error);
  }
}

async function runTick(input: {
  segment: KitchenStepSegment;
  framePath: string;
  frameRef: string;
  tickIndex: number;
  fps: number;
  modelId: string;
  profile: LiveAnnotationSimProfile;
  parallelChecks: boolean;
}): Promise<LiveAnnotationSimTickRow> {
  const protocol = getProtocol(input.segment.protocolId);
  if (!protocol) throw new Error(`Protocol not found: ${input.segment.protocolId}`);
  const step = protocol.steps.find((candidate) => candidate.number === input.segment.stepNumber);
  if (!step) throw new Error(`Step not found: ${input.segment.protocolId}:${input.segment.stepNumber}`);
  const plan = getStepPlanOrThrow(protocol, step.number);
  const allowedModeIds = selectedModeIds(input.profile);
  const executable = selectExecutableValidationChecks(
    { ...plan, checks: plan.checks.filter((check) => allowedModeIds.has(check.modeId)) },
    { frameBuffer: Buffer.alloc(1) },
    ["frame"],
    maxChecksForProfile(input.profile),
  );
  const frameBuffer = await fs.promises.readFile(input.framePath);
  const startedAt = Date.now();
  const evidence = input.parallelChecks
    ? await Promise.all(executable.map((validationCheck) => runCheck({
        validationCheck,
        protocol,
        step,
        frameBuffer,
        modelId: input.modelId,
      })))
    : [];
  if (!input.parallelChecks) {
    for (const validationCheck of executable) {
      evidence.push(await runCheck({
        validationCheck,
        protocol,
        step,
        frameBuffer,
        modelId: input.modelId,
      }));
    }
  }
  const tickLatencyMs = Date.now() - startedAt;
  const decision = aggregateMultiscaleEvidence(plan, evidence);
  return {
    runId: input.segment.runId,
    protocolId: input.segment.protocolId,
    segmentId: input.segment.id,
    stepNumber: input.segment.stepNumber,
    attemptNumber: input.segment.attemptNumber,
    tickIndex: input.tickIndex,
    simulatedTimeSec: input.tickIndex / input.fps,
    frameRef: input.frameRef,
    frameBytes: frameBuffer.length,
    modelId: input.modelId,
    profile: input.profile,
    checkCount: executable.length,
    tickLatencyMs,
    decision,
    checks: evidence.map((item): LiveAnnotationSimCheckRow => ({
      checkId: item.checkId,
      modeId: item.modeId,
      scale: item.scale,
      ok: item.ok,
      passed: item.passed,
      confidence: item.confidence,
      latencyMs: item.latencyMs,
      warningCount: item.warnings.length,
      blockerCount: item.blockers.length,
      parseError: !!(item.parsed as any)?.parseError,
      outputShape: item.parsed === undefined ? undefined : outputShape(item.parsed),
      answerCount: Array.isArray((item.parsed as any)?.answers) ? (item.parsed as any).answers.length : undefined,
      questionCount: Array.isArray((item.parsed as any)?.questions) ? (item.parsed as any).questions.length : undefined,
      missingEvidenceCount: Array.isArray((item.parsed as any)?.missingEvidence) ? (item.parsed as any).missingEvidence.length : undefined,
      rawPreview: typeof item.raw === "string" ? item.raw.slice(0, 1200) : undefined,
      parsed: item.parsed,
      error: item.error,
    })),
  };
}

function summarize(rows: LiveAnnotationSimTickRow[], elapsedMs: number): LiveAnnotationSimSummary {
  const tickLatencies = finiteNumbers(rows.map((row) => row.tickLatencyMs));
  const checkLatencies = finiteNumbers(rows.flatMap((row) => row.checks.map((check) => check.latencyMs)));
  const confidences = finiteNumbers(rows.map((row) => row.decision.confidence));
  return {
    totalTicks: rows.length,
    completedTicks: rows.filter((row) => row.checks.some((check) => check.ok)).length,
    errorChecks: rows.flatMap((row) => row.checks).filter((check) => !check.ok).length,
    avgTickLatencyMs: average(tickLatencies),
    medianTickLatencyMs: percentile(tickLatencies, 50),
    p95TickLatencyMs: percentile(tickLatencies, 95),
    avgCheckLatencyMs: average(checkLatencies),
    medianCheckLatencyMs: percentile(checkLatencies, 50),
    p95CheckLatencyMs: percentile(checkLatencies, 95),
    avgConfidence: average(confidences),
    advanceCount: rows.filter((row) => row.decision.action === "advance").length,
    retryFrameCount: rows.filter((row) => row.decision.action === "retry_frame").length,
    collectShortChunkCount: rows.filter((row) => row.decision.action === "collect_short_chunk").length,
    manualReviewCount: rows.filter((row) => row.decision.action === "manual_review").length,
    ticksPerMinute: rows.length ? rows.length / (elapsedMs / 60_000) : 0,
  };
}

function selectSegments(manifest: KitchenSessionManifest, opts: LiveAnnotationSimOptions) {
  const stepFilter = opts.stepNumbers?.length ? new Set(opts.stepNumbers) : null;
  const segments = (manifest.stepSegments || [])
    .filter((segment) => !stepFilter || stepFilter.has(segment.stepNumber))
    .sort((a, b) => a.stepNumber - b.stepNumber || (a.attemptNumber || 0) - (b.attemptNumber || 0));
  return opts.maxSegmentsPerRun && opts.maxSegmentsPerRun > 0
    ? segments.slice(0, opts.maxSegmentsPerRun)
    : segments;
}

export async function runLiveAnnotationSim(opts: LiveAnnotationSimOptions): Promise<LiveAnnotationSimArtifact> {
  loadProvidersFromEnv();
  const modelId = opts.modelId || DEFAULT_MODEL;
  const fps = opts.fps && opts.fps > 0 ? opts.fps : 0.2;
  const width = opts.width && opts.width > 0 ? opts.width : 640;
  const startedAt = Date.now();
  const prepStartedAt = Date.now();
  const paths = getKitchenDataPaths();
  const runIds = [...new Set(opts.runIds.map((item) => item.trim()).filter(Boolean))];
  if (!runIds.length) throw new Error("At least one run id is required");

  const segments: KitchenStepSegment[] = [];
  for (const runId of runIds) {
    const manifest = await readKitchenSessionManifestFile(runId) as KitchenSessionManifest;
    segments.push(...selectSegments(manifest, opts));
  }

  const frameJobs: Array<{ segment: KitchenStepSegment; framePath: string; frameRef: string; tickIndex: number }> = [];
  for (const segment of segments) {
    const devicePath = nativeRecordingPathsForKitchenSegment(segment)[0];
    if (!devicePath) continue;
    const cached = await cacheKitchenNativeVideo(segment.runId, devicePath);
    if (cached.status !== "cached") continue;
    const artifact = resolveKitchenArtifactRef(cached.ref, { allowedKinds: ["native_video"] });
    const relDir = path.posix.join(
      "kitchen/live-sim-frames",
      safePart(segment.runId),
      `${safePart(segment.id)}-fps${safePart(fps)}-w${safePart(width)}-${safePart(opts.maxTicksPerSegment || "all")}`,
    );
    const outDir = path.join(paths.dataDir, relDir);
    const framePaths = await extractSimFrames(artifact.localPath, outDir, {
      fps,
      width,
      maxFrames: opts.maxTicksPerSegment,
    });
    framePaths.forEach((framePath, index) => {
      frameJobs.push({
        segment,
        framePath,
        frameRef: path.relative(paths.dataDir, framePath).replace(/\\/g, "/"),
        tickIndex: index,
      });
    });
  }
  const preparationMs = Date.now() - prepStartedAt;

  const rows: LiveAnnotationSimTickRow[] = [];
  for (const job of frameJobs) {
    rows.push(await runTick({
      segment: job.segment,
      framePath: job.framePath,
      frameRef: job.frameRef,
      tickIndex: job.tickIndex,
      fps,
      modelId,
      profile: opts.profile,
      parallelChecks: opts.parallelChecks === true,
    }));
  }

  const elapsedMs = Date.now() - startedAt;
  const result: LiveAnnotationSimResult = {
    schemaVersion: "labos.kitchen.live-annotation-sim.v1",
    generatedAt: new Date().toISOString(),
    label: opts.label,
    runIds,
    modelId,
    profile: opts.profile,
    fps,
    width,
    maxTicksPerSegment: opts.maxTicksPerSegment,
    maxSegmentsPerRun: opts.maxSegmentsPerRun,
    stepNumbers: opts.stepNumbers,
    parallelChecks: opts.parallelChecks === true,
    preparationMs,
    elapsedMs,
    segmentCount: segments.length,
    rows,
    summary: summarize(rows, elapsedMs),
  };

  const outDir = path.join(paths.kitchenDir, "live-sim-benchmarks");
  await fs.promises.mkdir(outDir, { recursive: true });
  const filename = `live-sim-${isoStamp()}-${safePart(opts.profile)}-${safePart(opts.label)}.json`;
  const outPath = path.join(outDir, filename);
  await fs.promises.writeFile(outPath, JSON.stringify(result, null, 2));
  return {
    path: outPath,
    ref: path.relative(paths.dataDir, outPath).replace(/\\/g, "/"),
    result,
  };
}
