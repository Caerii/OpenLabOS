import type { StreamConfig } from "../../api";

const RESOLUTION_PRESETS = [
  { label: "320x240", w: 320, h: 240 },
  { label: "640x480", w: 640, h: 480 },
  { label: "800x600", w: 800, h: 600 },
  { label: "1280x720", w: 1280, h: 720 },
  { label: "1920x1080", w: 1920, h: 1080 },
];

export function StreamControls({
  config,
  onChange,
  onApply,
  dirty,
  applying,
}: {
  config: StreamConfig;
  onChange: (updates: Partial<StreamConfig>) => void;
  onApply: () => void;
  dirty: boolean;
  applying: boolean;
}) {
  const resLabel = `${config.stream_width}x${config.stream_height}`;
  const isPreset = RESOLUTION_PRESETS.some((p) => p.label === resLabel);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <div>
        <label className="text-xs text-muted block mb-1">Resolution</label>
        <select
          className="w-full bg-surface-2 border border-border/20 rounded px-2 py-1.5 text-sm font-mono text-fg focus:border-highlight-border/50 focus:outline-none"
          value={isPreset ? resLabel : "custom"}
          onChange={(e) => {
            const preset = RESOLUTION_PRESETS.find((p) => p.label === e.target.value);
            if (preset) onChange({ stream_width: preset.w, stream_height: preset.h });
          }}
        >
          {RESOLUTION_PRESETS.map((p) => (
            <option key={p.label} value={p.label}>{p.label}</option>
          ))}
          {!isPreset && <option value="custom">{resLabel} (custom)</option>}
        </select>
      </div>

      <div>
        <label className="text-xs text-muted block mb-1">Target FPS</label>
        <select
          className="w-full bg-surface-2 border border-border/20 rounded px-2 py-1.5 text-sm font-mono text-fg focus:border-highlight-border/50 focus:outline-none"
          value={config.stream_fps}
          onChange={(e) => onChange({ stream_fps: Number(e.target.value) })}
        >
          {[5, 10, 15, 20, 24, 30].map((fps) => (
            <option key={fps} value={fps}>{fps} fps</option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-xs text-muted block mb-1">
          Quality: {config.stream_jpeg_quality}%
        </label>
        <input
          type="range"
          className="w-full accent-labos-green"
          min={10}
          max={100}
          step={5}
          value={config.stream_jpeg_quality}
          onChange={(e) => onChange({ stream_jpeg_quality: Number(e.target.value) })}
        />
      </div>

      <div className="flex items-end">
        <button
          className={`w-full text-sm py-1.5 rounded font-medium transition-colors ${
            dirty
              ? "bg-labos-green text-black hover:bg-labos-green/90"
              : "bg-border/30 text-muted cursor-default"
          }`}
          onClick={onApply}
          disabled={!dirty || applying}
        >
          {applying ? "Applying..." : dirty ? "Apply" : "No changes"}
        </button>
      </div>
    </div>
  );
}

