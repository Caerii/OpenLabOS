import { fetchOptionalManifest, mergeById } from "./scenarios";
import type { CoachRecording, CoachScenario, LiveCoachDataset } from "./types";

type StaticManifest = {
  protocolName?: string;
  scenarios?: CoachScenario[];
  recordings?: CoachRecording[];
};

export async function loadStaticLiveCoachDemo(protocolId: string): Promise<LiveCoachDataset> {
  const baseManifest = await fetchOptionalManifest<StaticManifest>("/demo/live-coach-recordings/manifest.json");
  const protocolManifest = await fetchOptionalManifest<StaticManifest>(`/demo/protocol-voice-assets/${encodeURIComponent(protocolId)}/manifest.json`);
  if (!baseManifest && !protocolManifest) throw new Error("Static Live Coach manifests unavailable");

  return {
    demoMode: "static",
    status: { state: "idle", configured: false, model: "static replay", audioRoute: "browser" },
    health: {
      ok: false,
      configured: false,
      model: "static replay",
      audioRoute: "browser",
      output: `Keyless live-site mode: replaying bundled scenario clips${protocolManifest ? ` for ${protocolManifest.protocolName || protocolId}` : ""}.`,
      recordingsEnabled: false,
      recordingsDir: protocolManifest ? `/demo/protocol-voice-assets/${protocolId}` : "/demo/live-coach-recordings",
    },
    recordings: mergeById([
      ...((baseManifest?.recordings || []) as CoachRecording[]),
      ...((protocolManifest?.recordings || []) as CoachRecording[]),
    ]),
    scenarios: mergeById([
      ...((baseManifest?.scenarios || []) as CoachScenario[]),
      ...((protocolManifest?.scenarios || []) as CoachScenario[]),
    ]),
  };
}
