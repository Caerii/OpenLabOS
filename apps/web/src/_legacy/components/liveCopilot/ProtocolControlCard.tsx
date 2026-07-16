import { useEffect, useMemo, useState } from "react";
import {
  kitchenCompleteStep,
  kitchenProtocols,
  kitchenRunAdherenceTick,
  kitchenRunStart,
  kitchenRunStatus,
  kitchenSkipStep,
  kitchenVerifyStep,
  liveCoachSetSpeakerPolicy,
  liveCoachSwitchProtocol,
  type KitchenProtocolSummary,
  type KitchenStepStatus,
  type LiveCoachHealth,
  type LiveCoachSpeakerPolicy,
} from "../../api";
import { Badge, Btn, Card, CardHeader, CardTitle } from "../ui";

type RunStatus = Awaited<ReturnType<typeof kitchenRunStatus>>;

function stepLabel(step: KitchenStepStatus | null | undefined) {
  if (!step) return "No active step";
  return `Step ${step.number}: ${step.instruction}`;
}

function metric(value: number | null | undefined, suffix = "") {
  return typeof value === "number" && Number.isFinite(value) ? `${Math.round(value)}${suffix}` : "unknown";
}

export default function ProtocolControlCard({ health }: { health?: LiveCoachHealth | null }) {
  const [protocols, setProtocols] = useState<KitchenProtocolSummary[]>([]);
  const [selectedProtocol, setSelectedProtocol] = useState("kitchen-tea-v1");
  const [runStatus, setRunStatus] = useState<RunStatus | null>(null);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [speakerMode, setSpeakerMode] = useState<LiveCoachSpeakerPolicy["mode"]>("glasses-mic-primary");

  const activeProtocolId = health?.activeProtocol?.id || runStatus?.protocol?.id || selectedProtocol;
  const selected = useMemo(
    () => protocols.find((protocol) => protocol.id === selectedProtocol) || protocols[0] || null,
    [protocols, selectedProtocol],
  );

  async function refresh() {
    const [protocolData, status] = await Promise.all([
      kitchenProtocols(),
      kitchenRunStatus().catch(() => null),
    ]);
    setProtocols(protocolData.protocols);
    setRunStatus(status);
    const preferred = status?.protocol?.id || health?.activeProtocol?.id || selectedProtocol || protocolData.protocols[0]?.id || "";
    if (preferred) setSelectedProtocol(preferred);
  }

  async function run(label: string, action: () => Promise<unknown>) {
    setBusy(label);
    setMessage("");
    try {
      const result = await action();
      setMessage(typeof result === "string" ? result : "Command completed.");
      await refresh();
    } catch (error: any) {
      setMessage(error?.message || String(error));
    } finally {
      setBusy("");
    }
  }

  useEffect(() => {
    refresh().catch(() => {});
    const id = window.setInterval(() => refresh().catch(() => {}), 5000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [health?.activeProtocol?.id]);

  useEffect(() => {
    if (health?.speakerPolicy?.mode) setSpeakerMode(health.speakerPolicy.mode);
  }, [health?.speakerPolicy?.mode]);

  return (
    <Card>
      <CardHeader>
        <CardTitle sub="Switch protocols, update deterministic state, and inspect the evidence context the voice agent receives">
          Protocol Control
        </CardTitle>
      </CardHeader>

      <div className="grid gap-3 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-lg border border-border/15 bg-border/10 p-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <select
              className="min-w-0 flex-1 rounded-lg border border-border/25 bg-surface-2 px-3 py-2 text-sm text-fg"
              value={selectedProtocol}
              onChange={(event) => setSelectedProtocol(event.target.value)}
            >
              {protocols.map((protocol) => (
                <option key={protocol.id} value={protocol.id}>
                  {protocol.name}
                </option>
              ))}
            </select>
            <Btn
              size="sm"
              variant="primary"
              loading={busy === "switch"}
              disabled={!selectedProtocol}
              onClick={() => run("switch", () => liveCoachSwitchProtocol(selectedProtocol, true))}
            >
              Switch Voice Agent
            </Btn>
            <Btn
              size="sm"
              variant="secondary"
              loading={busy === "start"}
              disabled={!selectedProtocol}
              onClick={() => run("start", () => kitchenRunStart(selectedProtocol))}
            >
              Start Run
            </Btn>
          </div>

          {selected && (
            <div className="mt-3 text-xs text-muted">
              <div className="flex flex-wrap items-center gap-2">
                <Badge color={activeProtocolId === selected.id ? "green" : "gray"}>
                  {activeProtocolId === selected.id ? "active in voice" : "not active"}
                </Badge>
                <Badge color="blue">{selected.stepCount} steps</Badge>
                <Badge color="gray">{selected.estimatedMinutes} min</Badge>
                <span className="font-mono text-[11px]">{selected.id}</span>
              </div>
              <p className="mt-2">{selected.description}</p>
            </div>
          )}

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <Btn size="sm" loading={busy === "verify"} onClick={() => run("verify", () => kitchenVerifyStep())}>
              Capture + Verify Step
            </Btn>
            <Btn
              size="sm"
              loading={busy === "adherence"}
              onClick={() => run("adherence", () => kitchenRunAdherenceTick({
                scales: ["frame", "short_chunk"],
                useRollingChunk: true,
                maxChecks: 4,
              }))}
            >
              Multiscale Evidence Tick
            </Btn>
            <Btn size="sm" variant="ghost" loading={busy === "complete"} onClick={() => run("complete", () => kitchenCompleteStep())}>
              Force Complete Step
            </Btn>
            <Btn size="sm" variant="ghost" loading={busy === "skip"} onClick={() => run("skip", () => kitchenSkipStep())}>
              Skip Step
            </Btn>
          </div>
        </div>

        <div className="rounded-lg border border-border/15 bg-border/10 p-3 text-xs text-muted">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium text-fg">Run and evidence state</span>
            <Badge color={runStatus?.active ? "green" : "gray"}>{runStatus?.active ? "active" : "idle"}</Badge>
          </div>
          <div className="mt-2 space-y-1">
            <div>{stepLabel(runStatus?.currentStep)}</div>
            <div>Protocol: <span className="font-mono text-fg">{runStatus?.protocol?.id || health?.activeProtocol?.id || "none"}</span></div>
            <div>Video: {health?.liveVideo?.width && health.liveVideo.height ? `${health.liveVideo.width}x${health.liveVideo.height}` : "unknown"} at {(health?.liveVideo?.averageFps || 0).toFixed(2)} fps</div>
            <div>Latency: {metric(health?.runtimeContext?.transport.approximateResponseLatencyMs, " ms")}</div>
            <div>Elapsed: {(health?.runtimeContext?.elapsedSec || 0).toFixed(1)}s</div>
          </div>

          <div className="mt-3 border-t border-border/15 pt-3">
            <div className="mb-2 font-medium text-fg">Primary speaker filter</div>
            <select
              className="w-full rounded-lg border border-border/25 bg-surface-2 px-3 py-2 text-sm text-fg"
              value={speakerMode}
              onChange={(event) => {
                const mode = event.target.value as LiveCoachSpeakerPolicy["mode"];
                setSpeakerMode(mode);
                run("speaker", () => liveCoachSetSpeakerPolicy({ mode }));
              }}
            >
              <option value="glasses-mic-primary">Glasses wearer is primary</option>
              <option value="push-to-talk">Push-to-talk / explicit operator turns</option>
            </select>
            <p className="mt-2 text-[11px]">
              Simple segmentation now: use the wearer mic, PTT/wake intent, and ignore background voices unless safety-critical.
              External diarization can plug into this same policy later.
            </p>
          </div>
        </div>
      </div>

      {message && (
        <div className="mt-3 rounded-lg border border-border/15 bg-bg/40 p-2 text-[11px] text-muted">
          {message}
        </div>
      )}
    </Card>
  );
}
