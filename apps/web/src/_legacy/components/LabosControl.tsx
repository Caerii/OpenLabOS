import { useState } from "react";
import { usePolling } from "../hooks/usePolling";
import {
  labosStatus,
  labosActivate,
  labosDeactivate,
  labosDeploy,
  labosLaunch,
  labosStop,
  LabosModule,
} from "../api";

interface Props {
  connected: boolean;
}

export default function LabosControl({ connected }: Props) {
  const { data: labos, refresh } = usePolling(labosStatus, 10000, connected);
  const [output, setOutput] = useState("");
  const [busy, setBusy] = useState("");

  async function run(label: string, fn: () => Promise<any>) {
    setBusy(label);
    setOutput("");
    try {
      const r = await fn();
      setOutput(typeof r === "string" ? r : JSON.stringify(r, null, 2));
      refresh();
    } catch (e: any) {
      setOutput(`Error: ${e.message}`);
    }
    setBusy("");
  }

  if (!connected) {
    return <div className="flex items-center justify-center h-64 text-muted">Connect to glasses first</div>;
  }

  return (
    <div className="space-y-4">
      {/* Core Status */}
      <div className="card">
        <h2 className="text-accentText font-semibold mb-3">LabOS Status</h2>
        {labos ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-muted">Package</span>
              <p className="font-mono text-xs">{labos.packageName}</p>
            </div>
            <div>
              <span className="text-muted">Installed</span>
              <p className={labos.isInstalled ? "text-labos-green" : "text-red-400"}>
                {labos.isInstalled ? "Yes" : "No"}
              </p>
            </div>
            <div>
              <span className="text-muted">Device Owner</span>
              <p className={labos.isDeviceOwner ? "text-labos-green" : "text-red-400"}>
                {labos.isDeviceOwner ? "Active" : "Inactive"}
              </p>
            </div>
            <div>
              <span className="text-muted">Running</span>
              <p className={labos.isRunning ? "text-labos-green" : "text-yellow-400"}>
                {labos.isRunning ? "Yes" : "No"}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-muted">Loading...</p>
        )}
      </div>

      {/* Module Status */}
      {labos?.modules && labos.modules.length > 0 && (
        <div className="card">
          <h2 className="text-accentText font-semibold mb-3">Modules</h2>
          <div className="space-y-2">
            {labos.modules.map((m: LabosModule) => (
              <div key={m.name} className="flex flex-col gap-2 text-sm bg-border/10 border border-border/15 rounded px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${m.installed ? (m.isLatest ? "bg-labos-green" : "bg-yellow-400") : "bg-red-500"}`} />
                    <span className="font-medium">{m.name}</span>
                    <span className="text-muted font-mono text-xs truncate">{m.pkg}</span>
                    {m.installed && m.isLatest && <span className="text-labos-green text-xs">latest</span>}
                    {m.installed && m.needsUpdate && <span className="text-yellow-500 text-xs">update available</span>}
                    {!m.installed && <span className="text-red-400 text-xs">not installed</span>}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
                    <span>
                      Installed:{" "}
                      <span className="font-mono text-fg">
                        {m.installedVersionName || "unknown"}
                        {m.installedVersionCode != null ? ` (${m.installedVersionCode})` : ""}
                      </span>
                    </span>
                    <span>
                      Selected APK:{" "}
                      <span className="font-mono text-fg">
                        {m.builtVersionName || "unknown"}
                        {m.builtVersionCode != null ? ` (${m.builtVersionCode})` : ""}
                      </span>
                      {m.apkSource && <span className="ml-1 text-muted">from {m.apkSource}</span>}
                    </span>
                    {m.apkPath && <span className="font-mono">{m.apkPath}</span>}
                    {m.prebuiltApkExists && !m.buildApkExists && <span>using checked-in prebuilt</span>}
                  </div>
                  {(m.installedSignatureSummary || m.builtCertSha256) && (
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted">
                      {m.installedSignatureSummary && (
                        <span>
                          Installed sig: <span className="font-mono text-fg">{m.installedSignatureSummary}</span>
                        </span>
                      )}
                      {m.builtCertSha256 && (
                        <span>
                          Built cert: <span className="font-mono text-fg">{m.builtCertSha256.slice(0, 12)}...</span>
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {!m.apkExists && <span className="text-yellow-500 text-xs">APK not built</span>}
                  <button
                    className="btn-secondary text-xs py-1 px-2"
                    onClick={() => run(`deploy-${m.name}`, () => labosDeploy(m.name))}
                    disabled={!!busy || !m.apkExists || (!!m.installed && !!m.isLatest)}
                  >
                    {busy === `deploy-${m.name}` ? "..." : m.installed ? (m.isLatest ? "Current" : "Update") : "Install"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="card">
        <h2 className="text-accentText font-semibold mb-3">Actions</h2>
        <div className="flex flex-wrap gap-3">
          <button
            className="btn-primary"
            onClick={() => run("deploy-all", () => labosDeploy("all"))}
            disabled={!!busy}
          >
            {busy === "deploy-all" ? "Deploying..." : "Deploy All Modules"}
          </button>

          {labos?.isDeviceOwner ? (
            <button
              className="btn-danger"
              onClick={() => run("deactivate", labosDeactivate)}
              disabled={!!busy}
            >
              {busy === "deactivate" ? "Deactivating..." : "Deactivate Device Owner"}
            </button>
          ) : (
            <button
              className="btn-primary"
              onClick={() => run("activate", labosActivate)}
              disabled={!!busy}
            >
              {busy === "activate" ? "Activating..." : "Activate Device Owner"}
            </button>
          )}

          <button
            className="btn-secondary"
            onClick={() => run("launch", labosLaunch)}
            disabled={!!busy}
          >
            Launch LabOS
          </button>

          <button
            className="btn-secondary"
            onClick={() => run("stop", labosStop)}
            disabled={!!busy}
          >
            Stop LabOS
          </button>
        </div>
      </div>

      {/* Output */}
      {output && (
        <pre className="card text-xs font-mono text-muted whitespace-pre-wrap max-h-64 overflow-y-auto">
          {output}
        </pre>
      )}
    </div>
  );
}
