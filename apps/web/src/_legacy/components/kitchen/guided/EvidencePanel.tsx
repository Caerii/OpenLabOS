import { Btn, Card, CardHeader, CardTitle, Icon } from "../../ui/index";
import type { KitchenRealtimeSupervisorStatus, KitchenRunAdherenceResult } from "../../../api";
import { ICON } from "../icons";

function EvidenceRow({ title, detail, tone = "default" }: {
  title: string;
  detail: string;
  tone?: "default" | "good" | "warn" | "bad";
}) {
  const toneClass =
    tone === "good" ? "border-highlight-border/20 bg-highlight-bg/8"
    : tone === "warn" ? "border-amber-500/20 bg-amber-500/8"
    : tone === "bad" ? "border-red-500/20 bg-red-500/8"
    : "border-border/15 bg-border/10";

  return (
    <div className={`rounded-lg border p-2 ${toneClass}`}>
      <div className="text-xs font-medium text-fg">{title}</div>
      <div className="mt-0.5 text-[11px] text-muted leading-relaxed">{detail}</div>
    </div>
  );
}

export function EvidencePanel({ result, supervisor, savingManifest, savedManifestRef, onAdherenceTick, onSaveManifest }: {
  result: KitchenRunAdherenceResult | null;
  supervisor: KitchenRealtimeSupervisorStatus | null;
  savingManifest: boolean;
  savedManifestRef: string;
  onAdherenceTick: () => void;
  onSaveManifest: () => void;
}) {
  const decision = result?.adherence || supervisor?.lastResult?.adherence || null;
  const evidence = result?.evidence || [];
  const rollingChunk = result?.rollingChunk || null;
  const tone =
    decision?.action === "advance" ? "good"
    : decision?.action === "possible_deviation" || decision?.action === "blocked" ? "bad"
    : decision ? "warn"
    : "default";

  return (
    <Card>
      <CardHeader>
        <CardTitle icon={<Icon d={ICON.grid} size={16} className="text-blue-400" />} sub="Why the run is advancing, waiting, or asking for attention">
          Step checks
        </CardTitle>
        <div className="flex flex-wrap gap-2">
          <Btn size="xs" variant="secondary" onClick={onAdherenceTick}>Check Now</Btn>
          <Btn size="xs" variant="secondary" loading={savingManifest} onClick={onSaveManifest}>Save Run</Btn>
        </div>
      </CardHeader>

      <div className="space-y-2">
        <EvidenceRow
          title="Latest step check"
          detail={decision
            ? `${decision.action.replace(/_/g, " ")} · ${decision.state} · ${Math.round((decision.confidence || 0) * 100)}% confidence. ${decision.spokenSummary}`
            : "No step check yet. Start Auto-Check or select Check Now."}
          tone={tone}
        />
        <EvidenceRow
          title="Live camera buffer"
          detail={`${supervisor?.buffer.frameCount || 0} recent frames${supervisor?.buffer.approxFps ? ` at ${supervisor.buffer.approxFps.toFixed(1)} fps` : ""}. Sampling is ${supervisor?.previewTap.running ? "active" : "idle"}.`}
        />
        {rollingChunk && (
          <EvidenceRow
            title="Recent video clip"
            detail={`${rollingChunk.frameCount} frames over ${(rollingChunk.durationMs / 1000).toFixed(1)}s (${rollingChunk.actualFps.toFixed(1)} fps).`}
            tone="good"
          />
        )}
        {evidence.length > 0 ? (
          evidence.slice(0, 6).map((item) => (
            <EvidenceRow
              key={item.checkId}
              title={`${item.title} (${item.scale})`}
              detail={`${item.modeId} -> ${item.ok ? item.passed === false ? "not passed" : "ok" : "failed"}${item.confidence !== undefined ? `, ${Math.round(item.confidence * 100)}%` : ""}${item.artifactRef ? `, artifact ${item.artifactRef}` : ""}${item.warnings?.length ? `, warnings: ${item.warnings.join(", ")}` : ""}${item.error ? `, error: ${item.error}` : ""}`}
              tone={item.ok && item.passed !== false ? "good" : item.ok ? "warn" : "bad"}
            />
          ))
        ) : (
          <EvidenceRow
            title="Check details"
            detail="Select Check Now to see the observations behind the latest step result."
          />
        )}
        {savedManifestRef && (
          <EvidenceRow
            title="Saved run"
            detail="This run is on disk and ready to open in review or export."
            tone="good"
          />
        )}
      </div>
    </Card>
  );
}

export function MobileEvidenceDetails(props: Parameters<typeof EvidencePanel>[0]) {
  return (
    <details className="lg:hidden rounded-xl border border-border/20 bg-surface-2">
      <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-fg">
        Step checks and session log
      </summary>
      <div className="border-t border-border/15 p-3">
        <EvidencePanel {...props} />
      </div>
    </details>
  );
}
