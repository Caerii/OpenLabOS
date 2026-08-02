import { useState } from "react";
import type {
  EntitySegmentationStatus,
  KitchenButtonConfirmStatus,
  KitchenOperatorReadiness,
  KitchenRealtimeSupervisorStatus,
  KitchenRunAdherenceResult,
  LabOSFeatureExperience,
  LabOSFeatureFlags,
  LiveCoachHealth,
  PreviewHealth,
  RunPodCostGuardStatus,
} from "../../../api";
import { deriveLabOSExperience } from "../../../lib/labosExperience";
import { DependencyStatusPanel } from "./DependencyStatusPanel";
import { JudgmentSourceBadge } from "./JudgmentSourceBadge";

export function KitchenInstrumentationDrawer({
  featureFlags,
  featureExperience,
  preview,
  operatorReadiness,
  buttonConfirmStatus,
  voiceHealth,
  segmentation,
  runpodGuard,
  supervisor,
  lastAdherence,
}: {
  featureFlags: LabOSFeatureFlags | null;
  featureExperience: LabOSFeatureExperience | null;
  preview: PreviewHealth | null;
  operatorReadiness: KitchenOperatorReadiness | null;
  buttonConfirmStatus: KitchenButtonConfirmStatus | null;
  voiceHealth: LiveCoachHealth | null;
  segmentation: EntitySegmentationStatus | null;
  runpodGuard: RunPodCostGuardStatus | null;
  supervisor: KitchenRealtimeSupervisorStatus | null;
  lastAdherence: KitchenRunAdherenceResult | null;
}) {
  const experience = deriveLabOSExperience(featureFlags, featureExperience);
  const [open, setOpen] = useState(false);

  if (!experience.surfaces.engineeringKitchenInstrumentation) return null;

  const payload = {
    profile: experience.profile,
    configuredProfile: experience.configuredProfile,
    enabledExperiments: experience.enabledExperiments,
    preview: preview
      ? {
          fps: preview.fps,
          frameCount: preview.frameCount,
          frameBytes: preview.frameBytes,
          frameReachable: preview.frameReachable,
          streaming: preview.streaming,
        }
      : null,
    readiness: operatorReadiness,
    buttonConfirm: buttonConfirmStatus,
    voice: voiceHealth,
    segmentation,
    runpodGuard,
    supervisor,
    effectiveFlags: featureFlags,
  };

  return (
    <details className="labos-panel text-fg" open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary className="labos-panel-head oc-expandable-trigger cursor-pointer list-none">
        Instrumentation
      </summary>
      <div className="labos-panel-body space-y-3">
        <DependencyStatusPanel />
        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-subtle">Judgment source</div>
          <JudgmentSourceBadge
            lastAdherence={lastAdherence}
            supervisor={supervisor}
            segmentation={segmentation}
            runpodGuard={runpodGuard}
          />
        </div>
        <pre className="max-h-80 overflow-auto font-mono text-[11px] leading-relaxed text-muted">
          {JSON.stringify(payload, null, 2)}
        </pre>
      </div>
    </details>
  );
}
