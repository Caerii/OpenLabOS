/**
 * DeviceControlPanel — operator surface for the connected device adapter.
 *
 * Tabbed view that wraps the legacy LabOS feature set: hardware, files,
 * packages, shell, settings, and audio cues. Each tab is its own
 * component so we can lazy-load them later without ripping the shell
 * apart.
 */
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  device,
  type BatterySummary,
  type DeviceStatus,
  type DeviceSystemInfo,
  type FilesListing,
  type SettingsPayload,
  type WifiStatus,
} from "../lib/device";

type TabId =
  | "hardware"
  | "files"
  | "packages"
  | "shell"
  | "settings"
  | "audio";

const TABS: Array<{ id: TabId; label: string }> = [
  { id: "hardware", label: "Hardware" },
  { id: "files", label: "Files" },
  { id: "packages", label: "Packages" },
  { id: "shell", label: "Shell" },
  { id: "settings", label: "Settings" },
  { id: "audio", label: "Audio cues" },
];

export function DeviceControlPanel() {
  const [active, setActive] = useState<TabId>("hardware");

  return (
    <section className="rounded-xl border border-white/5 bg-surface-1/60">
      <div className="flex items-center gap-1 px-3 py-2 border-b border-white/5 overflow-x-auto scrollbar-thin">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setActive(t.id)}
            className={[
              "relative px-3 py-1.5 rounded-md text-sm transition whitespace-nowrap",
              active === t.id
                ? "text-ink-high"
                : "text-ink-mid hover:text-ink-high",
            ].join(" ")}
          >
            {active === t.id && (
              <motion.span
                layoutId="device-tab-indicator"
                className="absolute inset-0 rounded-md bg-accent-400/10 ring-1 ring-accent-400/40 -z-10"
                transition={{ type: "spring", stiffness: 350, damping: 28 }}
              />
            )}
            {t.label}
          </button>
        ))}
      </div>

      <div className="p-5 min-h-[260px]">
        <AnimatePresence mode="wait">
          <motion.div
            key={active}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2 }}
          >
            {active === "hardware" && <HardwareTab />}
            {active === "files" && <FilesTab />}
            {active === "packages" && <PackagesTab />}
            {active === "shell" && <ShellTab />}
            {active === "settings" && <SettingsTab />}
            {active === "audio" && <AudioTab />}
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}

// ── Hardware ────────────────────────────────────────────────────

function HardwareTab() {
  const [status, setStatus] = useState<DeviceStatus | null>(null);
  const [info, setInfo] = useState<DeviceSystemInfo | null>(null);
  const [battery, setBattery] = useState<BatterySummary | null>(null);
  const [wifi, setWifi] = useState<WifiStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const [s, i, b, w] = await Promise.all([
          device.status(),
          device.systemInfo(),
          device.batterySummary(),
          device.wifiStatus(),
        ]);
        if (!cancelled) {
          setStatus(s);
          setInfo(i);
          setBattery(b);
          setWifi(w);
        }
      } catch {
        /* surfaced via per-row "—" placeholders */
      }
    };
    tick();
    const id = setInterval(tick, 4000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Stat
        label="Battery"
        value={battery ? `${battery.percent}%` : "—"}
        sub={battery ? `${battery.voltage} mV` : ""}
        accent={!!battery && battery.percent > 25}
      />
      <Stat
        label="MCU"
        value={
          status
            ? status.coreStatus.mcuConnected
              ? "connected"
              : "disconnected"
            : "—"
        }
        accent={status?.coreStatus.mcuConnected}
      />
      <Stat
        label="WiFi"
        value={wifi ? wifi.ssid : "—"}
        sub={wifi ? `${wifi.ip} · ${wifi.rssi} dBm` : ""}
        accent={!!wifi?.connected}
      />
      <Stat
        label="Build"
        value={info ? info.model : "—"}
        sub={info ? `Android ${info.androidVersion} · API ${info.sdkVersion}` : ""}
      />
      <Stat
        label="Uptime"
        value={info ? `${info.uptimeHours} h` : "—"}
        sub={info ? `${info.hardware} · ${info.brand}` : ""}
      />
      <Stat
        label="Heap"
        value={info ? `${info.jvmTotalMemoryMb}/${info.jvmMaxMemoryMb} MB` : "—"}
        sub={info ? `${info.jvmFreeMemoryMb} MB free` : ""}
      />
      <Stat
        label="Dashboard"
        value={status ? `v${status.dashboardVersion}` : "—"}
      />
      <Stat
        label="Serial"
        value={info ? info.serial : "—"}
        sub={info ? info.buildId : ""}
        mono
      />
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  accent,
  mono,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
  mono?: boolean;
}) {
  return (
    <div className="rounded-md border border-white/5 bg-surface-2/60 p-3">
      <div className="text-[10px] uppercase tracking-[0.18em] text-ink-low font-mono">
        {label}
      </div>
      <div
        className={[
          "mt-1.5 text-sm",
          mono ? "font-mono break-all" : "",
          value === "—"
            ? "text-ink-low"
            : accent
            ? "text-accent-300"
            : "text-ink-high",
        ].join(" ")}
      >
        {value}
      </div>
      {sub && (
        <div className="mt-0.5 text-[11px] font-mono text-ink-low break-all">
          {sub}
        </div>
      )}
    </div>
  );
}

// ── Files ───────────────────────────────────────────────────────

function FilesTab() {
  const [path, setPath] = useState("/sdcard");
  const [listing, setListing] = useState<FilesListing | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    device
      .listFiles(path)
      .then((r) => !cancelled && setListing(r))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [path]);

  const breadcrumbs = useMemo(() => {
    const segs = path.split("/").filter(Boolean);
    return segs.map((s, i) => ({
      label: s,
      path: "/" + segs.slice(0, i + 1).join("/"),
    }));
  }, [path]);

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-1 text-xs font-mono">
        <button
          onClick={() => setPath("/sdcard")}
          className="px-2 py-0.5 rounded text-accent-300 hover:bg-accent-400/10"
        >
          /sdcard
        </button>
        {breadcrumbs.length > 0 && (
          <>
            {breadcrumbs.map((b, i) =>
              i === 0 && b.path === "/sdcard" ? null : (
                <span key={b.path} className="flex items-center">
                  <span className="text-ink-low mx-1">/</span>
                  <button
                    onClick={() => setPath(b.path)}
                    className="px-1.5 py-0.5 rounded text-ink-mid hover:text-ink-high"
                  >
                    {b.label}
                  </button>
                </span>
              ),
            )}
          </>
        )}
      </div>

      {error && <ErrorBanner detail={error} />}

      <div className="max-h-[420px] overflow-auto scrollbar-thin rounded-md border border-white/5 bg-surface-2/40">
        <table className="w-full text-sm font-mono">
          <thead className="text-[10px] uppercase tracking-widest text-ink-low sticky top-0 bg-surface-2/95 backdrop-blur">
            <tr>
              <th className="text-left px-3 py-2">name</th>
              <th className="text-right px-3 py-2">size</th>
              <th className="text-right px-3 py-2">modified</th>
            </tr>
          </thead>
          <tbody>
            {listing?.entries.map((e) => (
              <tr
                key={e.path}
                className="border-t border-white/5 hover:bg-surface-3/40 cursor-pointer"
                onClick={() => e.isDirectory && setPath(e.path)}
              >
                <td className="px-3 py-1.5">
                  <span
                    className={
                      e.isDirectory ? "text-accent-300" : "text-ink-high"
                    }
                  >
                    {e.isDirectory ? `${e.name}/` : e.name}
                  </span>
                </td>
                <td className="px-3 py-1.5 text-right text-ink-mid">
                  {e.isDirectory ? "—" : formatSize(e.size ?? 0)}
                </td>
                <td className="px-3 py-1.5 text-right text-ink-low text-[11px]">
                  {e.modified
                    ? new Date(e.modified).toLocaleString()
                    : ""}
                </td>
              </tr>
            ))}
            {listing && listing.entries.length === 0 && (
              <tr>
                <td colSpan={3} className="px-3 py-4 text-center text-ink-low">
                  empty directory
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

// ── Packages ────────────────────────────────────────────────────

function PackagesTab() {
  const [packages, setPackages] = useState<string[]>([]);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);

  useEffect(() => {
    let cancelled = false;
    device
      .listPackages()
      .then((r) => {
        if (cancelled) return;
        const list = (r.packages as Array<unknown>).map((p) =>
          typeof p === "string" ? p : (p as { name: string }).name,
        );
        setPackages(list.sort());
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!filter) return packages;
    const f = filter.toLowerCase();
    return packages.filter((p) => p.toLowerCase().includes(f));
  }, [packages, filter]);

  // Virtualisation: render only the rows that are within the scroll
  // window plus a small overscan. Each row is a fixed 26px so we can
  // compute slice indices without measuring DOM.
  const ROW_HEIGHT = 26;
  const OVERSCAN = 8;
  const VIEWPORT = 420;
  const totalHeight = filtered.length * ROW_HEIGHT;
  const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const visibleCount = Math.ceil(VIEWPORT / ROW_HEIGHT) + OVERSCAN * 2;
  const end = Math.min(filtered.length, start + visibleCount);
  const offsetY = start * ROW_HEIGHT;
  const slice = filtered.slice(start, end);

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="filter packages…"
          className="flex-1 min-w-[200px] px-3 py-2 rounded-md bg-surface-2/60 border border-white/5 text-sm font-mono text-ink-high focus:outline-none focus:border-accent-400/40"
        />
        <span className="text-xs font-mono text-ink-low">
          {filtered.length} / {packages.length}
        </span>
      </div>

      {error && <ErrorBanner detail={error} />}

      <div
        ref={scrollRef}
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        className="overflow-auto scrollbar-thin rounded-md border border-white/5 bg-surface-2/40"
        style={{ height: VIEWPORT }}
      >
        <div style={{ height: totalHeight, position: "relative" }}>
          <ul
            className="divide-y divide-white/5 absolute left-0 right-0"
            style={{ top: offsetY }}
          >
            {slice.map((p) => (
              <li
                key={p}
                className="px-3 text-xs font-mono text-ink-high hover:bg-surface-3/40 transition flex items-center"
                style={{ height: ROW_HEIGHT }}
              >
                {p.startsWith("os.openlab") || p.startsWith("com.augmentiv") ? (
                  <span className="text-accent-300">{p}</span>
                ) : (
                  p
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

// ── Shell ───────────────────────────────────────────────────────

function ShellTab() {
  const [command, setCommand] = useState("getprop ro.product.model");
  const [history, setHistory] = useState<
    Array<{ command: string; stdout: string; stderr: string; exitCode: number; at: string }>
  >([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (!command.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const r = await device.shell(command);
      setHistory((h) => [
        { ...r, command, at: new Date().toLocaleTimeString() },
        ...h,
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run();
        }}
        className="flex gap-2"
      >
        <span className="font-mono text-accent-300 self-center">$</span>
        <input
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          className="flex-1 px-3 py-2 rounded-md bg-surface-2/60 border border-white/5 text-sm font-mono text-ink-high focus:outline-none focus:border-accent-400/40"
          spellCheck={false}
        />
        <button
          type="submit"
          disabled={busy}
          className="px-4 py-2 rounded-md bg-accent-400 text-surface-0 text-sm font-medium hover:bg-accent-300 transition disabled:opacity-50"
        >
          {busy ? "…" : "run"}
        </button>
      </form>

      {error && <ErrorBanner detail={error} />}

      <div className="max-h-[360px] overflow-auto scrollbar-thin grid gap-2">
        <AnimatePresence initial={false}>
          {history.map((h, i) => (
            <motion.div
              key={`${i}-${h.at}`}
              layout
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="rounded-md border border-white/5 bg-surface-2/40 p-3 font-mono text-xs"
            >
              <div className="flex items-center justify-between text-ink-low mb-1">
                <span>
                  <span className="text-accent-300">$ </span>
                  {h.command}
                </span>
                <span>
                  {h.at} · exit {h.exitCode}
                </span>
              </div>
              {h.stdout && (
                <pre className="whitespace-pre-wrap text-ink-high">{h.stdout}</pre>
              )}
              {h.stderr && (
                <pre className="whitespace-pre-wrap text-bad-400 mt-1">
                  {h.stderr}
                </pre>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ── Settings ────────────────────────────────────────────────────

function SettingsTab() {
  const [settings, setSettings] = useState<SettingsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    device
      .settings()
      .then((s) => !cancelled && setSettings(s))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <ErrorBanner detail={error} />;
  if (!settings)
    return <div className="text-sm text-ink-low">loading settings…</div>;

  const entries = Object.entries(settings).sort(([a], [b]) => a.localeCompare(b));
  return (
    <div className="max-h-[420px] overflow-auto scrollbar-thin rounded-md border border-white/5 bg-surface-2/40">
      <table className="w-full text-xs font-mono">
        <tbody className="divide-y divide-white/5">
          {entries.map(([k, v]) => (
            <tr key={k}>
              <td className="px-3 py-1.5 text-ink-mid">{k}</td>
              <td className="px-3 py-1.5 text-ink-high text-right break-all">
                {typeof v === "object" ? JSON.stringify(v) : String(v)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Audio cues ──────────────────────────────────────────────────

function AudioTab() {
  const cues = [
    { label: "Beep", payload: { type: "beep", durationMs: 200 } },
    { label: "Long beep", payload: { type: "beep", durationMs: 800 } },
    { label: "Chime", payload: { type: "chime" } },
    { label: "Voice: ready", payload: { type: "tts", text: "ready" } },
  ];
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="grid gap-3">
      <p className="text-sm text-ink-mid">
        Trigger an audio cue on the device. Useful for confirming the audio
        path during bring-up or stress-testing the operator's noise floor.
      </p>
      {error && <ErrorBanner detail={error} />}
      <div className="flex flex-wrap gap-2">
        {cues.map((c) => (
          <button
            key={c.label}
            disabled={busy === c.label}
            onClick={async () => {
              setBusy(c.label);
              setError(null);
              try {
                await device.playAudio(c.payload);
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
              } finally {
                setBusy(null);
              }
            }}
            className="px-3 py-2 rounded-md border border-white/10 text-sm hover:border-accent-400/40 hover:text-accent-300 transition disabled:opacity-50"
          >
            {busy === c.label ? "…" : c.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Shared error banner ────────────────────────────────────────

function ErrorBanner({ detail }: { detail: string }) {
  return (
    <div className="rounded-md border border-bad-400/40 bg-bad-400/10 px-3 py-2 text-xs font-mono text-bad-400 break-all">
      {detail}
    </div>
  );
}
