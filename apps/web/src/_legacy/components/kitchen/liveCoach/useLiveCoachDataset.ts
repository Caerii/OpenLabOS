import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { loadStaticLiveCoachDemo } from "./staticReplay";
import type {
  CoachHealth,
  CoachRecording,
  CoachScenario,
  CoachStatus,
  DemoMode,
  LiveCoachDataset,
} from "./types";

async function fetchLiveCoachData(protocolId: string) {
  const [healthRes, scenariosRes, recordingsRes] = await Promise.all([
    fetch("/api/live-coach/health"),
    fetch(`/api/live-coach/scenarios?protocolId=${encodeURIComponent(protocolId)}`),
    fetch("/api/live-coach/recordings?limit=8"),
  ]);
  if (!healthRes.ok || !scenariosRes.ok || !recordingsRes.ok) {
    throw new Error("Live Coach API unavailable");
  }

  const [healthData, scenariosData, recordingsData] = await Promise.all([
    healthRes.json() as Promise<CoachHealth>,
    scenariosRes.json() as Promise<{ scenarios?: CoachScenario[] }>,
    recordingsRes.json() as Promise<{ recordings?: CoachRecording[] }>,
  ]);

  return {
    health: healthData,
    scenarios: scenariosData.scenarios || [],
    recordings: recordingsData.recordings || [],
  };
}

async function fetchRecentRecordings() {
  const res = await fetch("/api/live-coach/recordings?limit=8");
  const data = await res.json() as { recordings?: CoachRecording[] };
  return data.recordings || [];
}

export function useLiveCoachDataset({
  protocolId,
  setStatus,
}: {
  protocolId: string;
  setStatus: Dispatch<SetStateAction<CoachStatus>>;
}) {
  const [health, setHealth] = useState<CoachHealth | null>(null);
  const [scenarios, setScenarios] = useState<CoachScenario[]>([]);
  const [recordings, setRecordings] = useState<CoachRecording[]>([]);
  const [demoMode, setDemoMode] = useState<DemoMode>("api");

  function applyDataset(dataset: LiveCoachDataset) {
    setDemoMode(dataset.demoMode);
    setStatus(dataset.status);
    setHealth(dataset.health);
    setScenarios(dataset.scenarios);
    setRecordings(dataset.recordings);
  }

  async function applyStaticFallback() {
    applyDataset(await loadStaticLiveCoachDemo(protocolId));
  }

  async function loadLiveCoachData() {
    try {
      const dataset = await fetchLiveCoachData(protocolId);
      if (!dataset.health.configured) {
        await applyStaticFallback();
        return;
      }
      setDemoMode("api");
      setHealth(dataset.health);
      setScenarios(dataset.scenarios);
      setRecordings(dataset.recordings);
    } catch {
      await applyStaticFallback().catch(() => {});
    }
  }

  async function refreshRecordings() {
    if (demoMode === "static") {
      await applyStaticFallback().catch(() => {});
      return;
    }
    try {
      setRecordings(await fetchRecentRecordings());
    } catch {}
  }

  useEffect(() => {
    loadLiveCoachData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [protocolId]);

  return {
    health,
    scenarios,
    recordings,
    demoMode,
    refreshRecordings,
  };
}
