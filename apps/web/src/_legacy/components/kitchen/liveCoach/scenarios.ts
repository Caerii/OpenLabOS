import type { CoachAutoCue } from "../guided";
import type { CoachRecording, CoachScenario, ScenarioGroup } from "./types";

export function mergeById<T extends { id: string }>(items: T[]) {
  return Array.from(new Map(items.map((item) => [item.id, item])).values());
}

export async function fetchOptionalManifest<T = any>(url: string): Promise<T | null> {
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.json() as Promise<T>;
}

export function outputUrlForRecording(recording: CoachRecording) {
  if (recording.outputUrl) return recording.outputUrl;
  if (recording.staticBaseUrl) return `${recording.staticBaseUrl}/output.wav`;
  return `/api/live-coach/recordings/${encodeURIComponent(recording.id)}/output.wav`;
}

export function eventsUrlForRecording(recording: CoachRecording) {
  if (recording.eventsUrl) return recording.eventsUrl;
  if (recording.staticBaseUrl) return `${recording.staticBaseUrl}/events.jsonl`;
  return `/api/live-coach/recordings/${encodeURIComponent(recording.id)}/events.jsonl`;
}

export function scenarioForCue(scenarios: CoachScenario[], cue: CoachAutoCue) {
  return scenarios.find((scenario) =>
    scenario.trigger === cue.trigger &&
    (cue.stepNumber == null || scenario.stepNumber === cue.stepNumber)
  ) || scenarios.find((scenario) => scenario.trigger === cue.trigger);
}

export function scenarioGroupFor(scenario: CoachScenario, currentStepNumber?: number | null): ScenarioGroup {
  if (!scenario.stepNumber) return "primary";
  if (scenario.stepNumber === currentStepNumber) return "primary";
  return "advanced";
}

export function splitScenarioGroups(scenarios: CoachScenario[], currentStepNumber?: number | null) {
  return {
    primaryScenarios: scenarios.filter((scenario) => scenarioGroupFor(scenario, currentStepNumber) === "primary"),
    advancedScenarios: scenarios.filter((scenario) => scenarioGroupFor(scenario, currentStepNumber) === "advanced"),
  };
}
