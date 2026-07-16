import { type ConnectionMode } from "../../api";

export function ConnectionStatus({
  isConnected,
  mode,
  label,
  needsPicker,
}: {
  isConnected: boolean;
  mode: ConnectionMode;
  label: string;
  needsPicker: boolean;
}) {
  return (
    <div className="flex h-8 min-w-0 flex-1 items-center gap-2 sm:h-9 md:max-w-[16rem] xl:max-w-[24rem]">
      <div className={`h-2.5 w-2.5 shrink-0 rounded-full ${isConnected ? "bg-good-fg" : "bg-bad-fg"}`} />
      <span className="min-w-0 truncate text-xs font-medium sm:text-sm">
        {isConnected
          ? (
              <>
                <span className="hidden xl:inline">Connected{mode === "wifi" ? " (WiFi)" : ""}: </span>
                {label || "connected"}
              </>
            )
          : needsPicker
            ? "Multiple devices - select one:"
            : "Disconnected"}
      </span>
    </div>
  );
}
