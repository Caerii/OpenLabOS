import { usePolling } from "../hooks/usePolling";
import {
  fetchBatteryDetails,
  fetchMemoryInfo,
  fetchCpuInfo,
  fetchStorageInfo,
  fetchThermalInfo,
  type BatteryDetails,
  type MemoryInfo,
  type CpuInfo,
  type StorageInfo,
  type ThermalInfo,
} from "../api";
import { ConnectionRequiredState, LoadingState, ProgressBar } from "./ui";

interface Props {
  connected: boolean;
}

function batteryColor(level: number): string {
  if (level > 50) return "text-labos-green";
  if (level > 20) return "text-yellow-400";
  return "text-red-400";
}

function batteryBarColor(level: number): string {
  if (level > 50) return "bg-labos-green";
  if (level > 20) return "bg-yellow-400";
  return "bg-red-400";
}

function thermalColor(temp: number): string {
  if (temp < 40) return "text-labos-green";
  if (temp < 60) return "text-yellow-400";
  return "text-red-400";
}

function thermalBg(temp: number): string {
  if (temp < 40) return "bg-labos-green/20";
  if (temp < 60) return "bg-yellow-500/20";
  return "bg-red-500/20";
}

function formatMB(mb: number | undefined | null): string {
  if (mb == null || isNaN(mb)) return "N/A";
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb.toFixed(0)} MB`;
}

function BatterySection({ data }: { data: BatteryDetails }) {
  const level = data.level ?? 0;
  return (
    <div className="card">
      <h3 className="text-accentText font-semibold mb-4">Battery</h3>
      <div className="flex items-center gap-6">
        {/* Circular gauge */}
        <div className="relative w-28 h-28 flex-shrink-0">
          <svg className="w-28 h-28 -rotate-90" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="42" fill="none" stroke="#1a2e22" strokeWidth="8" />
            <circle
              cx="50" cy="50" r="42" fill="none"
              stroke={level > 50 ? "#00FF88" : level > 20 ? "#facc15" : "#f87171"}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={`${level * 2.64} 264`}
              className="transition-all duration-700"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className={`text-2xl font-bold font-mono ${batteryColor(level)}`}>
              {level}%
            </span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm flex-1">
          <div>
            <span className="text-muted">Status</span>
            <p className="font-mono">{data.status || "Unknown"}</p>
          </div>
          <div>
            <span className="text-muted">Health</span>
            <p className="font-mono">{data.health || "Unknown"}</p>
          </div>
          <div>
            <span className="text-muted">Temperature</span>
            <p className="font-mono">{data.temperature != null ? `${data.temperature}\u00B0C` : "N/A"}</p>
          </div>
          <div>
            <span className="text-muted">Voltage</span>
            <p className="font-mono">{data.voltage != null ? `${data.voltage} mV` : "N/A"}</p>
          </div>
          <div>
            <span className="text-muted">Technology</span>
            <p className="font-mono">{data.technology || "N/A"}</p>
          </div>
        </div>
      </div>
      <div className="mt-4">
        <ProgressBar value={level} barClassName={batteryBarColor(level)} className="h-2.5" />
      </div>
    </div>
  );
}

function MemorySection({ data }: { data: MemoryInfo }) {
  const usedPercent = data.totalMB > 0 ? (data.usedMB / data.totalMB) * 100 : 0;
  return (
    <div className="card">
      <h3 className="text-accentText font-semibold mb-3">Memory</h3>
      <div className="mb-2 flex justify-between text-sm">
        <span className="text-muted">Used: {formatMB(data.usedMB)}</span>
        <span className="text-muted">Total: {formatMB(data.totalMB)}</span>
      </div>
      <ProgressBar
        value={usedPercent}
        barClassName={usedPercent > 90 ? "bg-red-400" : usedPercent > 70 ? "bg-yellow-400" : "bg-labos-green"}
        className="h-2.5"
      />
      <div className="grid grid-cols-3 gap-3 mt-3 text-sm">
        <div>
          <span className="text-muted">Free</span>
          <p className="font-mono">{formatMB(data.freeMB)}</p>
        </div>
        <div>
          <span className="text-muted">Cached</span>
          <p className="font-mono">{formatMB(data.cachedMB)}</p>
        </div>
        <div>
          <span className="text-muted">Buffers</span>
          <p className="font-mono">{formatMB(data.buffersMB)}</p>
        </div>
      </div>
    </div>
  );
}

function CpuSection({ data }: { data: CpuInfo }) {
  return (
    <div className="card">
      <h3 className="text-accentText font-semibold mb-3">CPU</h3>
      <div className="grid grid-cols-2 gap-3 text-sm mb-3">
        <div>
          <span className="text-muted">Model</span>
          <p className="font-mono text-xs truncate">{data.model || "N/A"}</p>
        </div>
        <div>
          <span className="text-muted">Cores</span>
          <p className="font-mono">{data.cores}</p>
        </div>
        <div>
          <span className="text-muted">Frequency</span>
          <p className="font-mono">{data.frequencyMHz} MHz</p>
        </div>
        <div>
          <span className="text-muted">Load</span>
          <p className="font-mono">{(data.loadPercent ?? 0).toFixed(1)}%</p>
        </div>
      </div>
      <ProgressBar
        value={data.loadPercent ?? 0}
        barClassName={(data.loadPercent ?? 0) > 90 ? "bg-red-400" : (data.loadPercent ?? 0) > 70 ? "bg-yellow-400" : "bg-labos-green"}
        className="h-2.5"
      />
    </div>
  );
}

function StorageSection({ data }: { data: StorageInfo }) {
  const dataPercent = data.data.totalMB > 0 ? (data.data.usedMB / data.data.totalMB) * 100 : 0;
  const sdPercent = data.sdcard.totalMB > 0 ? (data.sdcard.usedMB / data.sdcard.totalMB) * 100 : 0;
  return (
    <div className="card">
      <h3 className="text-accentText font-semibold mb-3">Storage</h3>
      <div className="space-y-4">
        <div>
          <div className="flex justify-between text-sm mb-1">
            <span className="text-muted">/data</span>
            <span className="text-subtle font-mono text-xs">
              {formatMB(data.data.usedMB)} / {formatMB(data.data.totalMB)}
            </span>
          </div>
          <ProgressBar value={dataPercent} barClassName={dataPercent > 90 ? "bg-red-400" : "bg-labos-green"} className="h-2.5" />
        </div>
        <div>
          <div className="flex justify-between text-sm mb-1">
            <span className="text-muted">/sdcard</span>
            <span className="text-subtle font-mono text-xs">
              {formatMB(data.sdcard.usedMB)} / {formatMB(data.sdcard.totalMB)}
            </span>
          </div>
          <ProgressBar value={sdPercent} barClassName={sdPercent > 90 ? "bg-red-400" : "bg-labos-green"} className="h-2.5" />
        </div>
      </div>
    </div>
  );
}

function ThermalSection({ data }: { data: ThermalInfo }) {
  return (
    <div className="card">
      <h3 className="text-accentText font-semibold mb-3">Thermal Zones</h3>
      {data.zones.length === 0 ? (
        <p className="text-muted text-sm">No thermal data available</p>
      ) : (
        <div className="space-y-2">
          {data.zones.map((zone) => (
            <div key={zone.name} className={`flex items-center justify-between px-3 py-2 rounded ${thermalBg(zone.temperature ?? 0)}`}>
              <span className="text-sm text-muted">{zone.name}</span>
              <span className={`font-mono text-sm font-medium ${thermalColor(zone.temperature ?? 0)}`}>
                {(zone.temperature ?? 0).toFixed(1)}{"\u00B0"}C
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function HardwareMonitor({ connected }: Props) {
  const { data: battery, loading: bLoad } = usePolling(fetchBatteryDetails, 5000, connected);
  const { data: memory, loading: mLoad } = usePolling(fetchMemoryInfo, 5000, connected);
  const { data: cpu, loading: cLoad } = usePolling(fetchCpuInfo, 5000, connected);
  const { data: storage, loading: sLoad } = usePolling(fetchStorageInfo, 5000, connected);
  const { data: thermal, loading: tLoad } = usePolling(fetchThermalInfo, 5000, connected);

  if (!connected) {
    return <ConnectionRequiredState message="Connect to glasses to view hardware info" />;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="md:col-span-2">
        {bLoad && !battery ? <LoadingState /> : battery ? <BatterySection data={battery} /> : null}
      </div>
      {mLoad && !memory ? <LoadingState /> : memory ? <MemorySection data={memory} /> : null}
      {cLoad && !cpu ? <LoadingState /> : cpu ? <CpuSection data={cpu} /> : null}
      {sLoad && !storage ? <LoadingState /> : storage ? <StorageSection data={storage} /> : null}
      {tLoad && !thermal ? <LoadingState /> : thermal ? <ThermalSection data={thermal} /> : null}
    </div>
  );
}
