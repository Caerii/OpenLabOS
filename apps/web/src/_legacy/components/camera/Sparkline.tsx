const HISTORY_SIZE = 60; // keep in sync with CameraPreview

export function pushHistory<T>(arr: T[], val: T): T[] {
  const next = [...arr, val];
  return next.length > HISTORY_SIZE ? next.slice(-HISTORY_SIZE) : next;
}

export interface SparklineProps {
  data: number[];
  label: string;
  unit: string;
  color: string;
  min?: number;
  max?: number;
  height?: number;
}

/**
 * Lightweight SVG sparkline with filled area, live value, and axis labels.
 */
export function Sparkline({ data, label, unit, color, min: forceMin, max: forceMax, height = 100 }: SparklineProps) {
  const W = 300;
  const H = height;
  const PAD = { top: 6, right: 8, bottom: 18, left: 36 };
  const cw = W - PAD.left - PAD.right;
  const ch = H - PAD.top - PAD.bottom;

  if (data.length < 2) {
    return (
      <div className="flex items-center justify-center text-subtle text-xs" style={{ height: H }}>
        Collecting {label} data...
      </div>
    );
  }

  const rawMin = Math.min(...data);
  const rawMax = Math.max(...data);
  const dataMin = forceMin ?? Math.floor(rawMin * 0.9);
  const dataMax = forceMax ?? (Math.ceil(rawMax * 1.1) || 1);
  const range = (dataMax - dataMin) || 1;

  const toX = (i: number) => PAD.left + (i / (data.length - 1)) * cw;
  const toY = (v: number) => PAD.top + ch - ((v - dataMin) / range) * ch;

  const polyline = data.map((v, i) => `${toX(i)},${toY(v)}`).join(" ");
  const areaPath =
    `M${toX(0)},${toY(dataMin)} ` +
    data.map((v, i) => `L${toX(i)},${toY(v)}`).join(" ") +
    ` L${toX(data.length - 1)},${toY(dataMin)} Z`;

  const current = data[data.length - 1];
  const avg = data.reduce((a, b) => a + b, 0) / data.length;

  const gridValues = [dataMin, dataMin + range / 2, dataMax];

  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-xs text-muted">{label}</span>
        <div className="flex items-baseline gap-2">
          <span className="text-xs text-subtle">avg {avg.toFixed(1)}{unit}</span>
          <span className="text-sm font-mono font-bold" style={{ color }}>
            {current.toFixed(1)}{unit}
          </span>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="xMidYMid meet">
        {gridValues.map((v, i) => (
          <g key={i}>
            <line
              x1={PAD.left}
              y1={toY(v)}
              x2={W - PAD.right}
              y2={toY(v)}
              stroke="rgb(var(--border) / 0.35)"
              strokeWidth="0.5"
            />
            <text
              x={PAD.left - 4}
              y={toY(v) + 3}
              textAnchor="end"
              fill="rgb(var(--subtle))"
              fontSize="8"
            >
              {v.toFixed(0)}
            </text>
          </g>
        ))}
        <text x={PAD.left} y={H - 3} textAnchor="start" fill="rgb(var(--subtle))" fontSize="7">
          {Math.floor(data.length * 2)}s ago
        </text>
        <text x={W - PAD.right} y={H - 3} textAnchor="end" fill="rgb(var(--subtle))" fontSize="7">now</text>
        <path d={areaPath} fill={color} fillOpacity="0.12" />
        <polyline points={polyline} fill="none" stroke={color} strokeWidth="1.5" />
        <circle cx={toX(data.length - 1)} cy={toY(current)} r="2.5" fill={color} />
      </svg>
    </div>
  );
}

