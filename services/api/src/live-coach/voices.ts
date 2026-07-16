export type GeminiLiveVoice = {
  name: string;
  style: string;
  character: string;
};

/**
 * Gemini Live voice catalog.
 *
 * The names match Gemini Live `speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName`.
 * The character labels are LabOS UX copy layered on top of Google's voice styles.
 */
export const GEMINI_LIVE_VOICES: GeminiLiveVoice[] = [
  { name: "Puck", style: "Upbeat", character: "playful lab mate" },
  { name: "Charon", style: "Informative", character: "calm protocol narrator" },
  { name: "Kore", style: "Firm", character: "precise supervisor" },
  { name: "Fenrir", style: "Excitable", character: "energetic coach" },
  { name: "Leda", style: "Youthful", character: "bright junior copilot" },
  { name: "Orus", style: "Firm", character: "steady operator" },
  { name: "Aoede", style: "Breezy", character: "relaxed guide" },
  { name: "Zephyr", style: "Bright", character: "crisp demo host" },
  { name: "Callirrhoe", style: "Easy-going", character: "gentle helper" },
  { name: "Autonoe", style: "Bright", character: "clear facilitator" },
  { name: "Enceladus", style: "Breathy", character: "soft-spoken coach" },
  { name: "Iapetus", style: "Clear", character: "clean-room announcer" },
  { name: "Umbriel", style: "Easy-going", character: "low-pressure mentor" },
  { name: "Algieba", style: "Smooth", character: "polished concierge" },
  { name: "Despina", style: "Smooth", character: "natural companion" },
  { name: "Erinome", style: "Clear", character: "concise verifier" },
  { name: "Algenib", style: "Gravelly", character: "dry-humour technician" },
  { name: "Rasalgethi", style: "Informative", character: "methodical scientist" },
  { name: "Laomedeia", style: "Upbeat", character: "friendly demonstrator" },
  { name: "Achernar", style: "Soft", character: "gentle safety coach" },
  { name: "Alnilam", style: "Firm", character: "assertive checklist lead" },
  { name: "Schedar", style: "Even", character: "balanced instructor" },
  { name: "Gacrux", style: "Mature", character: "senior lab lead" },
  { name: "Pulcherrima", style: "Forward", character: "confident guide" },
  { name: "Achird", style: "Friendly", character: "warm teammate" },
  { name: "Zubenelgenubi", style: "Casual", character: "laid-back copilot" },
  { name: "Vindemiatrix", style: "Gentle", character: "patient tutor" },
  { name: "Sadachbia", style: "Lively", character: "animated host" },
  { name: "Sadaltager", style: "Knowledgeable", character: "scholarly advisor" },
  { name: "Sulafat", style: "Warm", character: "welcoming guide" },
];

export function normalizeGeminiLiveVoice(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const match = GEMINI_LIVE_VOICES.find((voice) => voice.name.toLowerCase() === trimmed.toLowerCase());
  return match?.name || null;
}
