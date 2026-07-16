import { useState, useEffect } from "react";
import {
  deviceConnect,
  deviceDisconnect,
  deviceScan,
  deviceSelect,
  getConnectionMode,
  setConnectionMode,
  setWifiBase,
  setApiToken,
  getApiToken,
  ConnectionMode,
  AdbDevice,
} from "../api";
import { ConnectionControls } from "./connection/ConnectionControls";
import { ConnectionStatus } from "./connection/ConnectionStatus";
import { ModeToggle } from "./connection/ModeToggle";

interface Props {
  connected: boolean;
  deviceIp?: string;
  /** All ADB devices currently visible (from status polling) */
  devices?: AdbDevice[];
  /** Currently targeted device serial (null = auto/none) */
  targetDevice?: string | null;
  onRefresh: () => void;
}

/**
 * Top bar showing connection status, device picker, and ADB/WiFi mode toggle.
 *
 * When multiple ADB devices are connected (e.g. Quest 3 + an HMD-class device),
 * a device picker dropdown appears so the user can target the correct device.
 * All subsequent ADB commands route through the selected device via -s <serial>.
 */
export default function ConnectionBar({ connected, deviceIp, devices, targetDevice, onRefresh }: Props) {
  const [ip, setIp] = useState(deviceIp || "");
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [mode, setMode] = useState<ConnectionMode>(getConnectionMode());
  const [token, setToken] = useState(getApiToken());
  const [wifiConnected, setWifiConnected] = useState(false);
  const [controlsOpen, setControlsOpen] = useState(false);

  // Check WiFi proxy status on mount
  useEffect(() => {
    if (mode === "wifi") {
      fetch("/api/wifi-proxy/status")
        .then((r) => r.json())
        .then((data) => {
          setWifiConnected(data.mode === "wifi");
          if (data.glassesIp) setIp(data.glassesIp);
        })
        .catch(() => {});
    }
  }, [mode]);

  useEffect(() => {
    if (!msg) return;
    const timer = window.setTimeout(() => setMsg(""), 3500);
    return () => window.clearTimeout(timer);
  }, [msg]);

  // Show device picker prompt when multiple devices detected but none selected
  const onlineDevices = (devices || []).filter((d) => d.status === "device");
  const needsPicker = mode === "adb" && onlineDevices.length > 1 && !targetDevice;

  async function readJsonResponse<T>(res: Response): Promise<T> {
    const raw = await res.text();
    if (!raw.trim()) {
      throw new Error(`Empty response from ${res.url || "server"} (HTTP ${res.status})`);
    }
    try {
      return JSON.parse(raw) as T;
    } catch {
      throw new Error(raw.slice(0, 300));
    }
  }

  async function handleSelectDevice(serial: string) {
    setBusy(true);
    setMsg("");
    try {
      const r = await deviceSelect(serial);
      setMsg(`Selected: ${serial}${r.model ? ` (${r.model})` : ""}`);
      onRefresh();
    } catch (e: any) {
      setMsg(e.message);
    }
    setBusy(false);
  }

  async function handleConnect() {
    if (!ip.trim()) return;
    setBusy(true);
    setMsg("");
    try {
      if (mode === "wifi") {
        const res = await fetch("/api/wifi-proxy/enable", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ip: ip.trim(), token: token || undefined }),
        });
        const data = await readJsonResponse<{ error?: string; token?: string }>(res);
        if (!res.ok) throw new Error(data.error || `WiFi proxy failed with HTTP ${res.status}`);
        setWifiBase(ip.trim());
        if (data.token) {
          setApiToken(data.token);
          setToken(data.token);
        }
        setWifiConnected(true);
        setMsg(`WiFi connected to ${ip.trim()}`);
      } else {
        const r = await deviceConnect(ip.trim());
        setMsg(r.output);
      }
      onRefresh();
    } catch (e: any) {
      setMsg(e.message);
    }
    setBusy(false);
  }

  async function handleDisconnect() {
    setBusy(true);
    try {
      if (mode === "wifi") {
        await fetch("/api/wifi-proxy/disable", { method: "POST" });
        setWifiConnected(false);
        setMsg("WiFi proxy disabled");
      } else {
        await deviceDisconnect();
      }
      onRefresh();
    } catch (e: any) {
      setMsg(e.message);
    }
    setBusy(false);
  }

  async function handleScan() {
    setScanning(true);
    setMsg("Scanning network for glasses...");
    try {
      const r = await deviceScan();
      if (r.devices.length > 0) {
        setIp(r.devices[0]);
        setMsg(`Found: ${r.devices.join(", ")}`);
      } else {
        setMsg("No devices found on network");
      }
    } catch (e: any) {
      setMsg(e.message);
    }
    setScanning(false);
  }

  function handleModeSwitch(newMode: ConnectionMode) {
    setMode(newMode);
    setControlsOpen(true);
    setConnectionMode(newMode);
    setMsg("");
    if (newMode === "adb" && wifiConnected) {
      fetch("/api/wifi-proxy/disable", { method: "POST" })
        .then(() => setWifiConnected(false))
        .catch(() => {});
    }
    onRefresh();
  }

  const isConnected = mode === "wifi" ? wifiConnected : connected;
  const showControls = !isConnected || needsPicker || controlsOpen;

  return (
    <div className="flex-1 min-w-0">
      <div className="flex min-w-0 flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-2">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <ConnectionStatus
            isConnected={isConnected}
            mode={mode}
            label={deviceIp || ip}
            needsPicker={needsPicker}
          />

          <ModeToggle mode={mode} onChange={handleModeSwitch} />

          {isConnected && !needsPicker && (
            <button
              type="button"
              className="ml-auto rounded-md border border-border/20 bg-border/10 px-2 py-1 text-[11px] font-medium text-muted transition-colors hover:bg-border/15 hover:text-fg"
              onClick={() => setControlsOpen((v) => !v)}
            >
              {controlsOpen ? "Hide" : "Manage"}
            </button>
          )}
        </div>

        <div className="hidden flex-1 sm:block" />

        <div className={showControls ? "flex min-w-0" : "hidden"}>
          <ConnectionControls
            mode={mode}
            onlineDevices={onlineDevices}
            targetDevice={targetDevice}
            busy={busy}
            scanning={scanning}
            ip={ip}
            token={token}
            isConnected={isConnected}
            onIpChange={setIp}
            onTokenChange={(v) => {
              setToken(v);
              setApiToken(v);
            }}
            onSelectDevice={handleSelectDevice}
            onConnect={handleConnect}
            onDisconnect={handleDisconnect}
            onScan={handleScan}
          />
        </div>
      </div>
      {msg && <p className="text-xs text-muted mt-1">{msg}</p>}
    </div>
  );
}
