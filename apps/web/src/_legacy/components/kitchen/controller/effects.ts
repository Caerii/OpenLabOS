import { useEffect, useRef } from "react";
import {
  previewRecordingStop,
  type KitchenRunAdherenceResult,
  type KitchenRunSummary,
  type KitchenStepStatus,
  type LabOSWorkflowPreset,
} from "../../../api";
import { protocolIdForPreset } from "./presets";
import type { KitchenDemoView, StateSetter } from "./types";

export function useProtocolAutoSelection({
  protocols,
  preset,
  selectedProtocol,
  setSelectedProtocol,
}: {
  protocols: Array<{ id: string }>;
  preset: LabOSWorkflowPreset;
  selectedProtocol: string;
  setSelectedProtocol: StateSetter<string>;
}) {
  useEffect(() => {
    if (!selectedProtocol && protocols.length) {
      setSelectedProtocol(protocolIdForPreset(protocols, preset));
    }
  }, [protocols, preset, selectedProtocol, setSelectedProtocol]);
}

export function useActiveRunRouting({
  isActive,
  runStatus,
  view,
  setView,
  setAutoAdherence,
}: {
  isActive: boolean;
  runStatus: KitchenRunSummary["status"] | null;
  view: KitchenDemoView;
  setView: StateSetter<KitchenDemoView>;
  setAutoAdherence: StateSetter<boolean>;
}) {
  useEffect(() => {
    if (isActive && view === "protocols") setView("run");
    if (!isActive && view === "run" && (runStatus === "completed" || runStatus === "aborted")) setView("guided");
  }, [isActive, runStatus, setView, view]);

  useEffect(() => {
    if (!isActive) setAutoAdherence(false);
  }, [isActive, setAutoAdherence]);
}

export function useRunAudioAndRecordingEffects({
  isActive,
  currentStep,
  runStatus,
  refreshRecording,
  refreshManifests,
  setLastAdherence,
}: {
  isActive: boolean;
  currentStep: KitchenStepStatus | null;
  runStatus: KitchenRunSummary["status"] | null;
  refreshRecording: () => void;
  refreshManifests: () => void;
  setLastAdherence: StateSetter<KitchenRunAdherenceResult | null>;
}) {
  const lastStepNumberRef = useRef<number | null>(null);
  const lastRunStatusRef = useRef<string | null>(null);

  useEffect(() => {
    const stepNumber = currentStep?.number ?? null;

    if (isActive && stepNumber != null && lastStepNumberRef.current !== stepNumber) {
      lastStepNumberRef.current = stepNumber;
      setLastAdherence(null);
    }

    if (runStatus && lastRunStatusRef.current !== runStatus) {
      if (runStatus === "completed") {
        previewRecordingStop({ reason: "run_completed" }).then(refreshRecording).catch(() => {});
        refreshManifests();
      }
      if (runStatus === "aborted") {
        previewRecordingStop({ reason: "run_aborted" }).then(refreshRecording).catch(() => {});
        refreshManifests();
      }
      lastRunStatusRef.current = runStatus;
    }
  }, [currentStep?.number, isActive, refreshManifests, refreshRecording, runStatus, setLastAdherence]);
}

export function useAutoAdherenceLoop({
  enabled,
  isActive,
  runStatus,
  currentStepNumber,
  onTick,
}: {
  enabled: boolean;
  isActive: boolean;
  runStatus: KitchenRunSummary["status"] | null;
  currentStepNumber?: number;
  onTick: () => Promise<void>;
}) {
  const inFlightRef = useRef(false);
  const tickRef = useRef(onTick);
  tickRef.current = onTick;

  useEffect(() => {
    if (!enabled || !isActive || runStatus !== "running") return;

    const tick = () => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      tickRef.current().finally(() => {
        inFlightRef.current = false;
      });
    };

    tick();
    const interval = window.setInterval(tick, 5000);
    return () => window.clearInterval(interval);
  }, [currentStepNumber, enabled, isActive, runStatus]);
}
