import { useState, useCallback } from "react";
import { usePolling } from "../hooks/usePolling";
import { listApps, launchApp, stopApp, uninstallApp, installApk } from "../api";
import { ConfirmDialog } from "./ui";

interface Props {
  connected: boolean;
}

export default function AppManager({ connected }: Props) {
  const [filter, setFilter] = useState<string>("user");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [msg, setMsg] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [uninstallTarget, setUninstallTarget] = useState<string | null>(null);

  const fetcher = useCallback(() => listApps(filter), [filter]);
  const { data, refresh, loading } = usePolling(fetcher, 30000, connected);

  const packages = (data?.packages || []).filter((p) =>
    p.toLowerCase().includes(search.toLowerCase())
  );

  async function handleAction(pkg: string, action: "launch" | "stop" | "uninstall") {
    if (action === "uninstall") {
      setUninstallTarget(pkg);
      return;
    }
    setBusy((b) => ({ ...b, [pkg]: true }));
    setMsg("");
    try {
      if (action === "launch") await launchApp(pkg);
      else if (action === "stop") await stopApp(pkg);
    } catch (e: any) {
      setMsg(e.message);
    }
    setBusy((b) => ({ ...b, [pkg]: false }));
  }

  async function confirmUninstall() {
    const pkg = uninstallTarget;
    setUninstallTarget(null);
    if (!pkg) return;
    setBusy((b) => ({ ...b, [pkg]: true }));
    setMsg("");
    try {
      const r = await uninstallApp(pkg);
      setMsg(r.output);
      refresh();
    } catch (e: any) {
      setMsg(e.message);
    }
    setBusy((b) => ({ ...b, [pkg]: false }));
  }

  async function handleInstall(file: File) {
    if (!file.name.endsWith(".apk")) {
      setMsg("File must be an APK");
      return;
    }
    setInstalling(true);
    setMsg(`Installing ${file.name}...`);
    try {
      const r = await installApk(file);
      setMsg(r.output);
      refresh();
    } catch (e: any) {
      setMsg(e.message);
    }
    setInstalling(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleInstall(file);
  }

  if (!connected) {
    return <div className="flex items-center justify-center h-64 text-muted">Connect to glasses first</div>;
  }

  return (
    <div className="space-y-4">
      <ConfirmDialog
        open={!!uninstallTarget}
        onClose={() => setUninstallTarget(null)}
        title="Uninstall app?"
        description={uninstallTarget ? `Package: ${uninstallTarget}` : undefined}
        destructive
        confirmText="Uninstall"
        onConfirm={confirmUninstall}
      />
      {/* Install dropzone */}
      <div
        className={`card border-dashed border-2 text-center py-8 cursor-pointer transition-colors ${
          dragOver ? "border-labos-green bg-labos-green/5" : "border-labos-border"
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => {
          const input = document.createElement("input");
          input.type = "file";
          input.accept = ".apk";
          input.onchange = () => input.files?.[0] && handleInstall(input.files[0]);
          input.click();
        }}
      >
        {installing ? (
          <p className="text-labos-green">Installing APK...</p>
        ) : (
          <p className="text-muted">Drop APK here or click to browse</p>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-3 items-center flex-wrap">
        <input
          type="text"
          className="input flex-1 min-w-[200px]"
          placeholder="Search packages..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="input"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="">All</option>
          <option value="user">User apps</option>
          <option value="system">System apps</option>
        </select>
        <button className="btn-secondary text-sm" onClick={refresh}>
          Refresh
        </button>
      </div>

      {msg && <p className="text-xs text-muted bg-border/10 border border-border/15 p-2 rounded">{msg}</p>}

      {/* Package list */}
      <div className="card max-h-[600px] overflow-y-auto">
        {loading && !data ? (
          <p className="text-muted">Loading packages...</p>
        ) : (
          <div className="space-y-1">
            <p className="text-xs text-muted mb-2">{packages.length} packages</p>
            {packages.map((pkg) => (
              <div
                key={pkg}
                className="flex items-center justify-between py-2 px-2 rounded hover:bg-border/10 group"
              >
                <span className="font-mono text-sm truncate flex-1 mr-2">{pkg}</span>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    className="px-2 py-1 text-xs rounded bg-labos-green/20 text-labos-green hover:bg-labos-green/30"
                    onClick={() => handleAction(pkg, "launch")}
                    disabled={busy[pkg]}
                  >
                    Launch
                  </button>
                  <button
                    className="px-2 py-1 text-xs rounded bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30"
                    onClick={() => handleAction(pkg, "stop")}
                    disabled={busy[pkg]}
                  >
                    Stop
                  </button>
                  <button
                    className="px-2 py-1 text-xs rounded bg-red-500/20 text-red-400 hover:bg-red-500/30"
                    onClick={() => handleAction(pkg, "uninstall")}
                    disabled={busy[pkg]}
                  >
                    Uninstall
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
