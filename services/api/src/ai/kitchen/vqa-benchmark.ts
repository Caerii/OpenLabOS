import fs from "fs";
import path from "path";
import { suggestedVisionMaxConcurrent } from "../model-strategy.js";
import {
  getKitchenDataPaths,
  readKitchenSessionManifestFile,
  type KitchenStepSegment,
} from "./run-store.js";
import type { KitchenSessionManifest } from "./session-manifest.js";
import { runSavedKitchenSegmentVqaProbe } from "./saved-run-vqa.js";
import type { StepVqaAnnotationRecord } from "./vqa-annotations.js";

export interface SavedRunVqaBenchmarkOptions {
  runIds: string[];
  modelIds: string[];
  stepNumbers?: number[];
  maxSegmentsPerRun?: number;
  label?: string;
  concurrent?: number;
}

export interface SavedRunVqaBenchmarkRow {
  runId: string;
  protocolId: string;
  segmentId: string;
  stepNumber: number;
  attemptNumber?: number;
  modelId: string;
  status: StepVqaAnnotationRecord["status"];
  latencyMs: number;
  evidenceRefs: string[];
  stepCompleteLikelihood?: number;
  recommendedNext?: string;
  missingEvidenceCount?: number;
  answerCount?: number;
  error?: string;
}

export interface SavedRunVqaBenchmarkSummary {
  modelId: string;
  total: number;
  completed: number;
  errors: number;
  avgLatencyMs: number | null;
  medianLatencyMs: number | null;
  p95LatencyMs: number | null;
  avgLikelihood: number | null;
  advanceCount: number;
  continueCount: number;
  collectMoreEvidenceCount: number;
  manualReviewCount: number;
  otherRecommendationCount: number;
  totalMissingEvidence: number;
}

export interface SavedRunVqaBenchmarkResult {
  schemaVersion: "labos.kitchen.vqa-benchmark.v1";
  generatedAt: string;
  label?: string;
  runIds: string[];
  modelIds: string[];
  stepNumbers?: number[];
  maxSegmentsPerRun?: number;
  requestedConcurrent?: number;
  effectiveConcurrencyByModel: Record<string, number>;
  segmentCount: number;
  rows: SavedRunVqaBenchmarkRow[];
  summaries: SavedRunVqaBenchmarkSummary[];
  elapsedMs: number;
  rowsPerMinute: number;
}

export interface SavedRunVqaBenchmarkArtifact {
  path: string;
  ref: string;
  result: SavedRunVqaBenchmarkResult;
}

function isoStamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function safePart(value: string | undefined) {
  return String(value || "benchmark").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 80);
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function percentile(values: number[], p: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

function average(values: number[]) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function selectSegments(manifest: KitchenSessionManifest, opts: SavedRunVqaBenchmarkOptions) {
  const stepFilter = opts.stepNumbers?.length ? new Set(opts.stepNumbers) : null;
  const segments = (manifest.stepSegments || [])
    .filter((segment) => !stepFilter || stepFilter.has(segment.stepNumber))
    .sort((a, b) => (
      a.stepNumber - b.stepNumber ||
      (a.attemptNumber || 0) - (b.attemptNumber || 0) ||
      a.id.localeCompare(b.id)
    ));
  return finiteNumber(opts.maxSegmentsPerRun) && opts.maxSegmentsPerRun > 0
    ? segments.slice(0, opts.maxSegmentsPerRun)
    : segments;
}

async function mapConcurrent<T, R>(
  values: T[],
  concurrency: number,
  fn: (value: T) => Promise<R>,
) {
  const results: R[] = new Array(values.length);
  let next = 0;
  const workerCount = Math.max(1, Math.min(concurrency, values.length || 1));
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (next < values.length) {
      const index = next;
      next += 1;
      results[index] = await fn(values[index]);
    }
  }));
  return results;
}

function rowFromRecord(segment: KitchenStepSegment, modelId: string, record: StepVqaAnnotationRecord): SavedRunVqaBenchmarkRow {
  return {
    runId: segment.runId,
    protocolId: segment.protocolId,
    segmentId: segment.id,
    stepNumber: segment.stepNumber,
    attemptNumber: segment.attemptNumber,
    modelId,
    status: record.status,
    latencyMs: record.latencyMs || 0,
    evidenceRefs: record.evidenceRefs || [],
    stepCompleteLikelihood: record.annotation?.stepCompleteLikelihood,
    recommendedNext: record.annotation?.recommendedNext,
    missingEvidenceCount: record.annotation?.missingEvidence?.length,
    answerCount: record.annotation?.answers?.length,
    error: record.error,
  };
}

async function benchmarkSegment(segment: KitchenStepSegment, modelId: string): Promise<SavedRunVqaBenchmarkRow> {
  const startedAt = Date.now();
  try {
    const record = await runSavedKitchenSegmentVqaProbe(segment, { modelId });
    return rowFromRecord(segment, modelId, record);
  } catch (error: any) {
    return {
      runId: segment.runId,
      protocolId: segment.protocolId,
      segmentId: segment.id,
      stepNumber: segment.stepNumber,
      attemptNumber: segment.attemptNumber,
      modelId,
      status: "error",
      latencyMs: Date.now() - startedAt,
      evidenceRefs: [],
      error: error?.message || String(error),
    };
  }
}

export function summarizeSavedRunVqaBenchmarkRows(rows: SavedRunVqaBenchmarkRow[]) {
  const modelIds = [...new Set(rows.map((row) => row.modelId))];
  return modelIds.map((modelId) => {
    const modelRows = rows.filter((row) => row.modelId === modelId);
    const completedRows = modelRows.filter((row) => row.status === "completed");
    const latencies = completedRows.map((row) => row.latencyMs).filter(finiteNumber);
    const likelihoods = completedRows
      .map((row) => row.stepCompleteLikelihood)
      .filter(finiteNumber);
    const recommendationCount = (name: string) => completedRows
      .filter((row) => row.recommendedNext === name)
      .length;
    const knownRecommendations = new Set([
      "advance",
      "continue",
      "collect_more_evidence",
      "manual_review",
    ]);
    return {
      modelId,
      total: modelRows.length,
      completed: completedRows.length,
      errors: modelRows.filter((row) => row.status === "error").length,
      avgLatencyMs: average(latencies),
      medianLatencyMs: percentile(latencies, 50),
      p95LatencyMs: percentile(latencies, 95),
      avgLikelihood: average(likelihoods),
      advanceCount: recommendationCount("advance"),
      continueCount: recommendationCount("continue"),
      collectMoreEvidenceCount: recommendationCount("collect_more_evidence"),
      manualReviewCount: recommendationCount("manual_review"),
      otherRecommendationCount: completedRows
        .filter((row) => row.recommendedNext && !knownRecommendations.has(row.recommendedNext))
        .length,
      totalMissingEvidence: completedRows.reduce((sum, row) => sum + (row.missingEvidenceCount || 0), 0),
    } satisfies SavedRunVqaBenchmarkSummary;
  });
}

export async function runSavedRunVqaBenchmark(opts: SavedRunVqaBenchmarkOptions): Promise<SavedRunVqaBenchmarkArtifact> {
  const startedAt = Date.now();
  const runIds = [...new Set(opts.runIds.map((item) => item.trim()).filter(Boolean))];
  const modelIds = [...new Set(opts.modelIds.map((item) => item.trim()).filter(Boolean))];
  if (!runIds.length) throw new Error("At least one saved kitchen run id is required");
  if (!modelIds.length) throw new Error("At least one VQA model id is required");

  const manifestSegments: KitchenStepSegment[] = [];
  for (const runId of runIds) {
    const manifest = await readKitchenSessionManifestFile(runId) as KitchenSessionManifest;
    manifestSegments.push(...selectSegments(manifest, opts));
  }

  const rows: SavedRunVqaBenchmarkRow[] = [];
  const effectiveConcurrencyByModel: Record<string, number> = {};
  for (const modelId of modelIds) {
    const concurrency = opts.concurrent && opts.concurrent > 0
      ? opts.concurrent
      : suggestedVisionMaxConcurrent(modelId);
    effectiveConcurrencyByModel[modelId] = concurrency;
    const modelRows = await mapConcurrent(
      manifestSegments,
      concurrency,
      (segment) => benchmarkSegment(segment, modelId),
    );
    rows.push(...modelRows);
  }

  const result: SavedRunVqaBenchmarkResult = {
    schemaVersion: "labos.kitchen.vqa-benchmark.v1",
    generatedAt: new Date().toISOString(),
    label: opts.label,
    runIds,
    modelIds,
    stepNumbers: opts.stepNumbers,
    maxSegmentsPerRun: opts.maxSegmentsPerRun,
    requestedConcurrent: opts.concurrent,
    effectiveConcurrencyByModel,
    segmentCount: manifestSegments.length,
    rows,
    summaries: summarizeSavedRunVqaBenchmarkRows(rows),
    elapsedMs: Date.now() - startedAt,
    rowsPerMinute: rows.length ? rows.length / ((Date.now() - startedAt) / 60_000) : 0,
  };

  const paths = getKitchenDataPaths();
  const dir = path.join(paths.kitchenDir, "vqa-benchmarks");
  await fs.promises.mkdir(dir, { recursive: true });
  const filename = `vqa-benchmark-${isoStamp()}-${safePart(opts.label)}.json`;
  const outPath = path.join(dir, filename);
  await fs.promises.writeFile(outPath, JSON.stringify(result, null, 2));
  return {
    path: outPath,
    ref: path.relative(paths.dataDir, outPath).replace(/\\/g, "/"),
    result,
  };
}
