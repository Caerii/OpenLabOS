import { usePolling } from "../hooks/usePolling";
import { deviceInfo, labosStatus, labosActivate, labosDeactivate } from "../api";
import { useState } from "react";
import { Card, CardHeader, CardTitle, Btn, Badge, Stat, ProgressBar, Icon, EmptyState } from "./ui/index";

interface Props {
  connected: boolean;
}

export default function Dashboard({ connected }: Props) {
  const { data: info, loading: infoLoading } = usePolling(deviceInfo, 10000, connected);
  const { data: labos, refresh: refreshLabos } = usePolling(labosStatus, 10000, connected);
  const [toggling, setToggling] = useState(false);
  const [output, setOutput] = useState("");

  async function toggleDeviceOwner() {
    if (!labos) return;
    setToggling(true);
    setOutput("");
    try {
      const r = labos.isDeviceOwner ? await labosDeactivate() : await labosActivate();
      setOutput(r.output);
      refreshLabos();
    } catch (e: any) {
      setOutput(e.message);
    }
    setToggling(false);
  }

  if (!connected) {
    return (
      <Card className="py-16">
        <EmptyState
          icon={<Icon d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m9.07-4.28a4.5 4.5 0 0 0-1.242-7.244l4.5-4.5a4.5 4.5 0 0 1 6.364 6.364l-1.757 1.757" size={32} className="text-subtle" />}
          title="Connect to glasses to view dashboard"
          description="Use the connection bar above to connect via ADB or WiFi."
        />
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {/* Device Info */}
      <Card className="col-span-1 md:col-span-2">
        <CardHeader>
          <CardTitle
            icon={<Icon d="M10.5 1.5H8.25A2.25 2.25 0 0 0 6 3.75v16.5a2.25 2.25 0 0 0 2.25 2.25h7.5A2.25 2.25 0 0 0 18 20.25V3.75a2.25 2.25 0 0 0-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 15h3m-5.25 0H7.5m9-6h.008v.008H16.5v-.008Zm0 2.25h.008v.008H16.5v-.008Zm0 2.25h.008v.008H16.5v-.008Zm-2.25-4.5h.008v.008H14.25v-.008Zm0 2.25h.008v.008H14.25v-.008Zm0 2.25h.008v.008H14.25v-.008Zm-2.25-4.5h.008v.008H12v-.008Zm0 2.25h.008v.008H12v-.008Zm0 2.25h.008v.008H12v-.008Z" size={16} className="text-good-fg" />}
          >
            Device Info
          </CardTitle>
        </CardHeader>
        {infoLoading && !info ? (
          <p className="text-sm text-muted">Loading...</p>
        ) : info ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {([
              ["Model", info.model],
              ["Brand", info.brand],
              ["Android", info.androidVersion],
              ["SDK", info.sdkVersion],
              ["Serial", info.serial],
              ["IP", info.ipAddress],
              ["Uptime", info.uptime],
            ] as const).map(([label, val]) => (
              <div key={label} className="px-3 py-2 rounded-lg bg-border/10 border border-border/15">
                <span className="text-[11px] text-muted block mb-0.5">{label}</span>
                <p className="text-sm font-mono text-fg truncate">{val || "N/A"}</p>
              </div>
            ))}
          </div>
        ) : null}
      </Card>

      {/* Battery */}
      <Card>
        <CardHeader>
          <CardTitle
            icon={<Icon d="M21 10.5h.375c.621 0 1.125.504 1.125 1.125v2.25c0 .621-.504 1.125-1.125 1.125H21M3.75 18h15A2.25 2.25 0 0 0 21 15.75v-6a2.25 2.25 0 0 0-2.25-2.25h-15A2.25 2.25 0 0 0 1.5 9.75v6A2.25 2.25 0 0 0 3.75 18Z" size={16} className="text-good-fg" />}
          >
            Battery
          </CardTitle>
        </CardHeader>
        {info ? (
          <div className="text-center">
            <div className="text-4xl font-bold font-mono tabular-nums text-fg">
              {info.batteryLevel ? `${info.batteryLevel}%` : "N/A"}
            </div>
            <div className="text-xs text-muted mt-1 mb-4">{info.batteryStatus || ""}</div>
            <ProgressBar value={Number(info.batteryLevel) || 0} />
          </div>
        ) : (
          <p className="text-sm text-muted">Loading...</p>
        )}
      </Card>

      {/* LabOS Status */}
      <Card className="col-span-1 md:col-span-2 lg:col-span-3">
        <CardHeader>
          <CardTitle
            icon={<Icon d="M9.75 3.104v5.714a2.25 2.25 0 0 1-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 0 1 4.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082" size={16} className="text-good-fg" />}
          >
            LabOS Status
          </CardTitle>
        </CardHeader>
        {labos ? (
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted">Installed:</span>
              <Badge color={labos.isInstalled ? "green" : "red"}>
                {labos.isInstalled ? "Yes" : "No"}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted">Device Owner:</span>
              <Badge color={labos.isDeviceOwner ? "green" : "red"}>
                {labos.isDeviceOwner ? "Active" : "Inactive"}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted">Running:</span>
              <Badge color={labos.isRunning ? "green" : "yellow"}>
                {labos.isRunning ? "Yes" : "No"}
              </Badge>
            </div>
            <Btn
              variant={labos.isDeviceOwner ? "danger" : "primary"}
              size="sm"
              onClick={toggleDeviceOwner}
              loading={toggling}
            >
              {labos.isDeviceOwner ? "Deactivate Device Owner" : "Activate Device Owner"}
            </Btn>
          </div>
        ) : (
          <p className="text-sm text-muted">Loading...</p>
        )}
        {output && <pre className="mt-3 text-xs text-muted bg-border/10 p-3 rounded-lg overflow-x-auto font-mono border border-border/15">{output}</pre>}
      </Card>
    </div>
  );
}
