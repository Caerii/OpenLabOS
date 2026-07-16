import ConnectionBar from "../ConnectionBar";
import type { AdbDevice } from "../../api";
import { Btn, Icon } from "./index";
import { ThemeToggle } from "../../theme/ThemeToggle";
import { useTheme } from "../../theme/ThemeProvider";
import { THEME_CSS_VARS } from "../../theme/themeVars";

const ICON_DEV =
  "M6.75 7.5l3 2.25-3 2.25m3.75 0H15M3.75 4.5h16.5a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5H3.75a1.5 1.5 0 0 1-1.5-1.5V6a1.5 1.5 0 0 1 1.5-1.5Z";
const ICON_CAMERA =
  "M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z";
const ICON_REBOOT =
  "M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182";

export function TopBar({
  connected,
  deviceIp,
  devices,
  targetDevice,
  onRefresh,
  onOpenDev,
  onScreenshot,
  onReboot,
  showDeveloperTools = true,
  showMaintenanceActions = true,
}: {
  connected: boolean;
  deviceIp?: string;
  devices?: AdbDevice[];
  targetDevice?: string | null;
  onRefresh: () => void;
  onOpenDev: () => void;
  onScreenshot: () => void;
  onReboot: () => void;
  showDeveloperTools?: boolean;
  showMaintenanceActions?: boolean;
}) {
  const { theme } = useTheme();
  const barBg = `rgb(${THEME_CSS_VARS[theme]["--surface-0"].replace(/\s+/g, ", ")})`;

  return (
    <header
      className="labos-rail labos-rail--horizontal sticky top-0 z-30"
      style={{ backgroundColor: barBg }}
    >
      <div className="flex min-w-0 flex-col gap-1.5 px-3 py-1.5 sm:gap-2 sm:px-6 sm:py-2 md:flex-row md:items-center md:gap-3">
        <ConnectionBar
          connected={connected}
          deviceIp={deviceIp}
          devices={devices}
          targetDevice={targetDevice}
          onRefresh={onRefresh}
        />
        <div className="hidden items-center justify-end gap-1 shrink-0 md:flex">
          <ThemeToggle className="h-8 px-2" labelClassName="hidden 2xl:inline" />
          {showDeveloperTools && (
            <Btn variant="ghost" size="xs" className="h-8 px-2" onClick={onOpenDev} title="Developer tools">
              <Icon d={ICON_DEV} size={14} />
              <span className="hidden 2xl:inline">Dev</span>
            </Btn>
          )}
          <Btn variant="ghost" size="xs" className="h-8 px-2" onClick={onScreenshot} disabled={!connected} title="Screenshot">
            <Icon d={ICON_CAMERA} size={14} />
            <span className="hidden 2xl:inline">Screenshot</span>
          </Btn>
          {showMaintenanceActions && (
            <Btn variant="danger" size="xs" className="h-8 px-2" onClick={onReboot} disabled={!connected} title="Reboot">
              <Icon d={ICON_REBOOT} size={14} />
              <span className="hidden 2xl:inline">Reboot</span>
            </Btn>
          )}
        </div>
      </div>
    </header>
  );
}

