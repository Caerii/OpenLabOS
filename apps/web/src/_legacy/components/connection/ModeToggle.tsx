import { type ConnectionMode } from "../../api";

export function ModeToggle({
  mode,
  onChange,
}: {
  mode: ConnectionMode;
  onChange: (m: ConnectionMode) => void;
}) {
  return (
    <div className="flex h-8 shrink-0 items-center overflow-hidden rounded-md border border-border/20 bg-border/10 sm:h-9">
      <button
        className={`h-8 px-2.5 text-[11px] font-medium transition-colors sm:h-9 sm:px-3 sm:text-xs ${
          mode === "adb" ? "bg-highlight-bg/15 text-accentText" : "text-muted hover:text-fg"
        }`}
        onClick={() => onChange("adb")}
      >
        ADB
      </button>
      <button
        className={`h-8 px-2.5 text-[11px] font-medium transition-colors sm:h-9 sm:px-3 sm:text-xs ${
          mode === "wifi" ? "bg-highlight-bg/15 text-accentText" : "text-muted hover:text-fg"
        }`}
        onClick={() => onChange("wifi")}
      >
        WiFi
      </button>
    </div>
  );
}

