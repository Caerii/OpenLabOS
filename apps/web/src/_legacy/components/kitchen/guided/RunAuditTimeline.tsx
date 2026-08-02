import { useEffect, useMemo, useState } from "react";
import type { KitchenSessionManifest } from "../../../api";
import { apiRunTimeline } from "../../../api/readiness";
import { Badge } from "../../ui";
import { formatDateTime } from "../../files/runLibraryFormatting";

export interface AuditTimelineEntry {
  id: string;
  at: number;
  kind: string;
  label: string;
  detail?: string;
  tone: "good" | "warn" | "bad" | "neutral";
}

function toneForAction(action?: string, state?: string): AuditTimelineEntry["tone"] {
  if (action === "advance" || state === "passed") return "good";
  if (action === "possible_deviation" || action === "blocked" || state === "blocked") return "bad";
  if (action === "collect_more_evidence" || state === "recovering" || state === "confirming") return "warn";
  return "neutral";
}

export function buildAuditTimelineFromManifest(manifest: KitchenSessionManifest): AuditTimelineEntry[] {
  const entries: AuditTimelineEntry[] = [];

  for (const segment of manifest.stepSegments || []) {
    const endedAt = typeof segment.endedAt === "number" ? segment.endedAt : Date.parse(segment.createdAt);
    entries.push({
      id: `segment:${segment.id}`,
      at: endedAt,
      kind: "step_segment",
      label: `Step ${segment.stepNumber} saved`,
      detail: `${segment.frameRefs?.length || 0} snapshots · ${segment.chunkRefs?.length || 0} clips`,
      tone: "good",
    });
  }

  for (const attempt of manifest.stepAttempts || []) {
    const endedAt = typeof attempt.endedAt === "number" ? attempt.endedAt : 0;
    if (!endedAt) continue;
    entries.push({
      id: `attempt:${attempt.attemptId}`,
      at: endedAt,
      kind: "step_attempt",
      label: `Step ${attempt.stepNumber} attempt ${attempt.attemptNumber}`,
      detail: attempt.status === "superseded" ? "Superseded by redo" : "Current attempt",
      tone: attempt.status === "superseded" ? "warn" : "good",
    });
  }

  for (const [index, item] of (manifest.adherence || []).entries()) {
    const at = typeof item.ts === "number" ? item.ts : 0;
    entries.push({
      id: `adherence:${index}:${at}`,
      at,
      kind: "adherence",
      label: item.stepNumber ? `Step ${item.stepNumber} · ${item.action || item.state || "check"}` : (item.action || item.state || "step check"),
      detail: [
        item.state,
        Number.isFinite(item.confidence) ? `${Math.round(Number(item.confidence) * 100)}%` : null,
        item.reason,
      ].filter(Boolean).join(" · "),
      tone: toneForAction(item.action, item.state),
    });
  }

  for (const [index, frame] of (manifest.frames || []).entries()) {
    entries.push({
      id: `frame:${index}:${frame.frameRef}`,
      at: 0,
      kind: "frame",
      label: frame.stepNumber ? `Frame captured · step ${frame.stepNumber}` : "Frame captured",
      detail: `${frame.source} · ${frame.frameRef}`,
      tone: "neutral",
    });
  }

  for (const [index, chunk] of (manifest.chunks || []).entries()) {
    entries.push({
      id: `chunk:${index}:${chunk.chunkRef}`,
      at: 0,
      kind: "chunk",
      label: chunk.stepNumber ? `Chunk saved · step ${chunk.stepNumber}` : "Rolling chunk saved",
      detail: [
        chunk.source,
        chunk.frameCount ? `${chunk.frameCount} frames` : null,
        chunk.durationMs ? `${(chunk.durationMs / 1000).toFixed(1)}s` : null,
      ].filter(Boolean).join(" · "),
      tone: "neutral",
    });
  }

  return entries
    .filter((entry) => entry.at > 0 || entry.kind === "frame" || entry.kind === "chunk")
    .sort((a, b) => {
      if (a.at !== b.at) return b.at - a.at;
      return a.label.localeCompare(b.label);
    });
}

function mergeTimelineEntries(
  manifestEntries: AuditTimelineEntry[],
  apiEntries: Array<{ at: string; kind: string; summary: string }>,
): AuditTimelineEntry[] {
  const merged = [...manifestEntries];
  for (const [index, entry] of apiEntries.entries()) {
    const at = Date.parse(entry.at);
    merged.push({
      id: `api:${index}:${entry.kind}:${entry.at}`,
      at: Number.isFinite(at) ? at : 0,
      kind: entry.kind,
      label: entry.kind.replace(/_/g, " "),
      detail: entry.summary,
      tone: entry.kind.includes("fail") || entry.kind.includes("error") ? "bad" : "neutral",
    });
  }
  return merged.sort((a, b) => b.at - a.at);
}

function toneBadge(tone: AuditTimelineEntry["tone"]) {
  if (tone === "good") return "green" as const;
  if (tone === "bad") return "red" as const;
  if (tone === "warn") return "yellow" as const;
  return "gray" as const;
}

export function RunAuditTimeline({
  manifest,
  sessionId,
}: {
  manifest: KitchenSessionManifest;
  sessionId?: string;
}) {
  const [apiTimeline, setApiTimeline] = useState<Array<{ at: string; kind: string; summary: string }>>([]);
  const [apiError, setApiError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    apiRunTimeline(sessionId)
      .then((result) => {
        if (!cancelled) {
          setApiTimeline(result.timeline || []);
          setApiError(null);
        }
      })
      .catch((error: Error) => {
        if (!cancelled) {
          setApiTimeline([]);
          setApiError(error.message);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const entries = useMemo(
    () => mergeTimelineEntries(buildAuditTimelineFromManifest(manifest), apiTimeline),
    [apiTimeline, manifest],
  );

  if (!entries.length) {
    return (
      <p className="text-xs text-muted">
        No session events have been recorded yet.
      </p>
    );
  }

  return (
    <section className="rounded-lg border border-border/15 bg-border/10 p-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-subtle">Session Timeline</div>
      <p className="mt-1 text-[11px] text-muted">
        A time-ordered log of saved steps, step checks, and run events.
      </p>
      {apiError ? <div className="mt-2 text-[11px] text-subtle">Session timeline unavailable: {apiError}</div> : null}
      <ol className="mt-3 space-y-2">
        {entries.slice(0, 40).map((entry) => (
          <li key={entry.id} className="rounded-md border border-border/15 bg-surface-2 p-2.5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-xs font-medium text-fg">{entry.label}</div>
                {entry.detail ? <div className="mt-0.5 text-[11px] text-muted">{entry.detail}</div> : null}
              </div>
              <div className="flex flex-col items-end gap-1">
                <Badge color={toneBadge(entry.tone)}>{entry.kind.replace(/_/g, " ")}</Badge>
                {entry.at > 0 ? (
                  <span className="text-[10px] text-subtle">{formatDateTime(new Date(entry.at).toISOString())}</span>
                ) : null}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
