import type {
  KitchenRunEvidenceAttempt,
  KitchenRunEvidenceStats,
  KitchenSessionManifest,
} from "../../api";
import { Badge } from "../ui";
import { EvidenceLoadingSkeleton } from "./RunLibraryLoading";
import {
  ReadinessPanel,
  StatTile,
  StepAttemptList,
} from "./RunEvidence";
import {
  evidenceStatsForManifest,
  evidenceStatsForSummary,
  manifestJsonUrl,
  runCompletionLabel,
  runNaturalLabel,
  runStatusLabel,
  type NumberedRunSummary,
} from "./runLibraryModel";
import { formatDateTime, statusColor } from "./runLibraryFormatting";

export function RunDetail({
  selected,
  manifest,
  reviewStats,
  reviewAttempts,
  loading,
  error,
  canAnalyzeSavedRuns,
  analysisBusy,
  analysisMessage,
  onAnalyzeSavedRun,
}: {
  selected: NumberedRunSummary | null;
  manifest: KitchenSessionManifest | null;
  reviewStats?: KitchenRunEvidenceStats | null;
  reviewAttempts?: KitchenRunEvidenceAttempt[] | null;
  loading: boolean;
  error?: string | null;
  canAnalyzeSavedRuns: boolean;
  analysisBusy: boolean;
  analysisMessage?: string | null;
  onAnalyzeSavedRun: () => void;
}) {
  if (!selected) {
    return (
      <div className="rounded-xl border border-border/15 bg-border/10 p-6 text-center text-sm text-muted">
        Select a saved run to review its evidence package.
      </div>
    );
  }
  const staticStats = evidenceStatsForSummary(selected);
  const stats = reviewStats || (manifest ? evidenceStatsForManifest(manifest) : staticStats);
  const statsLoading = loading && !manifest && !stats;
  const jsonUrl = manifestJsonUrl(selected.runId);
  const analyzableSegments = stats?.stepSegmentCount || 0;
  const coveredSegments = new Set(
    (manifest?.stepAnalyses || [])
      .filter((analysis) => analysis.status !== "error")
      .map((analysis) => analysis.segmentId),
  );
  const missingAnalyses = (manifest?.stepSegments || [])
    .filter((segment) => segment.frameRefs?.length)
    .filter((segment) => !coveredSegments.has(segment.id))
    .length;
  const showAnalyzeButton = canAnalyzeSavedRuns && !!manifest && analyzableSegments > 0 && missingAnalyses > 0;
  return (
    <div className="rounded-xl border border-border/15 bg-surface-2 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-subtle">Run Review</div>
          <h3 className="mt-1 text-lg font-semibold text-fg">
            {runNaturalLabel(selected.runNumber)} - {selected.protocolName || selected.protocolId || "Protocol run"}
          </h3>
          <p className="mt-1 text-xs text-muted">
            Saved {formatDateTime(selected.savedAt)} - {runCompletionLabel(selected)}
          </p>
          <details className="mt-1">
            <summary className="cursor-pointer text-xs text-subtle">Technical run id</summary>
            <div className="mt-1 break-all font-mono text-[11px] text-subtle">{selected.runId}</div>
          </details>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge color={statusColor(selected.status)}>{runStatusLabel(selected.status)}</Badge>
          {showAnalyzeButton && (
            <button
              type="button"
              className="rounded-lg border border-blue-500/25 bg-blue-500/10 px-2.5 py-1 text-xs font-medium text-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={onAnalyzeSavedRun}
              disabled={analysisBusy}
            >
              {analysisBusy ? "Analyzing..." : "Analyze Evidence"}
            </button>
          )}
          {jsonUrl && (
            <a className="rounded-lg border border-border/20 bg-border/10 px-2.5 py-1 text-xs font-medium text-muted hover:text-fg" href={jsonUrl} download={`${selected.runId}.json`}>
              Export JSON
            </a>
          )}
        </div>
      </div>

      <>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
          <StatTile value={stats?.stepSegmentCount} label="step segments" loading={statsLoading} />
          <StatTile value={stats?.nativeVideoCount} label="videos" loading={statsLoading} />
          <StatTile value={stats?.frameCount} label="snapshots" loading={statsLoading} />
          <StatTile value={stats?.stepAnalysisCount} label="analyses" loading={statsLoading} />
          <StatTile value={stats?.redoneAttemptCount} label="redone" loading={statsLoading} />
        </div>

        {loading && !manifest && (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-blue-500/20 bg-blue-500/10 p-3 text-sm text-blue-500">
            <span className="h-2 w-2 animate-pulse rounded-full bg-blue-400" />
            <span>Loading evidence details for this run. Static run counts are shown above.</span>
          </div>
        )}
        {analysisMessage && (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-blue-500/20 bg-blue-500/10 p-3 text-sm text-blue-500">
            {analysisBusy && <span className="h-2 w-2 animate-pulse rounded-full bg-blue-400" />}
            <span>{analysisMessage}</span>
          </div>
        )}
        {error && !manifest && (
          <div className="mt-3 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
            Could not load the evidence package: {error}
          </div>
        )}

        {stats && stats.deviationCount > 0 && (
          <div className="mt-3 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
            {stats.deviationCount} possible deviation{stats.deviationCount === 1 ? "" : "s"} recorded.
          </div>
        )}

        {manifest && <ReadinessPanel manifest={manifest} />}

        {manifest ? (
          <div className="mt-4">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-subtle">Step Evidence</div>
            <StepAttemptList manifest={manifest} attempts={reviewAttempts} />
          </div>
        ) : loading ? (
          <EvidenceLoadingSkeleton />
        ) : (
          <div className="mt-4 rounded-lg border border-border/15 bg-border/10 p-3 text-sm text-muted">
            Step evidence will appear here when the saved package finishes loading.
          </div>
        )}
      </>
    </div>
  );
}
