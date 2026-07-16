import { useEffect, useState } from "react";
import type { ERAnalysisResult, KitchenRunAdherenceResult } from "../../../api";
import { useAnalysisActions } from "./analysisActions";
import { useDevicePrepActions } from "./deviceActions";
import {
  useActiveRunRouting,
  useAutoAdherenceLoop,
  useProtocolAutoSelection,
  useRunAudioAndRecordingEffects,
} from "./effects";
import {
  KITCHEN_DEMO_FALLBACK_PRESET,
} from "./presets";
import { useKitchenRunActions } from "./runActions";
import { useSupervisorActions } from "./supervisorActions";
import type { KitchenDemoView } from "./types";
import { useKitchenDemoData } from "./useKitchenDemoData";
import { useVerificationActions } from "./verificationActions";

export function useKitchenDemoController({ connected }: { connected: boolean }) {
  const { data, refresh } = useKitchenDemoData({ connected });
  const preset = data.workflowPreset || KITCHEN_DEMO_FALLBACK_PRESET;

  const [view, setView] = useState<KitchenDemoView>("guided");
  const [selectedProtocol, setSelectedProtocol] = useState("");
  const [error, setError] = useState("");
  const [guidedBusy, setGuidedBusy] = useState("");
  const [savingManifest, setSavingManifest] = useState(false);
  const [savedManifestRef, setSavedManifestRef] = useState("");

  const [verifying, setVerifying] = useState(false);
  const [confirmingStep, setConfirmingStep] = useState(false);
  const [adherenceChecking, setAdherenceChecking] = useState(false);
  const [supervisorChanging, setSupervisorChanging] = useState(false);
  const [autoAdherence, setAutoAdherence] = useState(false);
  const [lastAdherence, setLastAdherence] = useState<KitchenRunAdherenceResult | null>(null);

  const [analyzing, setAnalyzing] = useState(false);
  const [lastResult, setLastResult] = useState<ERAnalysisResult | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResult, setSearchResult] = useState<any>(null);
  const [searching, setSearching] = useState(false);

  const [videoUrl, setVideoUrl] = useState("");
  const [videoExtracting, setVideoExtracting] = useState(false);
  const [videoResult, setVideoResult] = useState<any>(null);

  useActiveRunRouting({
    isActive: data.isActive,
    runStatus: data.run?.status || null,
    view,
    setView,
    setAutoAdherence,
  });
  useProtocolAutoSelection({
    protocols: data.protocols,
    preset,
    selectedProtocol,
    setSelectedProtocol,
  });
  useRunAudioAndRecordingEffects({
    isActive: data.isActive,
    currentStep: data.currentStep,
    runStatus: data.run?.status || null,
    refreshRecording: refresh.recording,
    refreshManifests: refresh.manifests,
    setLastAdherence,
  });

  useEffect(() => {
    const runId = data.run?.id;
    if (!runId) {
      if (savedManifestRef) setSavedManifestRef("");
      return;
    }
    const saved = data.savedManifests.find((manifest) => manifest.runId === runId);
    if (saved?.manifestRef && saved.manifestRef !== savedManifestRef) {
      setSavedManifestRef(saved.manifestRef);
    }
    if (!saved && data.run?.status === "running" && savedManifestRef) {
      setSavedManifestRef("");
    }
  }, [data.run?.id, data.run?.status, data.savedManifests, savedManifestRef]);

  const verificationActions = useVerificationActions({
    refresh,
    preset,
    featureFlags: data.featureFlags,
    setError,
    setVerifying,
    setConfirmingStep,
    setAdherenceChecking,
    setLastResult,
    setLastAdherence,
  });

  useAutoAdherenceLoop({
    enabled: autoAdherence,
    isActive: data.isActive,
    runStatus: data.run?.status || null,
    currentStepNumber: data.currentStep?.number,
    onTick: verificationActions.runAdherenceTick,
  });

  const runActions = useKitchenRunActions({
    data,
    refresh,
    preset,
    selectedProtocol,
    setSelectedProtocol,
    setView,
    setError,
    setGuidedBusy,
    setSavingManifest,
    setSavedManifestRef,
  });

  const supervisorActions = useSupervisorActions({
    refresh,
    preset,
    setError,
    setGuidedBusy,
    setSupervisorChanging,
  });

  const deviceActions = useDevicePrepActions({
    refresh,
    setError,
    setGuidedBusy,
  });

  const analysisActions = useAnalysisActions({
    refresh,
    searchQuery,
    videoUrl,
    setError,
    setAnalyzing,
    setLastResult,
    setSearchResult,
    setSearching,
    setVideoExtracting,
    setVideoResult,
  });

  return {
    preset,
    data,
    ui: {
      view,
      selectedProtocol,
      error,
      guidedBusy,
      savingManifest,
      savedManifestRef,
      verifying,
      confirmingStep,
      adherenceChecking,
      supervisorChanging,
      autoAdherence,
      lastAdherence,
      analyzing,
      lastResult,
      searchQuery,
      searchResult,
      searching,
      videoUrl,
      videoExtracting,
      videoResult,
    },
    actions: {
      setView,
      setSelectedProtocol,
      setError,
      setAutoAdherence,
      setSearchQuery,
      setVideoUrl,
      setVideoResult,
      ...runActions,
      ...deviceActions,
      ...verificationActions,
      ...supervisorActions,
      ...analysisActions,
    },
  };
}
