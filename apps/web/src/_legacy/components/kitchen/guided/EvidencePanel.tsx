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
        <CardTitle icon={<Icon d={ICON.grid} size={16} className="text-blue-400" />} sub="Explain why the system is advancing, waiting, or warning">
          Evidence Timeline
        </CardTitle>
        <div className="flex flex-wrap gap-2">
          <Btn size="xs" variant="secondary" onClick={onAdherenceTick}>Check Now</Btn>
          <Btn size="xs" variant="secondary" loading={savingManifest} onClick={onSaveManifest}>Save Manifest</Btn>
        </div>
      </CardHeader>

      <div className="space-y-2">
        <EvidenceRow
          title="Current decision"
          detail={decision
            ? `${decision.action.replace(/_/g, " ")} / ${decision.state} / ${Math.round((decision.confidence || 0) * 100)}% confidence. ${decision.spokenSummary}`
            : "No adherence decision yet. Start realtime supervision or run a manual check."}
          tone={tone}
        />
        <EvidenceRow
          title="Frame buffer"
          detail={`${supervisor?.buffer.frameCount || 0} frames buffered${supervisor?.buffer.approxFps ? ` at ${supervisor.buffer.approxFps.toFixed(1)} fps` : ""}. Preview tap is ${supervisor?.previewTap.running ? "running" : "idle"}.`}
        />
        {rollingChunk && (
          <EvidenceRow
            title="Rolling video chunk"
            detail={`${rollingChunk.frameCount} frames, ${(rollingChunk.durationMs / 1000).toFixed(1)}s, ${rollingChunk.actualFps.toFixed(1)} fps. Ref: ${rollingChunk.chunkRef}`}
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
            title="Per-check evidence"
            detail="Manual checks show full per-check evidence here. Supervisor status intentionally keeps a compact last decision for polling."
          />
        )}
        {savedManifestRef && (
          <EvidenceRow
            title="Saved review package"
            detail={`Manifest saved to dashboard/data/${savedManifestRef}. This is the artifact to inspect after the run and move into training data.`}
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
        Evidence and manifest
      </summary>
      <div className="border-t border-border/15 p-3">
        <EvidencePanel {...props} />
      </div>
    </details>
  );
}
