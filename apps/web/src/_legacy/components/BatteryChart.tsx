import { useState, useCallback } from "react";
import { usePolling } from "../hooks/usePolling";
import { batteryHistory, batteryHistoryClear, type BatteryHistory } from "../api";
import { ConfirmDialog } from "./ui";

interface Props {
  connected: boolean;
}

const RANGES: { label: string; hours: number }[] = [
  { label: "1h", hours: 1 },
  { label: "6h", hours: 6 },
  { label: "24h", hours: 24 },
  { label: "7d", hours: 168 },
];

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function Chart({ data }: { data: BatteryHistory }) {
  const points = data.history;
  if (points.length < 2) {
    return <div className="flex items-center justify-center h-[250px] text-muted">Not enough data to chart</div>;
  }

  const W = 800;
  const H = 250;
  const PAD = { top: 10, right: 10, bottom: 30, left: 40 };
  const cw = W - PAD.left - PAD.right;
  const ch = H - PAD.top - PAD.bottom;

  const minT = points[0].timestamp;
  const maxT = points[points.length - 1].timestamp;
  const tRange = maxT - minT || 1;

  const toX = (t: number) => PAD.left + ((t - minT) / tRange) * cw;
  const toY = (p: number) => PAD.top + ch - (p / 100) * ch;

  const polyline = points.map((p) => `${toX(p.timestamp)},${toY(p.percentage)}`).join(" ");
  const areaPath = `M${toX(points[0].timestamp)},${toY(0)} ` +
    points.map((p) => `L${toX(p.timestamp)},${toY(p.percentage)}`).join(" ") +
    ` L${toX(points[points.length - 1].timestamp)},${toY(0)} Z`;

  const gridLines = [0, 25, 50, 75, 100];
  const timeLabels: { x: number; label: string }[] = [];
  const step = Math.max(1, Math.floor(points.length / 6));
  for (let i = 0; i < points.length; i += step) {
    timeLabels.push({ x: toX(points[i].timestamp), label: formatTime(points[i].timestamp) });
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="xMidYMid meet">
      {/* Grid lines */}
      {gridLines.map((pct) => (
        <g key={pct}>
          <line x1={PAD.left} y1={toY(pct)} x2={W - PAD.right} y2={toY(pct)} stroke="#374151" strokeWidth="1" />
          <text x={PAD.left - 5} y={toY(pct) + 4} textAnchor="end" fill="#6b7280" fontSize="10">{pct}%</text>
        </g>
      ))}
      {/* Time labels */}
      {timeLabels.map((tl, i) => (
        <text key={i} x={tl.x} y={H - 5} textAnchor="middle" fill="#6b7280" fontSize="10">{tl.label}</text>
      ))}
      {/* Area fill */}
      <path d={areaPath} fill="#22c55e" fillOpacity="0.1" />
      {/* Line */}
      <polyline points={polyline} fill="none" stroke="#22c55e" strokeWidth="2" />
    </svg>
  );
}

export default function BatteryChart({ connected }: Props) {
  const [hours, setHours] = useState(24);
  const [clearOpen, setClearOpen] = useState(false);
  const fetcher = useCallback(() => batteryHistory(hours), [hours]);
  const { data, refresh, loading } = usePolling(fetcher, 30000, connected);

  async function confirmClear() {
    setClearOpen(false);
    try {
      await batteryHistoryClear();
      refresh();
    } catch {}
  }

  if (!connected) {
    return <div className="flex items-center justify-center h-64 text-muted">Connect to glasses first</div>;
  }

  return (
    <div className="space-y-4">
      <ConfirmDialog
        open={clearOpen}
        onClose={() => setClearOpen(false)}
        title="Clear battery history?"
        description="All stored battery samples will be removed from the dashboard."
        destructive
        confirmText="Clear"
        onConfirm={confirmClear}
      />
      <div className="card">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="text-accentText font-semibold">Battery History</h2>
          <div className="flex gap-1">
            {RANGES.map((r) => (
              <button
                key={r.hours}
                className={`px-3 py-1 text-xs rounded ${
                  hours === r.hours ? "bg-labos-green text-black" : "bg-border/25 text-muted hover:bg-border/35"
                }`}
                onClick={() => setHours(r.hours)}
              >
                {r.label}
              </button>
            ))}
          </div>
          <div className="ml-auto flex gap-2">
            <button className="btn-secondary text-sm" onClick={refresh}>Refresh</button>
            <button className="btn-danger text-sm" onClick={() => setClearOpen(true)}>Clear</button>
          </div>
        </div>
      </div>

      <div className="card">
        {loading && !data ? (
          <div className="flex items-center justify-center h-[250px] text-muted">Loading...</div>
        ) : data ? (
          <>
            <Chart data={data} />
            <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-muted">Current</p>
                <p className="text-labos-green text-lg font-semibold">{data.currentPercentage}%</p>
                <p className="text-muted text-xs">{data.currentVoltage}mV</p>
              </div>
              <div>
                <p className="text-muted">Samples</p>
                <p className="text-fg text-lg font-semibold">{data.history.length}</p>
              </div>
              <div>
                <p className="text-muted">Min/Max</p>
                <p className="text-fg text-lg font-semibold">
                  {data.history.length ? Math.min(...data.history.map((h) => h.percentage)) : "--"}% / {data.history.length ? Math.max(...data.history.map((h) => h.percentage)) : "--"}%
                </p>
              </div>
              <div>
                <p className="text-muted">Time Range</p>
                <p className="text-fg text-lg font-semibold">{hours}h</p>
              </div>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-[250px] text-muted">No data available</div>
        )}
      </div>
    </div>
  );
}
