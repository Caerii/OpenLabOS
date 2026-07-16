import type { KitchenRunAdherenceResult } from "../../../api";

export function AdherenceResult({ result }: { result: KitchenRunAdherenceResult | null }) {
  if (!result) return null;
  const color =
    result.adherence.action === "advance"
      ? "emerald"
      : result.adherence.action === "possible_deviation" || result.adherence.action === "blocked"
        ? "red"
        : result.adherence.action === "confirming"
          ? "yellow"
          : "blue";
  const classes =
    color === "emerald"
      ? "bg-highlight-bg/8 border-highlight-border/15 text-good-fg"
      : color === "red"
        ? "bg-red-500/8 border-red-500/15 text-red-400"
        : color === "yellow"
          ? "bg-amber-500/8 border-amber-500/15 text-warn-fg"
          : "bg-blue-500/8 border-blue-500/15 text-info-fg";

  return (
    <div className={`p-3 rounded-lg border text-xs ${classes}`}>
      <div className="flex flex-wrap items-center gap-2 mb-1">
        <span className="font-medium uppercase tracking-wide">{result.adherence.action.replace(/_/g, " ")}</span>
        <span className="text-[10px] opacity-70">{result.adherence.state}</span>
        <span className="text-[10px] opacity-70">{((result.adherence.confidence || 0) * 100).toFixed(0)}% confidence</span>
      </div>
      <p className="opacity-85 leading-relaxed">{result.adherence.spokenSummary}</p>
      {result.adherence.recommendedNextScale && (
        <p className="mt-1 text-[10px] opacity-70">Next evidence: {result.adherence.recommendedNextScale}</p>
      )}
      {result.rollingChunk && (
        <p className="mt-1 text-[10px] opacity-70">
          Chunk: {result.rollingChunk.frameCount} frames, {(result.rollingChunk.durationMs / 1000).toFixed(1)}s
        </p>
      )}
    </div>
  );
}
