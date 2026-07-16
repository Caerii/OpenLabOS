import { Btn, Icon, Input } from "../ui";
import { type AdbDevice, type ConnectionMode } from "../../api";

const ICON_CONNECT =
  "M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3";
const ICON_DISCONNECT =
  "M6 18 18 6M6 6l12 12";
const ICON_SCAN =
  "m21 21-4.35-4.35M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15ZM7.5 10.5a3 3 0 0 1 3-3m-5.25 3a5.25 5.25 0 0 1 5.25-5.25";

export function ConnectionControls({
  mode,
  onlineDevices,
  targetDevice,
  busy,
  scanning,
  ip,
  token,
  isConnected,
  onIpChange,
  onTokenChange,
  onSelectDevice,
  onConnect,
  onDisconnect,
  onScan,
}: {
  mode: ConnectionMode;
  onlineDevices: AdbDevice[];
  targetDevice?: string | null;
  busy: boolean;
  scanning: boolean;
  ip: string;
  token: string;
  isConnected: boolean;
  onIpChange: (v: string) => void;
  onTokenChange: (v: string) => void;
  onSelectDevice: (serial: string) => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onScan: () => void;
}) {
  return (
    <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto sm:shrink-0">
      {mode === "adb" && onlineDevices.length > 1 && (
        <select
          className="input min-w-0 flex-1 py-1 text-sm sm:w-40 sm:flex-none xl:w-56"
          value={targetDevice || ""}
          onChange={(e) => onSelectDevice(e.target.value)}
          disabled={busy}
        >
          <option value="" disabled>Select device...</option>
          {onlineDevices.map((d) => (
            <option key={d.serial} value={d.serial}>
              {d.serial} {d.model ? `(${d.model})` : ""} {d.product ? `— ${d.product}` : ""}
            </option>
          ))}
        </select>
      )}

      <Input
        sizing="sm"
        className="min-w-0 flex-1 sm:w-32 sm:flex-none lg:w-36 xl:w-44"
        placeholder="192.168.x.x"
        value={ip}
        onChange={(e) => onIpChange(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onConnect()}
      />

      {mode === "wifi" && (
        <Input
          sizing="sm"
          className="min-w-0 flex-1 sm:w-28 sm:flex-none xl:w-32"
          placeholder="API token"
          value={token}
          onChange={(e) => onTokenChange(e.target.value)}
        />
      )}

      {isConnected ? (
        <Btn variant="danger" size="sm" className="px-2 xl:px-3" onClick={onDisconnect} disabled={busy} title="Disconnect">
          <Icon d={ICON_DISCONNECT} size={14} />
          <span className="hidden xl:inline">Disconnect</span>
        </Btn>
      ) : (
        <Btn variant="primary" size="sm" className="px-2 xl:px-3" onClick={onConnect} disabled={busy || !ip.trim()} loading={busy} title="Connect">
          <Icon d={ICON_CONNECT} size={14} />
          <span className="hidden xl:inline">Connect</span>
        </Btn>
      )}

      {mode === "adb" && (
        <Btn
          variant="secondary"
          size="sm"
          className="px-2.5 xl:px-3"
          onClick={onScan}
          disabled={scanning}
          loading={scanning}
          title="Find glasses on the network"
          aria-label="Find glasses on the network"
        >
          {!scanning && <Icon d={ICON_SCAN} size={14} />}
          <span>{scanning ? "Finding" : "Find"}</span>
          <span className="hidden lg:inline"> glasses</span>
        </Btn>
      )}
    </div>
  );
}

