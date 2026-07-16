import type { CameraCapabilities, ManualCameraParams } from "../../api";

/** AWB mode name → Camera2 constant mapping */
const AWB_MODES: Record<string, number> = {
  off: 0, auto: 1, incandescent: 2, fluorescent: 3,
  warm_fluorescent: 4, daylight: 5, cloudy: 6, twilight: 7, shade: 8,
};

/** Common shutter speed presets in nanoseconds */
const SHUTTER_PRESETS = [
  { label: "1/1000s", ns: 1_000_000 },
  { label: "1/500s", ns: 2_000_000 },
  { label: "1/250s", ns: 4_000_000 },
  { label: "1/125s", ns: 8_000_000 },
  { label: "1/60s", ns: 16_666_667 },
  { label: "1/30s", ns: 33_333_333 },
  { label: "1/15s", ns: 66_666_667 },
  { label: "1/8s", ns: 125_000_000 },
  { label: "1/4s", ns: 250_000_000 },
  { label: "1/2s", ns: 500_000_000 },
  { label: "1s", ns: 1_000_000_000 },
];

export function ManualControls({
  caps,
  params,
  onChange,
  onApply,
  onLoadCaps,
}: {
  caps: CameraCapabilities | null;
  params: ManualCameraParams;
  onChange: (updates: Partial<ManualCameraParams>) => void;
  onApply: () => void;
  onLoadCaps: () => void;
}) {
  if (!caps) {
    return (
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted">Load sensor capabilities to enable manual controls</span>
        <button className="btn-secondary text-xs" onClick={onLoadCaps}>Load Capabilities</button>
      </div>
    );
  }

  const isManual = params.manual_mode ?? false;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-sm text-muted">Manual Mode</span>
          <p className="text-xs text-subtle">Override auto exposure, ISO, white balance, and focus</p>
        </div>
        <button
          className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
            isManual ? "bg-labos-green text-black" : "bg-border/30 text-muted"
          }`}
          onClick={() => {
            onChange({ manual_mode: !isManual });
            setTimeout(onApply, 50);
          }}
        >
          {isManual ? "MANUAL" : "AUTO"}
        </button>
      </div>

      <div>
        <div className="flex items-baseline justify-between mb-1">
          <label className="text-xs text-muted">Exposure Compensation</label>
          <span className="text-xs font-mono text-muted">
            {params.ae_compensation ?? 0} EV
          </span>
        </div>
        <input
          type="range"
          className="w-full accent-yellow-400"
          min={caps.ae_comp_min ?? -4}
          max={caps.ae_comp_max ?? 4}
          step={1}
          value={params.ae_compensation ?? 0}
          onChange={(e) => onChange({ ae_compensation: Number(e.target.value) })}
          onMouseUp={onApply}
          onTouchEnd={onApply}
        />
        <div className="flex justify-between text-[10px] text-subtle">
          <span>{caps.ae_comp_min ?? -4} EV</span>
          <span>0</span>
          <span>+{caps.ae_comp_max ?? 4} EV</span>
        </div>
      </div>

      {isManual && (
        <>
          <div>
            <div className="flex items-baseline justify-between mb-1">
              <label className="text-xs text-muted">Shutter Speed</label>
              <span className="text-xs font-mono text-muted">
                {params.exposure_ns
                  ? params.exposure_ns >= 1_000_000_000
                    ? `${(params.exposure_ns / 1_000_000_000).toFixed(1)}s`
                    : `1/${Math.round(1_000_000_000 / params.exposure_ns)}s`
                  : "auto"}
              </span>
            </div>
            <div className="flex flex-wrap gap-1">
              {SHUTTER_PRESETS.filter(
                (p) =>
                  (!caps.exposure_ns_min || p.ns >= caps.exposure_ns_min) &&
                  (!caps.exposure_ns_max || p.ns <= caps.exposure_ns_max)
              ).map((p) => (
                <button
                  key={p.ns}
                  className={`px-2 py-0.5 rounded text-xs font-mono transition-colors ${
                    params.exposure_ns === p.ns
                      ? "bg-labos-green text-black"
                      : "bg-surface-2 border border-border/20 text-muted hover:border-highlight-border/40"
                  }`}
                  onClick={() => { onChange({ exposure_ns: p.ns }); onApply(); }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-baseline justify-between mb-1">
              <label className="text-xs text-muted">ISO Sensitivity</label>
              <span className="text-xs font-mono text-muted">
                {params.iso ?? "auto"}
              </span>
            </div>
            <input
              type="range"
              className="w-full accent-blue-400"
              min={caps.iso_min ?? 50}
              max={caps.iso_max ?? 3200}
              step={50}
              value={params.iso ?? caps.iso_min ?? 100}
              onChange={(e) => onChange({ iso: Number(e.target.value) })}
              onMouseUp={onApply}
              onTouchEnd={onApply}
            />
            <div className="flex justify-between text-[10px] text-subtle">
              <span>ISO {caps.iso_min ?? 50}</span>
              <span>ISO {caps.iso_max ?? 3200}</span>
            </div>
          </div>

          <div>
            <label className="text-xs text-muted block mb-1">White Balance</label>
            <div className="flex flex-wrap gap-1">
              {(caps.awb_modes ?? ["auto"]).map((mode) => (
                <button
                  key={mode}
                  className={`px-2 py-0.5 rounded text-xs transition-colors capitalize ${
                    (params.awb_mode ?? 1) === (AWB_MODES[mode] ?? 1)
                      ? "bg-labos-green text-black"
                      : "bg-surface-2 border border-border/20 text-muted hover:border-highlight-border/40"
                  }`}
                  onClick={() => { onChange({ awb_mode: AWB_MODES[mode] ?? 1 }); onApply(); }}
                >
                  {mode.replace("_", " ")}
                </button>
              ))}
            </div>
          </div>

          {(caps.focus_distance_max_diopters ?? 0) > 0 && (
            <div>
              <div className="flex items-baseline justify-between mb-1">
                <label className="text-xs text-muted">Focus Distance</label>
                <span className="text-xs font-mono text-muted">
                  {params.focus_distance != null
                    ? params.focus_distance === 0
                      ? "Infinity"
                      : `${(100 / params.focus_distance).toFixed(0)}cm`
                    : "auto"}
                </span>
              </div>
              <input
                type="range"
                className="w-full accent-purple-400"
                min={0}
                max={caps.focus_distance_max_diopters ?? 10}
                step={0.1}
                value={params.focus_distance ?? 0}
                onChange={(e) => onChange({ focus_distance: Number(e.target.value) })}
                onMouseUp={onApply}
                onTouchEnd={onApply}
              />
              <div className="flex justify-between text-[10px] text-subtle">
                <span>Infinity</span>
                <span>
                  {((caps.focus_distance_max_diopters ?? 10) > 0)
                    ? `${(100 / (caps.focus_distance_max_diopters ?? 10)).toFixed(0)}cm`
                    : "near"}
                </span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

