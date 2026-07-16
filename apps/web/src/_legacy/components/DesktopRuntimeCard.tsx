import { useEffect, useState } from "react";
import {
  desktopAdbConnect,
  desktopAdbBatteryStatus,
  desktopAdbDevicesStatus,
  desktopAdbThermalStatus,
  desktopHealth,
  desktopImportNativeVideos,
  desktopLabosApiStart,
  desktopLabosApiStatus,
  desktopLabosApiStop,
  desktopNativeVideoInventory,
  desktopPowerSample,
  isDesktopRuntime,
  kitchenAttachNativeVideoArtifact,
  kitchenSavedSessionManifest,
  kitchenSavedSessionManifests,
  type DesktopAdbDevicesStatus,
  type DesktopBatteryStatus,
  type DesktopHealth,
  type DesktopNativeVideoFile,
  type DesktopNativeVideoImportResult,
  type DesktopNativeVideoInventory,
  type DesktopPowerSampleResult,
  type DesktopThermalStatus,
  type KitchenSavedManifestSummary,
  type KitchenSessionManifest,
  type LabosApiStatus,
} from "../api";
import {
  suggestNativeVideoAttachment,
  type NativeVideoAttachSuggestion,
} from "./desktopNativeVideoAttach";
import { Badge, Btn, Card, CardHeader, CardTitle, Icon, Input } from "./ui";

function firstDevice(devices: DesktopAdbDevicesStatus | null) {
  return devices?.devices.find((device) => device.state === "device") ?? devices?.devices[0] ?? null;
}

function deviceLabel(devices: DesktopAdbDevicesStatus | null) {
  const device = firstDevice(devices);
  if (!device) return "No ADB device";
  const name = device.model || device.product || device.state;
  return `${device.serial} ${name}`;
}

function batterySummary(battery: DesktopBatteryStatus | null) {
  if (!battery?.ok) return "Unavailable";
  return [
    typeof battery.level_percent === "number" ? `${battery.level_percent}%` : null,
    typeof battery.temperature_c === "number" ? `${battery.temperature_c.toFixed(1)}C` : null,
    battery.status_label,
  ].filter(Boolean).join(" / ") || "Unavailable";
}

function thermalSummary(thermal: DesktopThermalStatus | null) {
  if (!thermal?.ok || !thermal.hottest) return "Unavailable";
  return `${thermal.hottest.celsius.toFixed(1)}C ${thermal.hottest.label}`;
}

function formatBytes(value?: number | null) {
  if (typeof value !== "number") return "-";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function fileDate(file: DesktopNativeVideoFile) {
  if (!file.modified_unix_seconds) return "-";
  return new Date(file.modified_unix_seconds * 1000).toLocaleString();
}

function formatDistance(ms?: number) {
  if (typeof ms !== "number") return "";
  if (ms < 60_000) return "<1 min";
  if (ms < 60 * 60_000) return `${Math.round(ms / 60_000)} min`;
  return `${(ms / 60 / 60_000).toFixed(1)} hr`;
}

export default function DesktopRuntimeCard() {
  const desktop = isDesktopRuntime();
  const [health, setHealth] = useState<DesktopHealth | null>(null);
  const [api, setApi] = useState<LabosApiStatus | null>(null);
  const [devices, setDevices] = useState<DesktopAdbDevicesStatus | null>(null);
  const [battery, setBattery] = useState<DesktopBatteryStatus | null>(null);
  const [thermal, setThermal] = useState<DesktopThermalStatus | null>(null);
  const [connectTarget, setConnectTarget] = useState("");
  const [inventory, setInventory] = useState<DesktopNativeVideoInventory | null>(null);
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const [importResult, setImportResult] = useState<DesktopNativeVideoImportResult | null>(null);
  const [sample, setSample] = useState<DesktopPowerSampleResult | null>(null);
  const [durationMs, setDurationMs] = useState(10_000);
  const [intervalMs, setIntervalMs] = useState(2_000);
  const [profileLabel, setProfileLabel] = useState("desktop-spot-check");
  const [attachRunId, setAttachRunId] = useState("");
  const [attachStepNumber, setAttachStepNumber] = useState("");
  const [attachResult, setAttachResult] = useState<string | null>(null);
  const [savedRuns, setSavedRuns] = useState<KitchenSavedManifestSummary[]>([]);
  const [savedManifests, setSavedManifests] = useState<KitchenSessionManifest[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const selectedFiles = selectedPaths
    .map((path) => inventory?.files.find((file) => file.device_path === path))
    .filter((file): file is DesktopNativeVideoFile => !!file);
  const primarySuggestion: NativeVideoAttachSuggestion | null = selectedFiles[0]
    ? suggestNativeVideoAttachment(selectedFiles[0], savedManifests, savedRuns)
    : null;

  async function refresh() {
    if (!desktop) return;
    const [nextHealth, nextApi, nextDevices] = await Promise.all([
      desktopHealth(),
      desktopLabosApiStatus(),
      desktopAdbDevicesStatus(),
    ]);
    setHealth(nextHealth);
    setApi(nextApi);
    setDevices(nextDevices);
    if (!connectTarget.trim() && nextHealth?.default_adb_target) {
      setConnectTarget(nextHealth.default_adb_target);
    }
    if (nextDevices?.auto_connect_attempted && nextDevices.auto_connect) {
      setMessage(
        nextDevices.auto_connect.ok
          ? nextDevices.auto_connect.stdout || `ADB connected to ${nextDevices.auto_connect_target}`
          : nextDevices.auto_connect.stderr || `ADB connect failed for ${nextDevices.auto_connect_target}`,
      );
    }
    if (nextApi?.running) {
      kitchenSavedSessionManifests()
        .then(async (result) => {
          const manifests = result.manifests || [];
          setSavedRuns(manifests);
          const recent = manifests.slice(0, 12);
          const fullManifests = await Promise.all(
            recent.map((run) => kitchenSavedSessionManifest(run.runId).catch(() => null)),
          );
          setSavedManifests(fullManifests.filter((manifest): manifest is KitchenSessionManifest => !!manifest));
        })
        .catch(() => {
          setSavedRuns([]);
          setSavedManifests([]);
        });
    } else {
      setSavedRuns([]);
      setSavedManifests([]);
    }

    const serial = firstDevice(nextDevices)?.serial;
    if (!serial) {
      setBattery(null);
      setThermal(null);
      return;
    }
    const [nextBattery, nextThermal] = await Promise.all([
      desktopAdbBatteryStatus(serial),
      desktopAdbThermalStatus(serial),
    ]);
    setBattery(nextBattery);
    setThermal(nextThermal);
  }

  async function startApi() {
    setBusy(true);
    setMessage(null);
    try {
      setApi(await desktopLabosApiStart());
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function stopApi() {
    setBusy(true);
    setMessage(null);
    try {
      setApi(await desktopLabosApiStop());
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function samplePower() {
    const serial = firstDevice(devices)?.serial;
    setBusy(true);
    setMessage(null);
    try {
      setSample(await desktopPowerSample({
        serial,
        duration_ms: durationMs,
        interval_ms: intervalMs,
        profile_label: profileLabel,
      }));
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function connectDevice() {
    setBusy(true);
    setMessage(null);
    try {
      const result = await desktopAdbConnect(connectTarget.trim());
      setMessage(result?.ok ? result.stdout || "ADB connected" : result?.stderr || "ADB connect failed");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function loadInventory() {
    const serial = firstDevice(devices)?.serial;
    setBusy(true);
    setMessage(null);
    try {
      const nextInventory = await desktopNativeVideoInventory(serial);
      setInventory(nextInventory);
      const smallCandidates = (nextInventory?.files ?? [])
        .filter((file) => (file.size_bytes ?? Number.MAX_SAFE_INTEGER) > 0)
        .sort((a, b) => (a.size_bytes ?? Number.MAX_SAFE_INTEGER) - (b.size_bytes ?? Number.MAX_SAFE_INTEGER))
        .slice(0, 1)
        .map((file) => file.device_path);
      setSelectedPaths((current) => current.filter((path) => nextInventory?.files.some((file) => file.device_path === path)).concat(current.length ? [] : smallCandidates));
      setMessage(nextInventory?.ok ? `${nextInventory.files.length} native videos found` : nextInventory?.stderr || "Inventory failed");
    } finally {
      setBusy(false);
    }
  }

  async function importSelected() {
    const serial = firstDevice(devices)?.serial;
    setBusy(true);
    setMessage(null);
    setAttachResult(null);
    try {
      const result = await desktopImportNativeVideos({ serial, device_paths: selectedPaths });
      setImportResult(result);
      const runId = attachRunId.trim();
      if (result?.ok && result.imported.length) {
        const sourceDeviceSerial = serial || undefined;
        const attachments = await Promise.all(result.imported.map((file) => {
          const inventoryFile = inventory?.files.find((candidate) => candidate.device_path === file.device_path);
          const suggestion = inventoryFile ? suggestNativeVideoAttachment(inventoryFile, savedManifests, savedRuns) : null;
          const attachSuggestion = runId && suggestion?.runId !== runId ? null : suggestion;
          const targetRunId = runId || attachSuggestion?.runId || "";
          if (!targetRunId) return null;
          const manualStepNumber = Number(attachStepNumber);
          const stepNumber = Number.isFinite(manualStepNumber) ? manualStepNumber : attachSuggestion?.stepNumber;
          return kitchenAttachNativeVideoArtifact(targetRunId, {
            devicePath: file.device_path,
            localPath: file.local_path,
            sha256: file.sha256,
            sourceDeviceSerial,
            stepNumber,
            attemptId: attachSuggestion?.attemptId,
          });
        }));
        const attached = attachments.filter(Boolean);
        if (attached.length) {
          const target = runId || primarySuggestion?.runId || "suggested runs";
          setAttachResult(`Attached ${attached.length} file(s) to ${target}`);
        } else {
          setAttachResult("Imported files; no saved run matched closely enough for automatic attach");
        }
      }
      setMessage(result?.ok ? `Imported ${result.imported.length} file(s)` : result?.errors.join("; ") || "Import failed");
    } finally {
      setBusy(false);
    }
  }

  function togglePath(path: string) {
    setSelectedPaths((current) =>
      current.includes(path) ? current.filter((value) => value !== path) : [...current, path],
    );
  }

  useEffect(() => {
    void refresh();
    if (!desktop) return;
    const interval = window.setInterval(() => void refresh(), 10_000);
    return () => window.clearInterval(interval);
  }, [desktop]);

  if (!desktop) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle
          icon={
            <Icon
              d="M9 17.25v1.007a3 3 0 0 1-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0 1 15 18.257V17.25m6-12V15a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 15V5.25A2.25 2.25 0 0 1 5.25 3h13.5A2.25 2.25 0 0 1 21 5.25Z"
              size={16}
              className="text-good-fg"
            />
          }
          sub="Native desktop runtime"
        >
          Desktop Shell
        </CardTitle>
      </CardHeader>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
        <div className="rounded-lg border border-border/15 bg-border/10 px-3 py-2">
          <span className="text-[11px] text-muted">Local API</span>
          <div className="mt-1 flex items-center gap-2">
            <Badge color={api?.running ? "green" : "yellow"}>{api?.running ? "Running" : "Stopped"}</Badge>
            <span className="font-mono text-xs text-muted">:{api?.port ?? 3847}</span>
          </div>
        </div>
        <div className="rounded-lg border border-border/15 bg-border/10 px-3 py-2">
          <span className="text-[11px] text-muted">ADB</span>
          <div className="mt-1 flex items-center gap-2">
            <Badge color={health?.adb_available ? "green" : "red"}>{health?.adb_available ? "Available" : "Missing"}</Badge>
          </div>
        </div>
        <div className="rounded-lg border border-border/15 bg-border/10 px-3 py-2">
          <span className="text-[11px] text-muted">Device</span>
          <p className="mt-1 truncate font-mono text-xs text-fg">{deviceLabel(devices)}</p>
        </div>
        <div className="rounded-lg border border-border/15 bg-border/10 px-3 py-2">
          <span className="text-[11px] text-muted">Battery</span>
          <p className="mt-1 truncate font-mono text-xs text-fg">{batterySummary(battery)}</p>
        </div>
        <div className="rounded-lg border border-border/15 bg-border/10 px-3 py-2">
          <span className="text-[11px] text-muted">Thermal</span>
          <p className="mt-1 truncate font-mono text-xs text-fg">{thermalSummary(thermal)}</p>
        </div>
      </div>

      {api?.error ? <p className="mt-3 text-xs text-red-400">{api.error}</p> : null}
      {message ? <p className="mt-3 text-xs text-muted">{message}</p> : null}
      {sample ? (
        <p className="mt-3 text-xs text-muted">
          Power sample: {sample.samples.length} points / {sample.interval_ms}ms cadence
          {sample.artifact_path ? ` / saved to ${sample.artifact_path}` : ""}
          {sample.errors.length ? ` / ${sample.errors.length} errors` : ""}
        </p>
      ) : null}

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_1.4fr]">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Btn size="sm" onClick={refresh} disabled={busy}>
              Refresh
            </Btn>
            <Btn size="sm" variant="primary" onClick={startApi} loading={busy} disabled={api?.running}>
              Start API
            </Btn>
            <Btn size="sm" variant="danger" onClick={stopApi} loading={busy} disabled={!api?.managed_by_desktop}>
              Stop Managed API
            </Btn>
          </div>

          <div className="grid grid-cols-[1fr_auto] gap-2">
            <Input
              sizing="sm"
              value={connectTarget}
              onChange={(event) => setConnectTarget(event.target.value)}
              placeholder="192.168.50.122:5555"
            />
            <Btn size="sm" onClick={connectDevice} loading={busy} disabled={!connectTarget.trim()}>
              Connect
            </Btn>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Input
              sizing="sm"
              type="number"
              min={1000}
              max={300000}
              step={1000}
              value={durationMs}
              onChange={(event) => setDurationMs(Number(event.target.value))}
              aria-label="Sample duration milliseconds"
            />
            <Input
              sizing="sm"
              type="number"
              min={500}
              max={60000}
              step={500}
              value={intervalMs}
              onChange={(event) => setIntervalMs(Number(event.target.value))}
              aria-label="Sample interval milliseconds"
            />
            <Btn size="sm" onClick={samplePower} loading={busy} disabled={!devices?.devices.length}>
              Sample Power
            </Btn>
          </div>
          <Input
            sizing="sm"
            value={profileLabel}
            onChange={(event) => setProfileLabel(event.target.value)}
            placeholder="profile label"
          />

          <div className="grid grid-cols-[1fr_7rem] gap-2">
            <Input
              sizing="sm"
              value={attachRunId}
              onChange={(event) => setAttachRunId(event.target.value)}
              placeholder="saved run id for imported videos"
              aria-label="Saved run id for imported videos"
              list="desktop-native-video-runs"
            />
            <datalist id="desktop-native-video-runs">
              {savedRuns.map((run) => (
                <option
                  key={run.runId}
                  value={run.runId}
                  label={`${run.protocolName || run.protocolId || "Kitchen run"} / ${run.savedAt}`}
                />
              ))}
            </datalist>
            <Input
              sizing="sm"
              type="number"
              min={1}
              value={attachStepNumber}
              onChange={(event) => setAttachStepNumber(event.target.value)}
              placeholder="step"
              aria-label="Optional step number"
            />
          </div>
          {primarySuggestion ? (
            <div className="rounded-lg border border-highlight-border/25 bg-good-fg/10 px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-good-fg">
                Suggested attach
              </p>
              <p className="mt-1 text-xs text-fg">
                {primarySuggestion.runLabel}
                {primarySuggestion.stepNumber ? ` / step ${primarySuggestion.stepNumber}` : ""}
              </p>
              <p className="mt-1 text-[11px] text-muted">
                {primarySuggestion.confidence} confidence / {formatDistance(primarySuggestion.distanceMs)} from {primarySuggestion.reason}
              </p>
              <Btn
                size="sm"
                className="mt-2"
                onClick={() => {
                  setAttachRunId(primarySuggestion.runId);
                  setAttachStepNumber(primarySuggestion.stepNumber ? String(primarySuggestion.stepNumber) : "");
                }}
              >
                Use Suggestion
              </Btn>
            </div>
          ) : selectedPaths.length ? (
            <p className="text-xs text-muted">No close saved-run match for the selected native video timestamp.</p>
          ) : null}
        </div>

        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-xs font-semibold text-fg">Native Videos</p>
              <p className="text-[11px] text-muted">{inventory ? `${inventory.files.length} files` : "Inventory not loaded"}</p>
            </div>
            <div className="flex gap-2">
              <Btn size="sm" onClick={loadInventory} loading={busy} disabled={!devices?.devices.length}>
                Inventory
              </Btn>
              <Btn size="sm" variant="primary" onClick={importSelected} loading={busy} disabled={!selectedPaths.length}>
                Import {selectedPaths.length || ""}
              </Btn>
            </div>
          </div>

          <div className="max-h-56 overflow-auto rounded-lg border border-border/15">
            {(inventory?.files ?? []).slice(0, 20).map((file) => (
              <label
                key={file.device_path}
                className="grid grid-cols-[auto_1fr_auto] items-center gap-2 border-b border-border/10 px-3 py-2 last:border-b-0"
              >
                <input
                  type="checkbox"
                  checked={selectedPaths.includes(file.device_path)}
                  onChange={() => togglePath(file.device_path)}
                  className="h-4 w-4 accent-emerald-400"
                />
                <span className="min-w-0">
                  <span className="block truncate font-mono text-xs text-fg">{file.name}</span>
                  <span className="block truncate text-[11px] text-muted">{fileDate(file)}</span>
                </span>
                <span className="font-mono text-[11px] text-muted">{formatBytes(file.size_bytes)}</span>
              </label>
            ))}
            {inventory && inventory.files.length === 0 ? (
              <p className="px-3 py-3 text-xs text-muted">No native videos found.</p>
            ) : null}
            {!inventory ? <p className="px-3 py-3 text-xs text-muted">Load inventory to select native recordings.</p> : null}
          </div>

          {importResult ? (
            <div className="mt-2 rounded-lg border border-border/15 bg-border/10 px-3 py-2">
              <p className="text-[11px] text-muted">Last import</p>
              <p className="mt-1 truncate font-mono text-xs text-fg">{importResult.destination_dir}</p>
              <p className="mt-1 text-xs text-muted">
                {importResult.imported.length} imported{importResult.errors.length ? ` / ${importResult.errors.length} errors` : ""}
              </p>
              {attachResult ? <p className="mt-1 text-xs text-good-fg">{attachResult}</p> : null}
            </div>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
