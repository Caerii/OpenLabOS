import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  api,
  type AdapterRecord,
  type ApiHealth,
  type ModuleRecord,
  type Session,
} from "../lib/api";
import { defaultProtocol } from "../lib/protocols";
import { DevicePreview } from "../components/DevicePreview";
import { DeviceControlPanel } from "../components/DeviceControlPanel";

export function Dashboard() {
  const navigate = useNavigate();
  const [health, setHealth] = useState<ApiHealth | null>(null);
  const [adapters, setAdapters] = useState<AdapterRecord[]>([]);
  const [modules, setModules] = useState<ModuleRecord[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const [h, a, m, s] = await Promise.all([
          api.health(),
          api.adapters(),
          api.modules(),
          api.listSessions(),
        ]);
        if (!cancelled) {
          setHealth(h);
          setAdapters(a.adapters);
          setModules(m.modules);
          setSessions(s.sessions);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    };
    tick();
    const id = setInterval(tick, 4000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  async function startDefaultProtocol() {
    if (adapters.length === 0) return;
    setStarting(true);
    try {
      const adapter = adapters[0]!;
      const session = await api.startSession({
        protocol_id: defaultProtocol.protocol_id,
        protocol_version: defaultProtocol.protocol_version,
        device_adapter_id: adapter.id,
        operator_id: "web-operator",
        tags: ["web-ui"],
      });
      navigate(`/run/${session.session_id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-12">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">
          Dashboard
        </h1>
        <p className="mt-2 text-ink-mid">
          Live coordination plane. Sessions, devices, and the modules that
          extend the closed world.
        </p>
      </motion.div>

      {error && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-6 rounded-md border border-bad-400/40 bg-bad-400/10 px-4 py-3 text-sm text-bad-400 font-mono"
        >
          {error}
        </motion.div>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <Card title="API health" delay={0.05}>
          <Stat label="status" value={health ? "online" : "—"} accent={!!health} />
          <Stat
            label="uptime"
            value={
              health
                ? `${Math.floor(health.uptime_seconds)} s`
                : "—"
            }
          />
          <Stat label="adapters" value={String(health?.adapters ?? 0)} />
          <Stat label="modules" value={String(health?.modules ?? 0)} />
        </Card>

        <Card title="Connected devices" delay={0.1}>
          <AnimatePresence mode="popLayout">
            {adapters.length === 0 ? (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-sm text-ink-low"
              >
                No adapters registered. Boot the API with{" "}
                <span className="font-mono text-accent-300">
                  OPENLABOS_DEVICE_BASE_URL
                </span>{" "}
                set.
              </motion.div>
            ) : (
              adapters.map((a, i) => (
                <motion.div
                  key={a.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="rounded-md border border-white/5 bg-surface-2/60 p-3"
                >
                  <div className="flex items-center gap-2">
                    <span className="block w-1.5 h-1.5 rounded-full bg-accent-400 animate-pulseGlow" />
                    <span className="font-mono text-sm text-ink-high break-all">
                      {a.id}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {a.capabilities.map((c) => (
                      <span
                        key={c}
                        className="text-[11px] px-1.5 py-0.5 rounded font-mono border border-white/5 text-ink-mid bg-surface-3/40"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                </motion.div>
              ))
            )}
          </AnimatePresence>
        </Card>

        <Card title="Modules loaded" delay={0.15}>
          {modules.length === 0 ? (
            <div className="text-sm text-ink-low">
              No domain modules registered. Add a module package and register
              its manifest at boot.
            </div>
          ) : (
            modules.map((m) => (
              <div
                key={m.id}
                className="rounded-md border border-white/5 bg-surface-2/60 p-3"
              >
                <div className="font-mono text-sm text-ink-high">
                  {m.id}{" "}
                  <span className="text-ink-low">@ {m.version}</span>
                </div>
                <div className="mt-1 text-xs text-ink-mid">{m.description}</div>
              </div>
            ))
          )}
        </Card>
      </div>

      {adapters.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.18, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="mt-10 grid lg:grid-cols-3 gap-6"
        >
          <div className="lg:col-span-2">
            <DevicePreview />
          </div>
          <div className="rounded-xl border border-white/5 bg-surface-1/60 p-5 grid gap-3">
            <h3 className="text-sm uppercase tracking-[0.18em] text-ink-low font-mono">
              Live device
            </h3>
            <div className="text-xs text-ink-mid leading-relaxed">
              Streaming from{" "}
              <span className="font-mono text-accent-300 break-all">
                {adapters[0]?.id}
              </span>
              . Camera lifecycle is broadcast on this panel's mount/unmount;
              the on-device server proxies through{" "}
              <span className="font-mono">/api/device</span> with token
              auth handled server-side.
            </div>
          </div>
        </motion.div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="mt-10 rounded-xl border border-white/5 bg-surface-1/60 p-6"
      >
        <div className="flex flex-wrap items-center gap-4 justify-between">
          <div>
            <h2 className="text-xl font-semibold">Run a protocol</h2>
            <p className="mt-1 text-sm text-ink-mid">
              Drive {defaultProtocol.name.toLowerCase()} against the connected adapter.
            </p>
          </div>
          <motion.button
            whileHover={adapters.length ? { scale: 1.02 } : {}}
            whileTap={adapters.length ? { scale: 0.98 } : {}}
            disabled={adapters.length === 0 || starting}
            onClick={startDefaultProtocol}
            className={[
              "px-5 py-2.5 rounded-md font-medium transition",
              adapters.length === 0 || starting
                ? "bg-surface-3 text-ink-low cursor-not-allowed"
                : "bg-accent-400 text-surface-0 hover:bg-accent-300 shadow-glow",
            ].join(" ")}
          >
            {starting ? "Starting…" : `Start ${defaultProtocol.protocol_id}`}
          </motion.button>
        </div>
      </motion.div>

      {adapters.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.22, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="mt-10"
        >
          <DeviceControlPanel />
        </motion.div>
      )}

      <Card title="Recent sessions" delay={0.25} className="mt-10">
        {sessions.length === 0 ? (
          <div className="text-sm text-ink-low">No sessions yet.</div>
        ) : (
          <div className="grid gap-2">
            <AnimatePresence>
              {sessions
                .slice()
                .sort((a, b) => b.started_at.localeCompare(a.started_at))
                .map((s, i) => (
                  <motion.button
                    key={s.session_id}
                    layout
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ delay: Math.min(i * 0.03, 0.3) }}
                    onClick={() => navigate(`/run/${s.session_id}`)}
                    className="text-left rounded-md border border-white/5 bg-surface-2/60 hover:border-accent-400/40 hover:bg-surface-2 transition p-3 group"
                  >
                    <div className="flex flex-wrap gap-3 items-baseline">
                      <span className="font-mono text-sm text-ink-high">
                        {s.protocol_id}
                      </span>
                      <span className="text-xs font-mono text-ink-low">
                        v{s.protocol_version}
                      </span>
                      <StatusPill status={s.status} />
                      <span className="ml-auto text-xs font-mono text-ink-low">
                        {new Date(s.started_at).toLocaleString()}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-ink-low font-mono break-all">
                      {s.session_id}
                    </div>
                  </motion.button>
                ))}
            </AnimatePresence>
          </div>
        )}
      </Card>
    </div>
  );
}

function Card({
  title,
  delay = 0,
  className,
  children,
}: {
  title: string;
  delay?: number;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className={[
        "rounded-xl border border-white/5 bg-surface-1/60 p-5",
        className ?? "",
      ].join(" ")}
    >
      <h3 className="text-sm uppercase tracking-[0.18em] text-ink-low font-mono mb-4">
        {title}
      </h3>
      <div className="grid gap-3">{children}</div>
    </motion.section>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between border-b border-white/5 pb-2 last:border-b-0 last:pb-0">
      <span className="text-xs uppercase tracking-[0.18em] text-ink-low font-mono">
        {label}
      </span>
      <span
        className={[
          "font-mono text-sm",
          accent ? "text-accent-300" : "text-ink-high",
        ].join(" ")}
      >
        {value}
      </span>
    </div>
  );
}

function StatusPill({ status }: { status: Session["status"] }) {
  const cls =
    status === "completed"
      ? "bg-accent-400/15 text-accent-300 ring-1 ring-accent-400/30"
      : status === "active"
      ? "bg-warn-400/15 text-warn-400 ring-1 ring-warn-400/30"
      : "bg-bad-400/15 text-bad-400 ring-1 ring-bad-400/30";
  return (
    <span
      className={[
        "px-1.5 py-0.5 rounded text-[10px] font-mono uppercase tracking-widest",
        cls,
      ].join(" ")}
    >
      {status}
    </span>
  );
}
