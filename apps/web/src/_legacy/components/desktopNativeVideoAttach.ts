import type {
  DesktopNativeVideoFile,
  KitchenSavedManifestSummary,
  KitchenSessionManifest,
} from "../api";

export type NativeVideoAttachConfidence = "high" | "medium" | "low";

export interface NativeVideoAttachSuggestion {
  runId: string;
  runLabel: string;
  stepNumber?: number;
  attemptId?: string;
  confidence: NativeVideoAttachConfidence;
  distanceMs: number;
  reason: string;
}

const FIVE_MINUTES_MS = 5 * 60 * 1000;
const THIRTY_MINUTES_MS = 30 * 60 * 1000;
const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;
const WINDOW_PAD_MS = 60 * 1000;

function fileTimestampMs(file: Pick<DesktopNativeVideoFile, "modified_unix_seconds">) {
  const value = Number(file.modified_unix_seconds);
  return Number.isFinite(value) && value > 0 ? value * 1000 : null;
}

function distanceFromWindow(ts: number, start?: number, end?: number) {
  const hasStart = Number.isFinite(Number(start));
  const hasEnd = Number.isFinite(Number(end));
  if (hasStart && hasEnd) {
    const low = Math.min(Number(start), Number(end)) - WINDOW_PAD_MS;
    const high = Math.max(Number(start), Number(end)) + WINDOW_PAD_MS;
    if (ts >= low && ts <= high) return 0;
    return Math.min(Math.abs(ts - low), Math.abs(ts - high));
  }
  if (hasStart) return Math.abs(ts - Number(start));
  if (hasEnd) return Math.abs(ts - Number(end));
  return Number.POSITIVE_INFINITY;
}

function confidenceForDistance(distanceMs: number): NativeVideoAttachConfidence | null {
  if (distanceMs <= FIVE_MINUTES_MS) return "high";
  if (distanceMs <= THIRTY_MINUTES_MS) return "medium";
  if (distanceMs <= FOUR_HOURS_MS) return "low";
  return null;
}

function summaryForRun(
  summaries: KitchenSavedManifestSummary[],
  runId: string,
) {
  return summaries.find((summary) => summary.runId === runId);
}

function runLabelFor(
  manifest: KitchenSessionManifest,
  summaries: KitchenSavedManifestSummary[],
) {
  const summary = summaryForRun(summaries, manifest.run.id);
  return summary?.protocolName || manifest.run.protocolName || manifest.run.protocolId || manifest.run.id;
}

export function suggestNativeVideoAttachment(
  file: Pick<DesktopNativeVideoFile, "device_path" | "modified_unix_seconds">,
  manifests: KitchenSessionManifest[],
  summaries: KitchenSavedManifestSummary[] = [],
): NativeVideoAttachSuggestion | null {
  const ts = fileTimestampMs(file);
  if (!ts) return null;

  const candidates: Array<NativeVideoAttachSuggestion & { score: number }> = [];

  function consider(candidate: Omit<NativeVideoAttachSuggestion, "confidence"> & { scorePenalty?: number }) {
    const confidence = confidenceForDistance(candidate.distanceMs);
    if (!confidence) return;
    const score = candidate.distanceMs + (candidate.scorePenalty || 0);
    candidates.push({ ...candidate, confidence, score });
  }

  for (const manifest of manifests) {
    const runId = manifest.run?.id;
    if (!runId) continue;
    const runLabel = runLabelFor(manifest, summaries);

    for (const attempt of manifest.stepAttempts || []) {
      const distanceMs = distanceFromWindow(ts, attempt.startedAt, attempt.endedAt);
      consider({
        runId,
        runLabel,
        stepNumber: attempt.stepNumber,
        attemptId: attempt.attemptId,
        distanceMs,
        reason: `closest to step ${attempt.stepNumber} attempt ${attempt.attemptNumber}`,
        scorePenalty: attempt.status === "superseded" ? FIVE_MINUTES_MS : 0,
      });
    }

    for (const segment of manifest.stepSegments || []) {
      const distanceMs = distanceFromWindow(ts, segment.startedAt, segment.endedAt);
      consider({
        runId,
        runLabel,
        stepNumber: segment.stepNumber,
        attemptId: segment.attemptId,
        distanceMs,
        reason: `closest to step ${segment.stepNumber} segment`,
        scorePenalty: 2 * 60 * 1000,
      });
    }

    const runDistance = distanceFromWindow(ts, manifest.run.startedAt, manifest.run.endedAt);
    consider({
      runId,
      runLabel,
      distanceMs: runDistance,
      reason: "closest to run window",
      scorePenalty: 10 * 60 * 1000,
    });

    const summary = summaryForRun(summaries, runId);
    const savedAt = summary?.savedAt ? Date.parse(summary.savedAt) : Number.NaN;
    if (Number.isFinite(savedAt)) {
      consider({
        runId,
        runLabel,
        distanceMs: Math.abs(ts - savedAt),
        reason: "closest to manifest saved time",
        scorePenalty: 20 * 60 * 1000,
      });
    }
  }

  const best = candidates.sort((a, b) => a.score - b.score)[0];
  if (!best) return null;
  return {
    runId: best.runId,
    runLabel: best.runLabel,
    stepNumber: best.stepNumber,
    attemptId: best.attemptId,
    confidence: best.confidence,
    distanceMs: best.distanceMs,
    reason: best.reason,
  };
}
