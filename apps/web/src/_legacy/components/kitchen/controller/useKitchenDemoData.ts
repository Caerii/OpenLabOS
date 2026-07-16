import { usePolling } from "../../../hooks/usePolling";
import {
  defaultWorkflowPreset,
  buttonMappings,
  kitchenButtonConfirmStatus,
  kitchenOperatorReadiness,
  kitchenFeatures,
  kitchenEntitySegmentationStatus,
  kitchenListModes,
  kitchenProtocols,
  kitchenRunStatus,
  kitchenRunSupervisorStatus,
  kitchenSavedSessionManifests,
  labosStatus,
  liveCoachHealth,
  previewHealth,
  previewRecordingStatus,
  runpodGuardStatus,
  type KitchenProtocolSummary,
} from "../../../api";

export function useKitchenDemoData({ connected }: { connected: boolean }) {
  const { data: protocolsData, refresh: refreshProtocols } = usePolling(kitchenProtocols, 30000);
  const { data: runData, refresh: refreshRun } = usePolling(kitchenRunStatus, 1500);
  const { data: modesData } = usePolling(kitchenListModes, 60000);
  const { data: supervisorStatus, refresh: refreshSupervisor } = usePolling(kitchenRunSupervisorStatus, 2000);
  const { data: segmentationStatus } = usePolling(() => kitchenEntitySegmentationStatus(true), 10000);
  const { data: previewStatus, refresh: refreshPreview } = usePolling(previewHealth, 2000, connected);
  const { data: recordingStatus, refresh: refreshRecording } = usePolling(previewRecordingStatus, 3000, connected);
  const { data: labosData, refresh: refreshLabos } = usePolling(labosStatus, 5000, connected);
  const { data: runpodGuard } = usePolling(runpodGuardStatus, 15000);
  const { data: voiceHealth } = usePolling(liveCoachHealth, 10000);
  const { data: workflowPreset, refresh: refreshWorkflowPreset } = usePolling(defaultWorkflowPreset, 30000);
  const { data: featureData, refresh: refreshFeatures } = usePolling(kitchenFeatures, 30000);
  const { data: savedManifestData, refresh: refreshManifests } = usePolling(kitchenSavedSessionManifests, 15000);
  const { data: buttonMappingData, refresh: refreshButtonMappings } = usePolling(buttonMappings, 30000, connected);
  const { data: buttonConfirmStatus, refresh: refreshButtonConfirmStatus } = usePolling(kitchenButtonConfirmStatus, 5000, connected);
  const { data: operatorReadiness, refresh: refreshOperatorReadiness } = usePolling(kitchenOperatorReadiness, 3000, connected);

  const protocols: KitchenProtocolSummary[] = protocolsData?.protocols || [];
  const run = runData?.run || null;
  const currentStep = runData?.currentStep || runData?.reviewStep || null;
  const isActive = runData?.active ?? false;

  return {
    data: {
      protocols,
      runData,
      run,
      currentStep,
      isActive,
      modesData,
      supervisorStatus,
      segmentationStatus,
      previewStatus,
      recordingStatus,
      labosData,
      runpodGuard,
      voiceHealth,
      workflowPreset,
      rawFeatureFlags: featureData?.flags || null,
      featureFlags: featureData?.effectiveFlags || featureData?.flags || null,
      featureExperience: featureData?.experience || null,
      savedManifests: savedManifestData?.manifests || [],
      buttonMappings: buttonMappingData?.mappings || null,
      buttonConfirmStatus: buttonConfirmStatus || null,
      operatorReadiness: operatorReadiness || null,
    },
    refresh: {
      protocols: refreshProtocols,
      run: refreshRun,
      supervisor: refreshSupervisor,
      preview: refreshPreview,
      recording: refreshRecording,
      labos: refreshLabos,
      workflowPreset: refreshWorkflowPreset,
      features: refreshFeatures,
      manifests: refreshManifests,
      buttonMappings: refreshButtonMappings,
      buttonConfirmStatus: refreshButtonConfirmStatus,
      operatorReadiness: refreshOperatorReadiness,
    },
  };
}
