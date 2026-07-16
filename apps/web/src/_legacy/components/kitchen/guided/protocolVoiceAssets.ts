export interface ProtocolVoiceScenario {
  id: string;
  title: string;
  category: string;
  protocolId: string;
  stepNumber?: number | null;
  trigger: string;
  script?: string;
  recordingId?: string;
  outputUrl?: string;
}

export interface ProtocolVoiceRecording {
  id: string;
  title?: string;
  scenarioId?: string;
  protocolId?: string;
  stepNumber?: number | null;
  outputWav?: string;
  outputUrl?: string;
  staticBaseUrl?: string;
}

export interface ProtocolVoiceManifest {
  protocolId?: string;
  protocolName?: string;
  generatedAt?: string;
  scenarios?: ProtocolVoiceScenario[];
  recordings?: ProtocolVoiceRecording[];
}

export interface StepVoiceClip {
  scenario: ProtocolVoiceScenario;
  recording: ProtocolVoiceRecording;
  url: string;
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function meaningfulTokens(value: string) {
  return normalize(value)
    .split(" ")
    .filter((token) => token.length > 2 && !["the", "and", "with", "for", "into", "your"].includes(token));
}

export function staticProtocolVoiceManifestUrl(protocolId: string) {
  return `/demo/protocol-voice-assets/${encodeURIComponent(protocolId)}/manifest.json`;
}

export function outputUrlForProtocolRecording(recording: ProtocolVoiceRecording) {
  if (recording.outputUrl) return recording.outputUrl;
  if (recording.staticBaseUrl) return `${recording.staticBaseUrl}/output.wav`;
  return "";
}

function scenarioMatchesInstruction(scenario: ProtocolVoiceScenario, instruction: string) {
  const normalizedInstruction = normalize(instruction);
  if (!normalizedInstruction) return false;
  const searchable = normalize([
    scenario.title || "",
    scenario.script || "",
    scenario.id || "",
    scenario.outputUrl || "",
  ].join(" "));
  if (searchable.includes(normalizedInstruction)) return true;

  const instructionTokens = meaningfulTokens(instruction);
  if (instructionTokens.length < 3) return false;
  const searchableTokens = new Set(meaningfulTokens(searchable));
  const matchedTokens = instructionTokens.filter((token) => searchableTokens.has(token)).length;
  return matchedTokens / instructionTokens.length >= 0.6;
}

export function stepIntroClipFor(
  manifest: ProtocolVoiceManifest | null,
  stepNumber?: number | null,
  instruction = "",
): StepVoiceClip | null {
  if (!manifest || !stepNumber) return null;
  const scenarios = manifest.scenarios || [];
  const recordings = manifest.recordings || [];
  const scenario = scenarios.find((item) => (
    item.trigger === "step_started" &&
    item.stepNumber === stepNumber &&
    scenarioMatchesInstruction(item, instruction)
  ));
  if (!scenario) return null;

  const recording = recordings.find((item) => (
    item.scenarioId === scenario.id ||
    item.id === scenario.recordingId ||
    item.id === scenario.id
  ));
  if (!recording) return null;

  const url = outputUrlForProtocolRecording(recording);
  return url ? { scenario, recording, url } : null;
}
