import { useEffect, useState } from "react";
import { Badge, Card, CardTitle, LoadingState, PanelHeader, SectionLabel } from "./ui/index";
import { kitchenFeatures, request } from "../api";
import { deriveLabOSExperience } from "../lib/labosExperience";

type PreviewMetrics = Record<string, unknown>;
type LabReport = {
  runId: string;
  label: string;
  path: string;
  ticks?: number;
  durationSec?: number;
  pipeline?: {
    glassToGlassMs?: { p50?: number | null; p95?: number | null };
    streamFrameAgeMs?: { p50?: number | null; p95?: number | null };
    fps?: { avg?: number | null };
  };
  powerMw?: { instantaneous?: { p50?: number | null; p95?: number | null } };
};

function MetricTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="labos-surface p-3">
      <div className="labos-eyebrow mb-1">{label}</div>
      <div className="font-mono text-lg font-semibold tabular-nums text-fg">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </div>
  );
}

export default function LabPanel({ connected }: { connected: boolean }) {
  const [metrics, setMetrics] = useState<PreviewMetrics | null>(null);
  const [health, setHealth] = useState<Record<string, unknown> | null>(null);
  const [reports, setReports] = useState<LabReport[]>([]);
  const [featureConfig, setFeatureConfig] = useState<Awaited<ReturnType<typeof kitchenFeatures>> | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const [m, h, f, r] = await Promise.all([
          request<PreviewMetrics>("/api/preview/metrics"),
          request<Record<string, unknown>>("/api/preview/health?lite=1"),
          kitchenFeatures(),
          request<{ ok: boolean; reports: LabReport[] }>("/api/preview/lab/reports").catch(() => ({ ok: false, reports: [] })),
        ]);
        if (cancelled) return;
        setMetrics(m);
        setHealth(h);
        setFeatureConfig(f);
        setReports(r.reports || []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    const timer = window.setInterval(() => {
      request<PreviewMetrics>("/api/preview/metrics").then(setMetrics).catch(() => undefined);
    }, 4000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const experience = deriveLabOSExperience(featureConfig?.effectiveFlags ?? null, featureConfig?.experience ?? null);
  const glassToGlass = metrics?.glassToGlassMs as number | undefined;
  const streamAge = metrics?.streamFrameAgeMs as number | undefined;
  const fps = (metrics?.fps as number | undefined) ?? (health?.fps as number | undefined);

  if (loading && !metrics) return <LoadingState className="py-16" />;

  return (
    <div className="space-y-5 animate-fade-in">
      <PanelHeader
        title="Preview lab"
        subtitle="Live pipeline metrics, feature profile, and energy sweep reports."
        right={<Badge color={connected ? "green" : "gray"}>{connected ? "device connected" : "disconnected"}</Badge>}
      />

      {error && (
        <div className="labos-alert labos-alert--error text-sm">{error}</div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricTile label="Glass-to-glass" value={glassToGlass != null ? `${Math.round(glassToGlass)} ms` : "—"} />
        <MetricTile label="Stream age" value={streamAge != null ? `${Math.round(streamAge)} ms` : "—"} />
        <MetricTile label="FPS" value={fps != null ? Number(fps).toFixed(1) : "—"} />
        <MetricTile
          label="Profile"
          value={experience.profile}
          sub={experience.enabledExperiments.length ? experience.enabledExperiments.join(", ") : "no experiments"}
        />
      </div>

      <Card padding="md">
        <CardTitle sub="From GET /api/preview/metrics">Pipeline snapshot</CardTitle>
        <pre className="mt-3 max-h-72 overflow-auto rounded-[var(--labos-radius-md)] border border-border/10 bg-border/5 p-3 font-mono text-[11px] text-muted">
          {JSON.stringify(metrics, null, 2)}
        </pre>
      </Card>

      <Card padding="md">
        <CardTitle sub="Configured vs effective capability flags">Feature config</CardTitle>
        <pre className="mt-3 max-h-48 overflow-auto rounded-[var(--labos-radius-md)] border border-border/10 bg-border/5 p-3 font-mono text-[11px] text-muted">
          {JSON.stringify(
            {
              profile: featureConfig?.experience?.profile,
              configuredProfile: featureConfig?.experience?.configuredProfile,
              surfaces: featureConfig?.experience?.surfaces,
              flags: featureConfig?.flags,
              effectiveFlags: featureConfig?.effectiveFlags,
            },
            null,
            2,
          )}
        </pre>
      </Card>

      <div>
        <SectionLabel>Energy sweep reports</SectionLabel>
        {reports.length === 0 ? (
          <p className="labos-body">No reports in artifacts/preview-energy yet. Run preview-energy-sweep from the API package.</p>
        ) : (
          <div className="space-y-2">
            {reports.map((report) => (
              <div key={`${report.runId}-${report.label}`} className="labos-surface flex flex-wrap items-center justify-between gap-3 p-3">
                <div>
                  <div className="text-sm font-medium text-fg">{report.label}</div>
                  <div className="text-xs text-muted">{report.runId} · {report.path}</div>
                </div>
                <div className="flex flex-wrap gap-2 text-xs font-mono text-muted">
                  {report.pipeline?.glassToGlassMs?.p50 != null && (
                    <span>g2g p50 {Math.round(report.pipeline.glassToGlassMs.p50)}ms</span>
                  )}
                  {report.pipeline?.fps?.avg != null && <span>{report.pipeline.fps.avg} fps</span>}
                  {report.powerMw?.instantaneous?.p50 != null && (
                    <span>{Math.round(report.powerMw.instantaneous.p50)} mW</span>
                  )}
                  {report.durationSec != null && <span>{report.durationSec}s</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
