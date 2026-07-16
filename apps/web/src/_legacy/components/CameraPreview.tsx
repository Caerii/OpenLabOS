import LiveCoachPanel from "./kitchen/LiveCoachPanel";
import type { LabOSFeatureExperience, LabOSFeatureFlags } from "../api";
import { deriveLabOSExperience } from "../lib/labosExperience";
import { CameraPerformancePanel } from "./camera/CameraPerformancePanel";
import { CameraPreviewHeader } from "./camera/CameraPreviewHeader";
import { CameraStreamViewport } from "./camera/CameraStreamViewport";
import { ManualSensorCard } from "./camera/ManualSensorCard";
import { PreviewInfoFooter } from "./camera/PreviewInfoFooter";
import { useCameraPreview } from "./camera/useCameraPreview";

interface Props {
  connected: boolean;
  featureFlags: LabOSFeatureFlags | null;
  featureExperience: LabOSFeatureExperience | null;
}

export default function CameraPreview({ connected, featureFlags, featureExperience }: Props) {
  const preview = useCameraPreview(connected);
  const experience = deriveLabOSExperience(featureFlags, featureExperience);
  const showPreviewInstrument = experience.surfaces.engineeringPreviewInstrument;
  const showExperimentalCameraTools = showPreviewInstrument;

  if (!connected) {
    return <div className="flex items-center justify-center h-64 text-muted">Connect to glasses first</div>;
  }

  return (
    <div className="space-y-4">
      <CameraPreviewHeader
        advanced={showExperimentalCameraTools}
        applying={preview.applying}
        clientFps={preview.clientFps}
        configDirty={preview.configDirty}
        health={preview.health}
        latencyMs={preview.latencyMs}
        onApplyConfig={preview.applyConfig}
        onStart={preview.start}
        onStop={preview.stop}
        setShowPlots={preview.setShowPlots}
        setStreamConfig={preview.setStreamConfig}
        showPlots={preview.showPlots}
        status={preview.status}
        streamConfig={preview.streamConfig}
      />


      {showExperimentalCameraTools && (
        <ManualSensorCard
          caps={preview.caps}
          manualParams={preview.manualParams}
          onApplyManual={preview.applyManual}
          onLoadCaps={preview.loadCapabilities}
          setManualParams={preview.setManualParams}
          setShowManual={preview.setShowManual}
          showManual={preview.showManual}
        />
      )}

      {experience.surfaces.liveCoach && <LiveCoachPanel enabled={connected && preview.status === "streaming"} />}

      {preview.error && (
        <div className="text-sm px-3 py-2 rounded bg-red-500/10 border border-red-500/20 text-red-400">{preview.error}</div>
      )}

      <div className={`grid gap-4 ${showExperimentalCameraTools && preview.status === "streaming" && preview.showPlots ? "lg:grid-cols-[1fr_320px]" : ""}`}>
        <CameraStreamViewport
          imgRef={preview.imgRef}
          frameCount={preview.health?.frameCount || 0}
          status={preview.status}
        />
        {showExperimentalCameraTools && preview.status === "streaming" && preview.showPlots && (
          <CameraPerformancePanel
            clientFpsHistory={preview.clientFpsHistory}
            fpsHistory={preview.fpsHistory}
            frameSizeHistory={preview.frameSizeHistory}
            health={preview.health}
            latencyHistory={preview.latencyHistory}
            streamConfig={preview.streamConfig}
          />
        )}
      </div>

      {showExperimentalCameraTools && <PreviewInfoFooter status={preview.status} streamConfig={preview.streamConfig} />}
    </div>
  );
}
