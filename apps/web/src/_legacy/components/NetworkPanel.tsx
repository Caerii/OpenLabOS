import { useState } from "react";
import { usePolling } from "../hooks/usePolling";
import {
  fetchWifiStatus,
  fetchBluetoothStatus,
  fetchConnectivity,
  fetchHostBluetoothStatus,
  openHostBluetoothSettings,
  scanHostBluetooth,
  type WifiStatus,
  type BluetoothStatus,
  type ConnectivityInfo,
  type HostBluetoothStatus,
} from "../api";
import { ConnectionRequiredState, LoadingState } from "./ui";

interface Props {
  connected: boolean;
}

function signalStrengthBars(strength: number): number {
  // strength is typically -100 to 0 dBm, map to 0-4 bars
  if (strength >= -50) return 4;
  if (strength >= -60) return 3;
  if (strength >= -70) return 2;
  if (strength >= -80) return 1;
  return 0;
}

function SignalBars({ strength }: { strength: number }) {
  const bars = signalStrengthBars(strength);
  return (
    <div className="flex items-end gap-0.5 h-5">
      {[1, 2, 3, 4].map((level) => (
        <div
          key={level}
          className={`w-1.5 rounded-sm transition-colors ${
            level <= bars ? "bg-labos-green" : "bg-labos-border"
          }`}
          style={{ height: `${level * 25}%` }}
        />
      ))}
    </div>
  );
}

function WifiSection({ data, loading }: { data: WifiStatus | null; loading: boolean }) {
  if (loading && !data) return <LoadingState />;
  if (!data) return null;

  return (
    <div className="card">
      <h3 className="text-accentText font-semibold mb-3">WiFi</h3>
      <div className="flex items-start gap-4">
        <div
          className={`w-12 h-12 rounded-full flex items-center justify-center border-2 flex-shrink-0 ${
            data.connected ? "border-labos-green bg-labos-green/10" : "border-red-500 bg-red-500/10"
          }`}
        >
          <svg className={`w-6 h-6 ${data.connected ? "text-labos-green" : "text-red-500"}`} fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M17.778 8.222c-4.296-4.296-11.26-4.296-15.556 0A1 1 0 01.808 6.808c5.076-5.076 13.308-5.076 18.384 0a1 1 0 01-1.414 1.414zM14.95 11.05a7 7 0 00-9.9 0 1 1 0 01-1.414-1.414 9 9 0 0112.728 0 1 1 0 01-1.414 1.414zM12.12 13.88a3 3 0 00-4.242 0 1 1 0 01-1.415-1.415 5 5 0 017.072 0 1 1 0 01-1.415 1.415zM9 16a1 1 0 011-1h.01a1 1 0 110 2H10a1 1 0 01-1-1z" clipRule="evenodd" />
          </svg>
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm flex-1">
          <div>
            <span className="text-muted">SSID</span>
            <p className="font-mono">{data.ssid || "Not connected"}</p>
          </div>
          <div>
            <span className="text-muted">Signal</span>
            <div className="flex items-center gap-2">
              <SignalBars strength={data.signalStrength} />
              <span className="font-mono text-xs text-subtle">{data.signalStrength} dBm</span>
            </div>
          </div>
          <div>
            <span className="text-muted">Frequency</span>
            <p className="font-mono">{data.frequencyMHz} MHz</p>
          </div>
          <div>
            <span className="text-muted">Link Speed</span>
            <p className="font-mono">{data.linkSpeedMbps} Mbps</p>
          </div>
          <div className="col-span-2">
            <span className="text-muted">IP Address</span>
            <p className="font-mono">{data.ipAddress || "N/A"}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function BluetoothSection({ data, loading }: { data: BluetoothStatus | null; loading: boolean }) {
  if (loading && !data) return <LoadingState />;
  if (!data) return null;

  return (
    <div className="card">
      <h3 className="text-accentText font-semibold mb-3">Bluetooth</h3>
      <div className="grid grid-cols-2 gap-3 text-sm mb-3">
        <div>
          <span className="text-muted">Status</span>
          <p className={data.enabled ? "text-labos-green" : "text-red-400"}>
            {data.enabled ? "Enabled" : "Disabled"}
          </p>
        </div>
        <div>
          <span className="text-muted">Device Name</span>
          <p className="font-mono">{data.deviceName || "N/A"}</p>
        </div>
        <div className="col-span-2">
          <span className="text-muted">MAC Address</span>
          <p className="font-mono text-xs">{data.macAddress || "N/A"}</p>
        </div>
      </div>
      {data.connectedDevices?.length ? (
        <div>
          <span className="text-muted text-sm">Connected Devices</span>
          <div className="mt-1 space-y-1">
            {data.connectedDevices.map((dev) => (
              <div key={dev.address} className="flex items-center gap-2 py-1 px-2 rounded bg-border/10">
                <div className="w-2 h-2 rounded-full bg-labos-green flex-shrink-0" />
                <span className="text-sm text-muted">{dev.name || "Unknown"}</span>
                <span className="text-xs text-subtle font-mono ml-auto">{dev.address}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted">No connected devices</p>
      )}
    </div>
  );
}

function HostBluetoothSection({
  data,
  loading,
  busy,
  message,
  onOpenSettings,
  onScan,
  onRefresh,
}: {
  data: HostBluetoothStatus | null;
  loading: boolean;
  busy: string;
  message: string;
  onOpenSettings: () => void;
  onScan: () => void;
  onRefresh: () => void;
}) {
  const devices = data?.devices ?? [];
  const likelyAudio = devices.filter((device) => /audio|headset|hands-free|avrcp|a2dp|mentra|glasses/i.test(device.name));

  return (
    <div className="card border-accent/20 bg-accent/5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-accentText font-semibold">Host Bluetooth Pairing</h3>
          <p className="text-sm text-muted mt-1 max-w-2xl">
            Pair the glasses as a desktop Bluetooth audio device for speaker/mic routing. The browser cannot reliably pair
            classic Bluetooth audio, so LabOS opens the Windows pairing flow and tracks known host devices here.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary text-xs" onClick={onScan} disabled={!!busy}>
            {busy === "scan" ? "Opening..." : "Scan / Pair"}
          </button>
          <button className="btn-secondary text-xs" onClick={onOpenSettings} disabled={!!busy}>
            {busy === "settings" ? "Opening..." : "Open Settings"}
          </button>
          <button className="btn-secondary text-xs" onClick={onRefresh} disabled={loading}>
            Refresh
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-border/30 bg-surface-1/80 p-3">
          <span className="text-muted text-xs uppercase tracking-wide">Host support</span>
          <p className={data?.supported ? "text-labos-green font-medium" : "text-amber-500 font-medium"}>
            {loading && !data ? "Checking..." : data?.supported ? "Windows Bluetooth controls ready" : "Limited"}
          </p>
          <p className="text-xs text-muted mt-1">{data?.message || "Querying desktop Bluetooth state."}</p>
        </div>
        <div className="rounded-xl border border-border/30 bg-surface-1/80 p-3">
          <span className="text-muted text-xs uppercase tracking-wide">Known devices</span>
          <p className="font-mono text-lg">{devices.length}</p>
          <p className="text-xs text-muted">From the desktop Bluetooth device table.</p>
        </div>
        <div className="rounded-xl border border-border/30 bg-surface-1/80 p-3">
          <span className="text-muted text-xs uppercase tracking-wide">Likely audio/glasses</span>
          <p className="font-mono text-lg">{likelyAudio.length}</p>
          <p className="text-xs text-muted">Names matching audio, headset, Mentra, or glasses.</p>
        </div>
      </div>

      {message && <p className="mt-3 text-xs text-accentText">{message}</p>}

      <div className="mt-4 space-y-2">
        {devices.slice(0, 8).map((device) => (
          <div key={device.instanceId || device.name} className="flex items-center gap-2 rounded-lg border border-border/20 bg-surface-1/70 px-3 py-2">
            <div className={`h-2 w-2 rounded-full ${device.connected ? "bg-labos-green" : "bg-border"}`} />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-fg">{device.name}</p>
              <p className="truncate text-xs text-muted">{device.status} · {device.className}</p>
            </div>
          </div>
        ))}
        {!loading && devices.length === 0 && (
          <p className="text-xs text-muted">No host Bluetooth devices returned yet. Use Scan / Pair, put the glasses in pairing mode, then refresh.</p>
        )}
      </div>
    </div>
  );
}

function ConnectivitySection({
  data,
  loading,
  onTestPing,
  testing,
}: {
  data: ConnectivityInfo | null;
  loading: boolean;
  onTestPing: () => void;
  testing: boolean;
}) {
  if (loading && !data) return <LoadingState />;
  if (!data) return null;

  return (
    <div className="card">
      <h3 className="text-accentText font-semibold mb-3">Internet Connectivity</h3>
      <div className="flex items-center gap-6">
        <div
          className={`w-16 h-16 rounded-full flex items-center justify-center border-2 flex-shrink-0 transition-colors ${
            data.internetReachable
              ? "border-labos-green bg-labos-green/10"
              : "border-red-500 bg-red-500/10"
          }`}
        >
          <svg
            className={`w-8 h-8 ${data.internetReachable ? "text-labos-green" : "text-red-500"}`}
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM4.332 8.027a6.012 6.012 0 011.912-2.706C6.512 5.73 6.974 6 7.5 6A1.5 1.5 0 019 7.5V8a2 2 0 004 0 2 2 0 011.523-1.943A5.977 5.977 0 0116 10c0 .34-.028.675-.083 1H15a2 2 0 00-2 2v2.197A5.973 5.973 0 0110 16v-2a2 2 0 00-2-2 2 2 0 01-2-2 2 2 0 00-1.668-1.973z" clipRule="evenodd" />
          </svg>
        </div>
        <div className="space-y-1">
          <p className={`text-lg font-semibold ${data.internetReachable ? "text-labos-green" : "text-red-400"}`}>
            {data.internetReachable ? "Reachable" : "Unreachable"}
          </p>
          <p className="text-sm text-muted">
            Ping latency: <span className="font-mono">{data.pingLatencyMs >= 0 ? `${data.pingLatencyMs} ms` : "N/A"}</span>
          </p>
        </div>
        <button
          className="btn-secondary text-xs ml-auto"
          onClick={onTestPing}
          disabled={testing}
        >
          {testing ? "Testing..." : "Test Ping"}
        </button>
      </div>
    </div>
  );
}

export default function NetworkPanel({ connected }: Props) {
  const { data: wifi, loading: wLoad, refresh: refreshWifi } = usePolling(fetchWifiStatus, 10000, connected);
  const { data: bt, loading: bLoad, refresh: refreshBt } = usePolling(fetchBluetoothStatus, 10000, connected);
  const { data: conn, loading: cLoad, refresh: refreshConn } = usePolling(fetchConnectivity, 10000, connected);
  const { data: hostBt, loading: hostBtLoading, refresh: refreshHostBt } = usePolling(fetchHostBluetoothStatus, 15000, true);
  const [testing, setTesting] = useState(false);
  const [hostBusy, setHostBusy] = useState("");
  const [hostMessage, setHostMessage] = useState("");

  async function handleTestPing() {
    setTesting(true);
    try {
      await fetchConnectivity();
      refreshConn();
    } catch {}
    setTesting(false);
  }

  function handleRefreshAll() {
    refreshHostBt();
    refreshWifi();
    refreshBt();
    refreshConn();
  }

  async function handleOpenHostBluetoothSettings() {
    setHostBusy("settings");
    setHostMessage("");
    try {
      const result = await openHostBluetoothSettings();
      setHostMessage(result.message);
      refreshHostBt();
    } catch (error: any) {
      setHostMessage(error?.message || "Could not open host Bluetooth settings");
    }
    setHostBusy("");
  }

  async function handleScanHostBluetooth() {
    setHostBusy("scan");
    setHostMessage("");
    try {
      const result = await scanHostBluetooth();
      setHostMessage(result.message);
      refreshHostBt();
    } catch (error: any) {
      setHostMessage(error?.message || "Could not start host Bluetooth pairing");
    }
    setHostBusy("");
  }

  return (
    <div className="space-y-4">
      {/* Quick actions */}
      <div className="flex justify-end">
        <button className="btn-secondary text-sm" onClick={handleRefreshAll}>
          Refresh All
        </button>
      </div>

      <HostBluetoothSection
        data={hostBt}
        loading={hostBtLoading}
        busy={hostBusy}
        message={hostMessage}
        onOpenSettings={handleOpenHostBluetoothSettings}
        onScan={handleScanHostBluetooth}
        onRefresh={refreshHostBt}
      />

      {!connected && <ConnectionRequiredState message="Connect to glasses to view on-device WiFi, Bluetooth, and connectivity info" />}

      {connected && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <WifiSection data={wifi} loading={wLoad} />
            <BluetoothSection data={bt} loading={bLoad} />
          </div>

          <ConnectivitySection data={conn} loading={cLoad} onTestPing={handleTestPing} testing={testing} />
        </>
      )}
    </div>
  );
}
