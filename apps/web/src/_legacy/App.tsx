import { useState, type ReactNode } from "react";
import { Navigate, Outlet, Route, Routes, useOutletContext, useParams } from "react-router-dom";
import { usePolling } from "./hooks/usePolling";
import {
  deviceStatus,
  kitchenFeatures,
  systemReboot,
  systemScreenshot,
  type LabOSFeatureExperience,
  type LabOSFeatureFlags,
} from "./api";
import Sidebar, { MobileNav } from "./components/ui/Sidebar";
import { ConfirmDialog, LoadingState, Modal, TopBar } from "./components/ui/index";
import DevPanel from "./components/ui/DevPanel";
import Dashboard from "./components/Dashboard";
import HardwareMonitor from "./components/HardwareMonitor";
import McuMonitor from "./components/McuMonitor";
import FileExplorer from "./components/FileExplorer";
import AppManager from "./components/AppManager";
import NetworkPanel from "./components/NetworkPanel";
import LabosControl from "./components/LabosControl";
import ShellLogcat from "./components/ShellLogcat";
import MentraRestore from "./components/MentraRestore";
import SettingsPanel from "./components/SettingsPanel";
import OtaUpdate from "./components/OtaUpdate";
import McuConsole from "./components/McuConsole";
import CameraPreview from "./components/CameraPreview";
import BatteryChart from "./components/BatteryChart";
import AudioTest from "./components/AudioTest";
import ButtonMapper from "./components/ButtonMapper";
import VisionPanel from "./components/VisionPanel";
import LiveCopilotPanel from "./components/LiveCopilotPanel";
import KitchenPanel from "./components/KitchenPanel";
import LabPanel from "./components/LabPanel";
import LabClawPanel from "./components/LabClawPanel";
import DesktopRuntimeCard from "./components/DesktopRuntimeCard";
import { useTheme } from "./theme/ThemeProvider";
import { THEME_CSS_VARS } from "./theme/themeVars";
import {
  advancedLabOSFeaturesEnabled,
  defaultTabForFeatures,
  hrefForSidebarNavId,
  isTabVisibleForFeatures,
  navGroupsForFeatures,
  pathForTab,
  tabFromPathSegment,
  type Tab,
} from "./navPaths";
import { deriveLabOSExperience } from "./lib/labosExperience";

type ShellOutletContext = {
  connected: boolean;
  featureFlags: LabOSFeatureFlags | null;
  featureExperience: LabOSFeatureExperience | null;
  featureFlagsLoaded: boolean;
};

function RoutedPanel() {
  const { connected, featureFlags, featureExperience, featureFlagsLoaded } = useOutletContext<ShellOutletContext>();
  const { page } = useParams<{ page: string }>();
  const tab = tabFromPathSegment(page);
  if (!tab) return <Navigate to={pathForTab(defaultTabForFeatures(featureFlags, featureExperience))} replace />;
  if (!featureFlagsLoaded && !isTabVisibleForFeatures(tab, null, null)) {
    return <LoadingState className="py-16" />;
  }
  if (!isTabVisibleForFeatures(tab, featureFlags, featureExperience)) {
    return <Navigate to={pathForTab(defaultTabForFeatures(featureFlags, featureExperience))} replace />;
  }

  const panelMap: Record<Tab, ReactNode> = {
    dashboard: (
      <div className="space-y-6">
        <DesktopRuntimeCard />
        <Dashboard connected={connected} />
        <HardwareMonitor connected={connected} />
      </div>
    ),
    mcu: <McuMonitor connected={connected} />,
    files: <FileExplorer connected={connected} featureFlags={featureFlags} featureExperience={featureExperience} />,
    apps: <AppManager connected={connected} />,
    network: <NetworkPanel connected={connected} />,
    settings: <SettingsPanel connected={connected} />,
    shell: <ShellLogcat connected={connected} />,
    labos: <LabosControl connected={connected} />,
    restore: <MentraRestore connected={connected} />,
    ota: <OtaUpdate connected={connected} />,
    console: <McuConsole connected={connected} />,
    preview: <CameraPreview connected={connected} featureFlags={featureFlags} featureExperience={featureExperience} />,
    battery: <BatteryChart connected={connected} />,
    audio: <AudioTest connected={connected} />,
    buttons: <ButtonMapper connected={connected} />,
    vision: <VisionPanel connected={connected} />,
    copilot: <LiveCopilotPanel connected={connected} />,
    kitchen: <KitchenPanel connected={connected} />,
    lab: <LabPanel connected={connected} />,
    labclaw: <LabClawPanel connected={connected} />,
  };

  return panelMap[tab];
}

function IndexRedirect() {
  const { featureFlags, featureExperience, featureFlagsLoaded } = useOutletContext<ShellOutletContext>();
  if (!featureFlagsLoaded) return <LoadingState className="py-16" />;
  return <Navigate to={pathForTab(defaultTabForFeatures(featureFlags, featureExperience))} replace />;
}

function AppShell() {
  const { theme } = useTheme();
  const { data: status, refresh: refreshStatus } = usePolling(deviceStatus, 5000);
  const { data: featureData } = usePolling(kitchenFeatures, 30000);
  const connected = status?.connected ?? false;
  const featureFlags = featureData?.effectiveFlags ?? featureData?.flags ?? null;
  const featureExperience = featureData?.experience ?? null;
  const featureFlagsLoaded = !!featureData;
  const navGroups = navGroupsForFeatures(featureFlags, featureExperience);
  const experience = deriveLabOSExperience(featureFlags, featureExperience);
  const showDevTools = experience.surfaces.engineeringDevTools;
  const showMaintenance = experience.surfaces.engineeringMaintenance;
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [devPanelOpen, setDevPanelOpen] = useState(false);
  const [rebootOpen, setRebootOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return window.localStorage.getItem("labos.sidebarCollapsed") === "true";
    } catch {
      return false;
    }
  });

  async function handleScreenshot() {
    try {
      const url = await systemScreenshot();
      setScreenshotUrl(url);
    } catch {}
  }

  async function confirmReboot() {
    setRebootOpen(false);
    try {
      await systemReboot();
    } catch {}
  }

  function toggleSidebarCollapsed() {
    setSidebarCollapsed((value) => {
      const next = !value;
      try {
        window.localStorage.setItem("labos.sidebarCollapsed", String(next));
      } catch {}
      return next;
    });
  }

  const shellBg = `rgb(${THEME_CSS_VARS[theme]["--surface-0"].replace(/\s+/g, ", ")})`;

  return (
    <div className="flex min-h-screen bg-surface-0 text-fg" style={{ backgroundColor: shellBg }}>
      <Sidebar
        groups={navGroups}
        hrefForNavId={hrefForSidebarNavId}
        connected={connected}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={toggleSidebarCollapsed}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <TopBar
          connected={connected}
          deviceIp={status?.device || status?.ip}
          devices={status?.devices}
          targetDevice={status?.targetDevice}
          onRefresh={refreshStatus}
          onOpenDev={() => setDevPanelOpen(true)}
          onScreenshot={handleScreenshot}
          onReboot={() => setRebootOpen(true)}
          showDeveloperTools={showDevTools}
          showMaintenanceActions={showMaintenance}
        />

        <main className="flex-1 p-3 pb-24 sm:p-5 sm:pb-24 md:p-6 md:pb-6 animate-fade-in">
          <div className="max-w-[1400px] mx-auto">
            <Outlet context={{ connected, featureFlags, featureExperience, featureFlagsLoaded } as ShellOutletContext} />
          </div>
        </main>
      </div>
      <MobileNav groups={navGroups} hrefForNavId={hrefForSidebarNavId} />

      {showDevTools && <DevPanel open={devPanelOpen} onClose={() => setDevPanelOpen(false)} />}

      <ConfirmDialog
        open={rebootOpen}
        onClose={() => setRebootOpen(false)}
        title="Reboot glasses?"
        description="The device will restart. Unsaved work on the glasses may be lost."
        destructive
        confirmText="Reboot"
        onConfirm={confirmReboot}
      />

      <Modal
        open={!!screenshotUrl}
        onClose={() => {
          if (screenshotUrl) URL.revokeObjectURL(screenshotUrl);
          setScreenshotUrl(null);
        }}
      >
        {screenshotUrl ? (
          <div>
            <img
              src={screenshotUrl}
              alt="Screenshot"
              className="max-h-[80vh] rounded-[var(--labos-radius-xl)] border border-border/10 shadow-[var(--labos-shadow-raise)]"
            />
            <div className="text-center mt-4 flex items-center justify-center gap-4">
              <a
                href={screenshotUrl}
                download="screenshot.png"
                className="text-accentText text-sm font-medium hover:text-accentText/80 transition-colors"
              >
                Download
              </a>
              <button
                type="button"
                className="text-subtle text-sm hover:text-fg transition-colors"
                onClick={() => {
                  if (screenshotUrl) URL.revokeObjectURL(screenshotUrl);
                  setScreenshotUrl(null);
                }}
              >
                Close
              </button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<IndexRedirect />} />
        <Route path=":page" element={<RoutedPanel />} />
      </Route>
      <Route path="*" element={<Navigate to=".." replace />} />
    </Routes>
  );
}
