import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  kitchenAnalyzeSavedSessionManifest,
  kitchenRunLibrary,
  kitchenSavedRunReview,
  type KitchenRunReview,
  type LabOSFeatureFlags,
} from "../../api";
import { usePolling } from "../../hooks/usePolling";
import { RunCard } from "./RunCard";
import { RunDetail } from "./RunDetail";
import { RunLibraryLoadingSkeleton } from "./RunLibraryLoading";
import {
  filterAndSortRuns,
  type RunLibrarySort,
  type RunStatusFilter,
} from "./runLibraryModel";

export function RunLibrary({
  connected = false,
  featureFlags,
}: {
  connected?: boolean;
  featureFlags?: LabOSFeatureFlags | null;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<RunLibrarySort>("newest");
  const [status, setStatus] = useState<RunStatusFilter>("all");
  const [selectedRunId, setSelectedRunId] = useState<string>("");
  const [reviewCache, setReviewCache] = useState<Record<string, KitchenRunReview>>({});
  const [analysisBusyRunId, setAnalysisBusyRunId] = useState("");
  const [analysisMessageRunId, setAnalysisMessageRunId] = useState("");
  const [analysisMessage, setAnalysisMessage] = useState<string | null>(null);
  const appliedRequestedRunId = useRef("");
  const { data, loading, error } = usePolling(kitchenRunLibrary, 15000);
  const runs = useMemo(() => data?.runs || [], [data?.runs]);
  const shown = useMemo(() => filterAndSortRuns(runs, query, status, sort), [query, runs, sort, status]);
  const requestedRunId = searchParams.get("runId") || "";

  useEffect(() => {
    if (
      requestedRunId
      && requestedRunId !== appliedRequestedRunId.current
      && runs.some((run) => run.runId === requestedRunId)
      && requestedRunId !== selectedRunId
    ) {
      appliedRequestedRunId.current = requestedRunId;
      setSelectedRunId(requestedRunId);
      return;
    }
    if (!requestedRunId) appliedRequestedRunId.current = "";
    if (!selectedRunId && shown[0]) setSelectedRunId(shown[0].runId);
    if (selectedRunId && !shown.some((run) => run.runId === selectedRunId)) {
      setSelectedRunId(shown[0]?.runId || "");
    }
  }, [requestedRunId, runs, selectedRunId, shown]);

  function selectRun(runId: string) {
    appliedRequestedRunId.current = runId;
    setSelectedRunId(runId);
    if (runId !== analysisMessageRunId) setAnalysisMessage(null);
    const next = new URLSearchParams(searchParams);
    next.set("tab", "runs");
    next.set("runId", runId);
    setSearchParams(next, { replace: true });
  }

  const selected = runs.find((run) => run.runId === selectedRunId) || null;
  const detail = usePolling<KitchenRunReview>(
    () => kitchenSavedRunReview(selectedRunId),
    15000,
    !!selectedRunId,
  );
  useEffect(() => {
    const review = detail.data;
    const runId = review?.run?.runId;
    if (!runId) return;
    setReviewCache((cache) => cache[runId] === review ? cache : { ...cache, [runId]: review });
  }, [detail.data]);
  const selectedReview = detail.data?.run?.runId === selectedRunId
    ? detail.data
    : reviewCache[selectedRunId] || null;
  const selectedManifest = selectedReview?.manifest || null;
  const detailHydrating = !!selectedRunId && !selectedReview && (detail.loading || detail.data?.run?.runId !== selectedRunId);
  const analysisBusy = !!selectedRunId && analysisBusyRunId === selectedRunId;

  async function analyzeSelectedRun() {
    if (!selectedRunId || analysisBusy) return;
    setAnalysisBusyRunId(selectedRunId);
    setAnalysisMessageRunId(selectedRunId);
    setAnalysisMessage("Queued saved step evidence for local VLM analysis. This can take a few minutes on a local model.");
    try {
      const result = await kitchenAnalyzeSavedSessionManifest(selectedRunId);
      setAnalysisMessage(
        result.queuedSegmentCount > 0
          ? `Analyzing ${result.queuedSegmentCount} saved step${result.queuedSegmentCount === 1 ? "" : "s"} with ${result.modelId}.`
          : "This run already has analysis records for the saved step evidence.",
      );
      detail.refresh();
    } catch (error: unknown) {
      setAnalysisMessage(error instanceof Error ? error.message : "Could not queue saved run analysis.");
    } finally {
      setAnalysisBusyRunId("");
    }
  }

  if (loading && !data) return <RunLibraryLoadingSkeleton />;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-fg">Run Library</h2>
          <p className="text-sm text-muted">Saved protocol runs, evidence packages, and redo history.</p>
        </div>
        <div className="text-xs text-subtle">{shown.length} of {runs.length} runs</div>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_9rem_9rem]">
        <input
          className="input py-1.5 text-sm"
          placeholder="Search protocol or run..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <select className="input py-1.5 text-sm" value={status} onChange={(event) => setStatus(event.target.value as RunStatusFilter)}>
          <option value="all">All Status</option>
          <option value="completed">Completed</option>
          <option value="partial">Partial</option>
          <option value="running">Running</option>
        </select>
        <select className="input py-1.5 text-sm" value={sort} onChange={(event) => setSort(event.target.value as RunLibrarySort)}>
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="protocol">Protocol</option>
          <option value="status">Status</option>
          <option value="completion">Completion</option>
        </select>
      </div>

      {error && <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">{error}</div>}

      {!runs.length ? (
        <div className="rounded-xl border border-border/15 bg-border/10 p-8 text-center">
          <div className="text-sm font-medium text-fg">No saved runs yet</div>
          <p className="mt-1 text-sm text-muted">Complete or stop a kitchen run, then save the evidence package.</p>
        </div>
      ) : !shown.length ? (
        <div className="rounded-xl border border-border/15 bg-border/10 p-8 text-center text-sm text-muted">
          No runs match the current filters.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[22rem_minmax(0,1fr)] xl:items-start">
          <div className="order-1 xl:order-2">
            <RunDetail
              selected={selected}
              manifest={selectedManifest}
              reviewStats={selectedReview?.stats || null}
              reviewAttempts={selectedReview?.attempts || null}
              loading={detailHydrating}
              error={detail.error}
              canAnalyzeSavedRuns={featureFlags?.asyncStepAnalysisEnabled === true}
              analysisBusy={analysisBusy}
              analysisMessage={analysisMessageRunId === selectedRunId ? analysisMessage : null}
              onAnalyzeSavedRun={analyzeSelectedRun}
            />
          </div>
          <div className="order-2 xl:order-1">
            <div className="mb-2 flex items-center justify-between gap-2 px-1">
              <div className="text-xs font-semibold uppercase tracking-wide text-subtle">Saved Runs</div>
              <div className="text-[11px] text-subtle">{shown.length} shown</div>
            </div>
            <div className="max-h-[22rem] overflow-y-auto rounded-xl border border-border/15 bg-border/5 p-2 xl:max-h-[calc(100vh-18rem)]">
              <div className="space-y-2">
                {shown.map((run) => (
                  <RunCard
                    key={run.runId}
                    run={run}
                    selected={run.runId === selectedRunId}
                    onSelect={() => selectRun(run.runId)}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
