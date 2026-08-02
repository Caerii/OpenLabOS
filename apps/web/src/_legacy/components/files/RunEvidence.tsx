import { useEffect, useState } from "react";
import type {
  KitchenRunEvidenceAnalysis,
  KitchenRunEvidenceAttempt,
  KitchenRunEvidenceVqaAnnotation,
  KitchenRunEvidenceVideo,
  KitchenSessionManifest,
} from "../../api";
import { getApiUrl } from "../../api/core";
import { Badge } from "../ui";
import {
  attemptEvidenceForManifest,
  attemptEvidenceSummary,
  type RunVqaReviewSummary,
  type RunVqaStepReview,
} from "./runLibraryModel";
import {
  formatDateTime,
  formatDuration,
  formatSize,
  readinessColor,
} from "./runLibraryFormatting";
import { SkeletonBlock } from "./RunLibraryLoading";

function routedAssetUrl(url?: string | null) {
  if (!url) return "";
  return url.startsWith("/api/") ? getApiUrl(url) : url;
}

function VideoFacts({
  attempt,
  video,
}: {
  attempt: KitchenRunEvidenceAttempt;
  video: KitchenRunEvidenceVideo;
}) {
  return (
    <details className="mt-2 rounded-md border border-border/15 bg-border/10">
      <summary className="cursor-pointer px-2 py-1.5 text-[11px] font-medium text-muted">Evidence facts</summary>
      <dl className="space-y-1 border-t border-border/15 p-2 text-[11px]">
        <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-2">
          <dt className="text-subtle">File</dt>
          <dd className="break-all font-mono text-fg">{video.path}</dd>
        </div>
        <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-2">
          <dt className="text-subtle">Server copy</dt>
          <dd className="text-fg">
            {video.cacheStatus === "cached"
              ? `cached${video.cacheSize ? ` (${formatSize(video.cacheSize)})` : ""}`
              : video.cacheStatus === "pending"
                ? "caching on server"
                : video.cacheStatus === "error"
                  ? `cache error: ${video.cacheError || "unknown"}`
                  : "not cached yet"}
          </dd>
        </div>
        <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-2">
          <dt className="text-subtle">Cached</dt>
          <dd className="text-fg">{video.cachedAt ? formatDateTime(video.cachedAt) : "waiting for server cache"}</dd>
        </div>
        <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-2">
          <dt className="text-subtle">Duration</dt>
          <dd className="text-fg">{formatDuration(video.durationMs) || "not measured yet"}</dd>
        </div>
        <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-2">
          <dt className="text-subtle">Attempt</dt>
          <dd className="break-all font-mono text-fg">{attempt.attemptId}</dd>
        </div>
        <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-2">
          <dt className="text-subtle">Segment</dt>
          <dd className="break-all font-mono text-fg">{video.segmentId || "session log only"}</dd>
        </div>
        <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-2">
          <dt className="text-subtle">Source</dt>
          <dd className="text-fg">{video.source || "native recording"}</dd>
        </div>
        <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-2">
          <dt className="text-subtle">Snapshots</dt>
          <dd className="break-all text-fg">{attempt.snapshotRefs.length ? attempt.snapshotRefs.join(", ") : "none"}</dd>
        </div>
        <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-2">
          <dt className="text-subtle">Preview clips</dt>
          <dd className="break-all text-fg">{attempt.chunkRefs.length ? attempt.chunkRefs.join(", ") : "none"}</dd>
        </div>
      </dl>
    </details>
  );
}

function StepAnalysisPanel({
  analysis,
}: {
  analysis: KitchenRunEvidenceAnalysis;
}) {
  const completed = analysis.status === "completed";
  const passed = analysis.performedCorrectly === true;
  return (
    <div className="mt-3 rounded-lg border border-border/15 bg-surface-2 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-subtle">Step Review</div>
        <div className="flex flex-wrap gap-1.5">
          <Badge color={analysis.status === "error" ? "red" : completed ? passed ? "green" : "yellow" : "blue"}>
            {completed ? (passed ? "passed" : "review") : analysis.status}
          </Badge>
          {Number.isFinite(Number(analysis.confidence)) && (
            <Badge color="gray">{Math.round(Number(analysis.confidence) * 100)}% confidence</Badge>
          )}
        </div>
      </div>
      <div className="mt-2 text-xs text-muted">
        {analysis.status === "queued" && "Queued for a local step review."}
        {analysis.status === "running" && "The local step review is running."}
        {analysis.status === "error" && `Analysis failed: ${analysis.error || "unknown error"}`}
        {completed && (analysis.summary || (passed ? "The saved evidence matches this step." : "The saved evidence needs review."))}
      </div>
      {analysis.deviation && <div className="mt-2 text-xs text-amber-500">Deviation: {analysis.deviation}</div>}
      {(analysis.visibleEvidence.length > 0 || analysis.missingEvidence.length > 0) && (
        <details className="mt-2 rounded-md border border-border/15 bg-border/10">
          <summary className="cursor-pointer px-2 py-1.5 text-[11px] font-medium text-muted">Analysis facts</summary>
          <div className="space-y-2 border-t border-border/15 p-2 text-[11px] text-muted">
            {analysis.visibleEvidence.length > 0 && (
              <div>
                <div className="font-medium text-fg">Visible evidence</div>
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  {analysis.visibleEvidence.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
            )}
            {analysis.missingEvidence.length > 0 && (
              <div>
                <div className="font-medium text-fg">Missing or ambiguous</div>
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  {analysis.missingEvidence.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
            )}
            <div className="break-all font-mono text-subtle">{analysis.modelId}</div>
          </div>
        </details>
      )}
    </div>
  );
}

function VqaAnnotationPanel({
  annotation,
}: {
  annotation: KitchenRunEvidenceVqaAnnotation;
}) {
  const completed = annotation.status === "completed";
  const likelihood = Number(annotation.stepCompleteLikelihood);
  const answered = annotation.answerCount;
  const total = annotation.questionCount || annotation.answerCount;
  return (
    <div className="mt-3 rounded-lg border border-border/15 bg-surface-2 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-subtle">Auto-Check Result</div>
        <div className="flex flex-wrap gap-1.5">
          <Badge color={annotation.status === "error" ? "red" : completed ? "green" : "blue"}>
            {annotation.status}
          </Badge>
          {Number.isFinite(likelihood) && (
            <Badge color="gray">{Math.round(likelihood * 100)}% complete</Badge>
          )}
          {annotation.recommendedNext && <Badge color="gray">{annotation.recommendedNext.replace(/_/g, " ")}</Badge>}
        </div>
      </div>
      <div className="mt-2 text-xs text-muted">
        {annotation.status === "queued" && "Queued for a local auto-check."}
        {annotation.status === "running" && "The local auto-check is running."}
        {annotation.status === "error" && `Auto-check failed: ${annotation.error || "unknown error"}`}
        {completed && (annotation.frameSummary || `${answered}/${total} visual questions answered.`)}
      </div>
      {annotation.answers && annotation.answers.length > 0 && (
        <details className="mt-2 rounded-md border border-border/15 bg-border/10">
          <summary className="cursor-pointer px-2 py-1.5 text-[11px] font-medium text-muted">
            Visual answers ({answered}/{total})
          </summary>
          <div className="divide-y divide-border/15 border-t border-border/15">
            {annotation.answers.map((answer) => (
              <div key={answer.questionId} className="p-2 text-[11px]">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1 text-fg">{answer.question}</div>
                  <Badge color={answer.answer === "yes" ? "green" : answer.answer === "no" ? "red" : "yellow"}>
                    {answer.answer} {Math.round(Number(answer.confidence || 0) * 100)}%
                  </Badge>
                </div>
                {answer.evidence.length > 0 && (
                  <div className="mt-1 text-subtle">{answer.evidence.join("; ")}</div>
                )}
                {answer.blockingIssue && (
                  <div className="mt-1 text-red-400">Blocking: {answer.blockingIssue}</div>
                )}
              </div>
            ))}
          </div>
        </details>
      )}
      {(annotation.missingEvidence.length > 0 || annotation.blockingIssues.length > 0) && (
        <details className="mt-2 rounded-md border border-border/15 bg-border/10">
          <summary className="cursor-pointer px-2 py-1.5 text-[11px] font-medium text-muted">Check details</summary>
          <div className="space-y-2 border-t border-border/15 p-2 text-[11px] text-muted">
            {annotation.missingEvidence.length > 0 && (
              <div>
                <div className="font-medium text-fg">Missing evidence</div>
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  {annotation.missingEvidence.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
            )}
            {annotation.blockingIssues.length > 0 && (
              <div>
                <div className="font-medium text-fg">Blocking issues</div>
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  {annotation.blockingIssues.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
            )}
            <div className="break-all font-mono text-subtle">{annotation.modelId}</div>
          </div>
        </details>
      )}
    </div>
  );
}

function percent(value: number | undefined) {
  if (!Number.isFinite(Number(value))) return "0%";
  return `${Math.round(Number(value) * 100)}%`;
}

function vqaStepReady(step: RunVqaStepReview) {
  return (
    step.status === "completed" &&
    (step.recommendedNext === "advance" || step.recommendedNext === "continue") &&
    Number(step.stepCompleteLikelihood || 0) >= 0.7 &&
    step.missingEvidence.length === 0 &&
    step.blockingIssues.length === 0
  );
}

function vqaStatusColor(step: RunVqaStepReview): "green" | "yellow" | "red" | "blue" | "gray" {
  if (step.status === "error") return "red";
  if (step.status === "queued" || step.status === "running") return "blue";
  if (vqaStepReady(step)) return "green";
  return "yellow";
}

function VqaStepReviewRow({ step }: { step: RunVqaStepReview }) {
  const total = step.questionCount || step.answerCount;
  return (
    <details className="rounded-lg border border-border/15 bg-surface-2">
      <summary className="cursor-pointer p-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-sm font-semibold text-fg">
                Step {step.stepNumber}{step.attemptNumber && step.attemptNumber > 1 ? `, attempt ${step.attemptNumber}` : ""}
              </div>
              <Badge color={vqaStatusColor(step)}>
                {vqaStepReady(step) ? "ready to export" : step.status === "completed" ? "review" : step.status}
              </Badge>
              {step.recommendedNext && <Badge color="gray">{step.recommendedNext.replace(/_/g, " ")}</Badge>}
            </div>
            {step.instruction && <div className="mt-1 text-xs text-muted">{step.instruction}</div>}
            {step.frameSummary && <div className="mt-1 line-clamp-2 text-xs text-subtle">{step.frameSummary}</div>}
          </div>
          <div className="grid grid-cols-3 gap-1 text-center text-[11px] sm:min-w-[12rem]">
            <div className="rounded-md bg-border/10 px-2 py-1">
              <div className="font-semibold text-fg">{percent(step.stepCompleteLikelihood)}</div>
              <div className="text-subtle">complete</div>
            </div>
            <div className="rounded-md bg-border/10 px-2 py-1">
              <div className="font-semibold text-fg">{step.answerCount}/{total}</div>
              <div className="text-subtle">answers</div>
            </div>
            <div className="rounded-md bg-border/10 px-2 py-1">
              <div className="font-semibold text-fg">{step.missingEvidence.length + step.blockingIssues.length}</div>
              <div className="text-subtle">issues</div>
            </div>
          </div>
        </div>
      </summary>
      <div className="border-t border-border/15 p-3">
        {step.error && <div className="mb-2 rounded-md border border-red-500/20 bg-red-500/10 p-2 text-xs text-red-400">{step.error}</div>}
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-[minmax(0,1fr)_16rem]">
          <div className="space-y-2">
            {step.answers.length > 0 ? step.answers.map((answer) => (
              <div key={answer.questionId} className="rounded-md border border-border/15 bg-border/10 p-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1 text-xs text-fg">{answer.question}</div>
                  <Badge color={answer.answer === "yes" ? "green" : answer.answer === "no" ? "red" : "yellow"}>
                    {answer.answer} {Math.round(Number(answer.confidence || 0) * 100)}%
                  </Badge>
                </div>
                {answer.evidence.length > 0 && <div className="mt-1 text-[11px] text-muted">{answer.evidence.join("; ")}</div>}
                {answer.blockingIssue && <div className="mt-1 text-[11px] text-red-400">Blocking: {answer.blockingIssue}</div>}
              </div>
            )) : (
              <div className="rounded-md border border-border/15 bg-border/10 p-2 text-xs text-muted">
                No question-by-question check details were saved for this step.
              </div>
            )}
          </div>
          <div className="space-y-2 text-[11px]">
            <div className="rounded-md border border-border/15 bg-border/10 p-2">
              <div className="font-medium text-fg">Answer balance</div>
              <div className="mt-1 flex flex-wrap gap-1.5">
                <Badge color="green">{step.yesCount} yes</Badge>
                <Badge color="red">{step.noCount} no</Badge>
                <Badge color="yellow">{step.uncertainCount} uncertain</Badge>
              </div>
            </div>
            {(step.missingEvidence.length > 0 || step.blockingIssues.length > 0) && (
              <div className="rounded-md border border-amber-500/20 bg-amber-500/10 p-2">
                <div className="font-medium text-amber-400">Review reasons</div>
                <ul className="mt-1 list-disc space-y-0.5 pl-4 text-warn-fg/90">
                  {[...step.missingEvidence, ...step.blockingIssues].map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
            )}
            <div className="break-all rounded-md border border-border/15 bg-border/10 p-2 font-mono text-subtle">
              {step.modelId}
              {step.latencyMs ? <div className="mt-1 font-sans">{formatDuration(step.latencyMs)}</div> : null}
            </div>
          </div>
        </div>
      </div>
    </details>
  );
}

export function VqaRunReviewPanel({
  summary,
  canAnnotate,
  busy,
  onAnnotate,
}: {
  summary: RunVqaReviewSummary | null;
  canAnnotate: boolean;
  busy: boolean;
  onAnnotate: () => void;
}) {
  if (!summary) return null;
  const coveragePct = Math.max(0, Math.min(100, Math.round(summary.coverageRatio * 100)));
  const reviewSteps = summary.steps.filter((step) => !vqaStepReady(step));
  const hasLabels = summary.steps.length > 0;
  return (
    <section className="mt-4 rounded-lg border border-border/15 bg-border/10 p-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-subtle">Auto-Check Review</div>
          <div className="mt-1 text-sm font-medium text-fg">
            {hasLabels
              ? `${summary.readyCount} step${summary.readyCount === 1 ? "" : "s"} ready, ${summary.reviewCount + summary.errorCount} need review`
              : "No automatic step checks have been generated for this run yet."}
          </div>
          <p className="mt-1 max-w-3xl text-xs text-muted">
            Automatic checks review each saved step against a short set of visual questions. Review any missing details before exporting the run.
          </p>
        </div>
        {canAnnotate && (
          <button
            type="button"
            className="rounded-lg border border-highlight-border/25 bg-highlight-bg/10 px-3 py-1.5 text-xs font-medium text-accentText disabled:cursor-not-allowed disabled:opacity-50"
            onClick={onAnnotate}
            disabled={busy}
          >
            {busy ? "Checking..." : hasLabels ? "Check Missing Steps" : "Run Auto-Check"}
          </button>
        )}
      </div>

      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between text-[11px] text-subtle">
          <span>Coverage</span>
          <span>{summary.labeledSegmentCount}/{summary.segmentCount} segments</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-border/20">
          <div className="h-full bg-accent" style={{ width: `${coveragePct}%` }} />
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
        <StatTile value={summary.readyCount} label="ready to export" loading={false} />
        <StatTile value={summary.reviewCount + summary.errorCount} label="needs review" loading={false} />
        <StatTile value={summary.missingEvidenceCount} label="missing facts" loading={false} />
        <div className="rounded-lg border border-border/15 bg-border/10 p-3">
          <div className="text-lg font-semibold text-fg">{summary.averageLikelihood === undefined ? "0%" : percent(summary.averageLikelihood)}</div>
          <div className="text-xs text-muted">avg complete</div>
        </div>
      </div>

      {reviewSteps.length > 0 && (
        <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-amber-400">Attention Queue</div>
          <div className="mt-2 grid grid-cols-1 gap-2 lg:grid-cols-2">
            {reviewSteps.slice(0, 4).map((step) => (
              <div key={step.id} className="rounded-md border border-amber-500/20 bg-surface-2 p-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-medium text-fg">Step {step.stepNumber}</div>
                  <Badge color={vqaStatusColor(step)}>{step.status === "completed" ? step.recommendedNext?.replace(/_/g, " ") || "review" : step.status}</Badge>
                </div>
                <div className="mt-1 line-clamp-2 text-[11px] text-muted">
                  {step.missingEvidence[0] || step.blockingIssues[0] || step.frameSummary || "Needs reviewer attention."}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {summary.steps.length > 0 && (
        <div className="mt-3 space-y-2">
          {summary.steps.map((step) => <VqaStepReviewRow key={step.id} step={step} />)}
        </div>
      )}
    </section>
  );
}

function StepVideoCard({
  attempt,
  video,
  index,
}: {
  attempt: KitchenRunEvidenceAttempt;
  video: KitchenRunEvidenceVideo;
  index: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [thumbnailFailed, setThumbnailFailed] = useState(false);
  const [thumbnailLoaded, setThumbnailLoaded] = useState(false);
  const thumbnailUrl = routedAssetUrl(video.thumbnailUrl);
  const viewUrl = routedAssetUrl(video.viewUrl);
  const downloadUrl = routedAssetUrl(video.downloadUrl);
  const deviceViewUrl = routedAssetUrl(video.deviceViewUrl);
  const cached = video.cacheStatus === "cached";
  useEffect(() => {
    setThumbnailFailed(false);
    setThumbnailLoaded(false);
  }, [thumbnailUrl]);
  return (
    <div className="overflow-hidden rounded-lg border border-border/15 bg-surface-2">
      <div className="relative aspect-video w-full bg-surface-1">
        {expanded ? (
          <video
            src={viewUrl}
            poster={thumbnailUrl || undefined}
            className="h-full w-full bg-black object-contain"
            controls
            preload={cached ? "metadata" : "none"}
          />
        ) : thumbnailUrl && !thumbnailFailed ? (
          <button
            type="button"
            className="relative block h-full w-full text-left"
            onClick={() => setExpanded(true)}
            aria-expanded={expanded}
          >
            {!thumbnailLoaded && (
              <div className="absolute inset-0 flex items-center justify-center bg-border/10 text-xs text-muted">
                <span className="mr-2 h-2 w-2 animate-pulse rounded-full bg-blue-400" />
                Loading snapshot
              </div>
            )}
            <img
              src={thumbnailUrl}
              alt=""
              className={`h-full w-full object-cover transition-opacity ${thumbnailLoaded ? "opacity-100" : "opacity-0"}`}
              loading="lazy"
              onLoad={() => setThumbnailLoaded(true)}
              onError={() => setThumbnailFailed(true)}
            />
            <div className="absolute inset-0 flex items-center justify-center bg-black/10">
              <span className="rounded-full bg-black/75 px-3 py-1 text-xs font-semibold text-white">
                Play inline
              </span>
            </div>
          </button>
        ) : (
          <button
            type="button"
            className="flex h-full w-full items-center justify-center px-3 text-center text-xs text-muted"
            onClick={() => setExpanded(true)}
            aria-expanded={expanded}
          >
            Saved snapshot not available. Click to load the video inline.
          </button>
        )}
      </div>
      <div className="p-2">
        <div className="truncate text-xs font-medium text-fg">Step video {index + 1}</div>
        <div className="mt-0.5 truncate text-[11px] text-subtle">{video.name}</div>
        <div className="mt-0.5 text-[11px] text-subtle">
          {video.cacheStatus === "cached"
            ? `Server cached${video.cacheSize ? ` - ${formatSize(video.cacheSize)}` : ""}`
            : video.cacheStatus === "pending"
              ? "Caching original video on server"
              : "Original stays on glasses until opened or cached"}
        </div>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            className="rounded-md border border-highlight-border/25 bg-highlight-bg/10 px-2 py-1 text-[11px] font-medium text-accentText"
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? "Hide Player" : "Play"}
          </button>
          <a className="rounded-md border border-border/20 bg-border/10 px-2 py-1 text-[11px] font-medium text-muted" href={downloadUrl} download={video.name}>
            Export
          </a>
          <a className="rounded-md border border-border/20 bg-border/10 px-2 py-1 text-[11px] font-medium text-muted" href={deviceViewUrl} target="_blank" rel="noreferrer">
            Device
          </a>
        </div>
        <VideoFacts attempt={attempt} video={video} />
      </div>
    </div>
  );
}

export function StatTile({
  value,
  label,
  loading,
}: {
  value?: number;
  label: string;
  loading: boolean;
}) {
  return (
    <div className="rounded-lg border border-border/15 bg-border/10 p-3">
      <div className="text-lg font-semibold text-fg">
        {value === undefined && loading ? <SkeletonBlock className="h-6 w-16" /> : Number(value || 0)}
      </div>
      <div className="text-xs text-muted">{label}</div>
    </div>
  );
}

function normalizeEvidenceAttempt(attempt: KitchenRunEvidenceAttempt): KitchenRunEvidenceAttempt {
  return {
    ...attempt,
    segmentIds: attempt.segmentIds ?? [],
    snapshotRefs: attempt.snapshotRefs ?? [],
    chunkRefs: attempt.chunkRefs ?? [],
    videos: attempt.videos ?? [],
    analyses: attempt.analyses ?? [],
    vqaAnnotations: attempt.vqaAnnotations ?? [],
  };
}

export function StepAttemptList({
  manifest,
  attempts: providedAttempts,
}: {
  manifest: KitchenSessionManifest;
  attempts?: KitchenRunEvidenceAttempt[] | null;
}) {
  const attempts: KitchenRunEvidenceAttempt[] = (
    providedAttempts || attemptEvidenceForManifest(manifest)
  ).map(normalizeEvidenceAttempt);
  if (!attempts.length) {
    return <p className="text-xs text-muted">No saved step attempts are recorded in this session log.</p>;
  }
  return (
    <div className="space-y-3">
      {attempts.map((attempt, index) => (
        <div key={attempt.attemptId || `step-${attempt.stepNumber}-${attempt.attemptNumber}-${index}`} className="rounded-lg border border-border/15 bg-border/10 p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-xs font-semibold text-fg">
                Step {attempt.stepNumber}
                {attempt.attemptNumber > 1 ? ` - attempt ${attempt.attemptNumber}` : ""}
              </div>
              {attempt.instruction && <div className="mt-0.5 text-xs text-muted">{attempt.instruction}</div>}
              <div className="mt-1 text-[11px] text-subtle">
                {attemptEvidenceSummary(attempt)}
                {formatDuration(attempt.durationMs) ? ` - ${formatDuration(attempt.durationMs)}` : ""}
              </div>
            </div>
            <Badge color={attempt.status === "superseded" ? "yellow" : "green"}>
              {attempt.status === "superseded" ? "redone" : "current"}
            </Badge>
          </div>
          {attempt.videos.length > 0 ? (
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {attempt.videos.map((video, index) => (
                <StepVideoCard
                  key={video.path}
                  attempt={attempt}
                  video={video}
                  index={index}
                />
              ))}
            </div>
          ) : (
            <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/10 p-2 text-xs text-amber-400">
              No native step video is linked to this attempt yet. The snapshot is still saved for review.
            </div>
          )}
          {attempt.analyses.map((analysis) => (
            <StepAnalysisPanel key={analysis.id} analysis={analysis} />
          ))}
          {attempt.vqaAnnotations.map((annotation) => (
            <VqaAnnotationPanel key={annotation.id} annotation={annotation} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function ReadinessPanel({ manifest }: { manifest: KitchenSessionManifest }) {
  const readiness = manifest.readiness;
  if (!readiness) return null;
  const failedChecks = readiness.checks.filter((check) => check.status !== "pass");
  return (
    <div className="mt-3 rounded-lg border border-border/15 bg-border/10 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-subtle">Saved Run Readiness</div>
          <div className="mt-1 text-sm font-medium text-fg">{readiness.summary}</div>
        </div>
        <Badge color={readinessColor(readiness.grade)}>{readiness.label}</Badge>
      </div>
      {failedChecks.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-subtle">Readiness facts</summary>
          <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
            {readiness.checks.map((check) => (
              <div key={check.id} className="rounded-md border border-border/15 bg-surface-2 p-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-medium text-fg">{check.label}</div>
                  <Badge color={check.status === "pass" ? "green" : check.status === "warn" ? "yellow" : "red"}>
                    {check.status}
                  </Badge>
                </div>
                <div className="mt-1 text-[11px] text-muted">{check.detail}</div>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
