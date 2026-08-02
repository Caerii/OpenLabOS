import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, type Judgment, type SessionView } from "../lib/api";
import { defaultProtocol, protocolCatalogue } from "../lib/protocols";
import { DevicePreview } from "../components/DevicePreview";

export function RunPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [view, setView] = useState<SessionView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [lastJudgment, setLastJudgment] = useState<Judgment | null>(null);

  const refresh = useCallback(async () => {
    if (!sessionId) return;
    try {
      setView(await api.view(sessionId));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [sessionId]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 2000);
    return () => clearInterval(id);
  }, [refresh]);

  // Pick the protocol that matches the running session, falling back to
  // the dashboard default if we can't find one in the bundled catalogue.
  const protocol = useMemo(() => {
    if (!view) return defaultProtocol;
    return (
      protocolCatalogue.find(
        (p) =>
          p.protocol_id === view.session.protocol_id &&
          p.protocol_version === view.session.protocol_version,
      ) ?? defaultProtocol
    );
  }, [view]);
  const stepIndex = useMemo(() => {
    if (!view) return 0;
    if (view.lastCompletedStepId) {
      const lastIdx = protocol.steps.findIndex(
        (s) => s.step_id === view.lastCompletedStepId,
      );
      return Math.min(lastIdx + 1, protocol.steps.length - 1);
    }
    return 0;
  }, [view, protocol]);

  const activeStep = protocol.steps[stepIndex];

  async function emit(kind: "start" | "complete") {
    if (!sessionId || !activeStep) return;
    setBusy(kind);
    try {
      const at = new Date().toISOString();
      if (kind === "start") {
        await api.appendEvent(sessionId, {
          kind: "step_started",
          at,
          step_id: activeStep.step_id,
        });
      } else {
        await api.appendEvent(sessionId, {
          kind: "step_completed",
          at,
          step_id: activeStep.step_id,
          succeeded: true,
        });
      }
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function judge() {
    if (!sessionId || !activeStep) return;
    setBusy("judge");
    try {
      const judgment = await api.judge({
        session_id: sessionId,
        step: {
          step_id: activeStep.step_id,
          title: activeStep.title,
          instruction: activeStep.instruction,
          expected_objects: activeStep.expected_objects.map((o) => ({
            object_id: o.object_id,
            label: o.label,
          })),
          success_criteria: activeStep.success_criteria.map((c) => ({
            kind: c.kind,
            description: c.description,
          })),
        },
      });
      setLastJudgment(judgment);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function finalize() {
    if (!sessionId) return;
    setBusy("finalize");
    try {
      await api.finalize(sessionId, "completed");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  if (!sessionId) {
    return <div className="p-8 text-ink-low">The URL does not include a session ID.</div>;
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-12">
      <button
        onClick={() => navigate("/dashboard")}
        className="text-xs font-mono text-ink-low hover:text-accent-300 transition"
      >
        ← Back to dashboard
      </button>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="mt-4"
      >
        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">
          {protocol.name}
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-ink-mid">
          Record when each step begins and ends. “Check step” sends the current
          step and camera evidence to the configured judgment provider.
        </p>
        <div className="mt-1 text-xs font-mono text-ink-low break-all">
          session {sessionId}
        </div>
      </motion.div>

      {error && (
        <div className="mt-6 rounded-md border border-bad-400/40 bg-bad-400/10 px-4 py-3 text-sm text-bad-400 font-mono">
          {error}
        </div>
      )}

      <div className="mt-8">
        <DevicePreview className="w-full" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ProgressRail
            steps={protocol.steps.map((s) => ({
              id: s.step_id,
              title: s.title,
            }))}
            activeStepId={view?.activeStepId ?? null}
            lastCompletedStepId={view?.lastCompletedStepId ?? null}
          />

          <AnimatePresence mode="wait">
            {activeStep && (
              <motion.section
                key={activeStep.step_id}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                className="mt-8 rounded-xl border border-white/5 bg-surface-1/60 p-6"
              >
                <div className="flex items-baseline justify-between">
                  <h2 className="text-2xl font-semibold">
                    {stepIndex + 1}. {activeStep.title}
                  </h2>
                  <span className="font-mono text-xs text-ink-low">
                    {activeStep.step_id}
                  </span>
                </div>
                <p className="mt-3 text-ink-mid leading-relaxed">
                  {activeStep.instruction}
                </p>

                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  <Box title="Expected objects">
                    <ul className="text-sm text-ink-mid space-y-1">
                      {activeStep.expected_objects.map((o) => (
                        <li key={o.object_id} className="flex justify-between">
                          <span className="font-mono text-xs text-accent-300">
                            {o.object_id}
                          </span>
                          <span>{o.label}</span>
                        </li>
                      ))}
                    </ul>
                  </Box>
                  <Box title="Success criteria">
                    <ul className="text-sm text-ink-mid space-y-1">
                      {activeStep.success_criteria.map((c, i) => (
                        <li key={i}>
                          <span className="font-mono text-xs text-accent-300 mr-2">
                            {c.kind}
                          </span>
                          {c.description}
                        </li>
                      ))}
                    </ul>
                  </Box>
                </div>

                {activeStep.safety_notes.length > 0 && (
                  <div className="mt-4 rounded-md border border-warn-400/30 bg-warn-400/10 p-3">
                    <div className="text-xs uppercase tracking-widest font-mono text-warn-400 mb-1">
                      Safety
                    </div>
                    <ul className="text-sm text-warn-400/90 list-disc pl-5">
                      {activeStep.safety_notes.map((n, i) => (
                        <li key={i}>{n}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="mt-6 flex flex-wrap gap-3">
                  <PrimaryButton
                    onClick={() => emit("start")}
                    busy={busy === "start"}
                    disabled={view?.session.status !== "active"}
                  >
                    Mark as started
                  </PrimaryButton>
                  <PrimaryButton
                    onClick={judge}
                    busy={busy === "judge"}
                    variant="ghost"
                    disabled={view?.session.status !== "active"}
                  >
                    Check step
                  </PrimaryButton>
                  <PrimaryButton
                    onClick={() => emit("complete")}
                    busy={busy === "complete"}
                    variant="ghost"
                    disabled={view?.session.status !== "active"}
                  >
                    Mark complete
                  </PrimaryButton>
                  <button
                    onClick={finalize}
                    disabled={busy === "finalize" || view?.session.status !== "active"}
                    className="ml-auto px-4 py-2 rounded-md text-xs font-mono uppercase tracking-widest text-ink-low hover:text-bad-400 transition disabled:opacity-50"
                  >
                    End session
                  </button>
                </div>
              </motion.section>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {lastJudgment && (
              <motion.section
                key={lastJudgment.judgment_id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                className="mt-6 rounded-xl border border-accent-400/30 bg-accent-400/5 p-6"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <h3 className="text-lg font-semibold text-accent-300">
                    Step check · {lastJudgment.verdict}
                  </h3>
                  <span className="font-mono text-xs text-ink-low">
                    {lastJudgment.source}
                  </span>
                </div>
                <p className="mt-3 text-ink-mid leading-relaxed">
                  {lastJudgment.rationale}
                </p>
                {lastJudgment.criteria.length > 0 && (
                  <ul className="mt-4 grid gap-2">
                    {lastJudgment.criteria.map((c) => (
                      <li
                        key={c.criterion_index}
                        className={[
                          "rounded-md p-2 text-sm border",
                          c.satisfied
                            ? "border-accent-400/40 bg-accent-400/10 text-accent-300"
                            : "border-bad-400/40 bg-bad-400/10 text-bad-400",
                        ].join(" ")}
                      >
                        <span className="font-mono text-xs mr-2">
                          [{c.criterion_index}]
                        </span>
                        {c.evidence}
                      </li>
                    ))}
                  </ul>
                )}
              </motion.section>
            )}
          </AnimatePresence>
        </div>

        <div className="space-y-4">
          <SidePanel title="State">
            <Row label="status" value={view?.session.status ?? "—"} />
            <Row
              label="active step"
              value={view?.activeStepId ?? "—"}
              mono
            />
            <Row
              label="last complete"
              value={view?.lastCompletedStepId ?? "—"}
              mono
            />
            <Row
              label="frames"
              value={String(view?.counts.framesCaptured ?? 0)}
            />
            <Row
              label="judgments"
              value={String(view?.counts.judgmentsEmitted ?? 0)}
            />
            <Row
              label="completed steps"
              value={String(view?.counts.stepsCompleted ?? 0)}
            />
          </SidePanel>

          <SidePanel title="Adapter">
            <Row label="id" value={view?.session.device_adapter_id ?? "—"} mono />
            <Row
              label="started"
              value={
                view ? new Date(view.session.started_at).toLocaleTimeString() : "—"
              }
            />
            <Row
              label="ended"
              value={
                view?.session.ended_at
                  ? new Date(view.session.ended_at).toLocaleTimeString()
                  : "—"
              }
            />
          </SidePanel>
        </div>
      </div>
    </div>
  );
}

function ProgressRail({
  steps,
  activeStepId,
  lastCompletedStepId,
}: {
  steps: { id: string; title: string }[];
  activeStepId: string | null;
  lastCompletedStepId: string | null;
}) {
  const activeIdx = activeStepId
    ? steps.findIndex((s) => s.id === activeStepId)
    : lastCompletedStepId
    ? steps.findIndex((s) => s.id === lastCompletedStepId) + 1
    : 0;
  const lastIdx = lastCompletedStepId
    ? steps.findIndex((s) => s.id === lastCompletedStepId)
    : -1;
  const completedFraction = (lastIdx + 1) / steps.length;

  return (
    <div className="rounded-xl border border-white/5 bg-surface-1/60 p-5">
      <div className="flex items-baseline justify-between mb-4">
        <h3 className="text-sm uppercase tracking-[0.18em] text-ink-low font-mono">
          Progress
        </h3>
        <span className="text-xs font-mono text-ink-low">
          {Math.round(completedFraction * 100)}%
        </span>
      </div>
      <div className="relative h-1 rounded-full bg-surface-3 overflow-hidden">
        <motion.div
          initial={false}
          animate={{ width: `${completedFraction * 100}%` }}
          transition={{ type: "spring", stiffness: 220, damping: 28 }}
          className="absolute inset-y-0 left-0 bg-accent-400 shadow-glow"
        />
      </div>
      <ol className="mt-5 grid grid-cols-2 sm:grid-cols-5 gap-2">
        {steps.map((s, i) => {
          const state = i < activeIdx ? "done" : i === activeIdx ? "active" : "todo";
          return (
            <li key={s.id}>
              <motion.div
                initial={{ opacity: 0.5, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04, duration: 0.4 }}
                className={[
                  "rounded-md p-2 border text-xs",
                  state === "done"
                    ? "border-accent-400/40 bg-accent-400/10 text-accent-300"
                    : state === "active"
                    ? "border-warn-400/40 bg-warn-400/10 text-warn-400"
                    : "border-white/5 bg-surface-2/60 text-ink-low",
                ].join(" ")}
              >
                <div className="font-mono text-[10px] uppercase tracking-widest opacity-70">
                  step {i + 1}
                </div>
                <div className="mt-1 font-medium leading-tight">{s.title}</div>
              </motion.div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Box({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-white/5 bg-surface-2/60 p-4">
      <div className="text-xs uppercase tracking-[0.18em] font-mono text-ink-low mb-2">
        {title}
      </div>
      {children}
    </div>
  );
}

function SidePanel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-white/5 bg-surface-1/60 p-5">
      <h3 className="text-sm uppercase tracking-[0.18em] text-ink-low font-mono mb-4">
        {title}
      </h3>
      <div className="grid gap-2">{children}</div>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-white/5 pb-2 last:border-0 last:pb-0">
      <span className="text-xs uppercase tracking-[0.16em] text-ink-low font-mono">
        {label}
      </span>
      <span
        className={[
          "text-sm break-all text-right",
          mono ? "font-mono" : "",
          value === "—" ? "text-ink-low" : "text-ink-high",
        ].join(" ")}
      >
        {value}
      </span>
    </div>
  );
}

function PrimaryButton({
  children,
  onClick,
  busy,
  disabled,
  variant = "solid",
}: {
  children: React.ReactNode;
  onClick: () => void;
  busy?: boolean;
  disabled?: boolean;
  variant?: "solid" | "ghost";
}) {
  return (
    <motion.button
      whileHover={!disabled && !busy ? { scale: 1.02 } : {}}
      whileTap={!disabled && !busy ? { scale: 0.98 } : {}}
      onClick={onClick}
      disabled={disabled || busy}
      className={[
        "px-4 py-2 rounded-md text-sm font-medium transition",
        variant === "solid"
          ? "bg-accent-400 text-surface-0 hover:bg-accent-300 shadow-glow"
          : "border border-white/10 text-ink-high hover:border-accent-400/40 hover:text-accent-300",
        disabled || busy ? "opacity-50 cursor-not-allowed" : "",
      ].join(" ")}
    >
      {busy ? "…" : children}
    </motion.button>
  );
}
