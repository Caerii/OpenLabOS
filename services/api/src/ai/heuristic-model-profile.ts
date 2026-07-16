/**
 * Heuristic capability hints from public model ids (no provider HTTP call).
 * Used for catalog UIs (e.g. Together) and agent routing hints.
 */

export interface HeuristicModelCapabilities {
  vision: boolean;
  reasoning: boolean;
  fastPath: boolean;
}

export function heuristicModelCapabilities(id: string): HeuristicModelCapabilities {
  const s = id.toLowerCase();
  const providerless = s.includes(":") ? s.slice(s.indexOf(":") + 1) : s;
  const explicitVisionModel =
    /^qwen\/qwen3\.5-9b(?:-fp8)?$/.test(providerless) ||
    /^qwen3\.5-9b-vlm$/.test(providerless);
  const vision =
    explicitVisionModel ||
    /llava|vision|vl-|vae|multimodal|moondream|internvl|pixtral|aria|mllama|smolvlm|florence|idefics|image|siglip|clip/.test(
      s,
    ) || /qwen.*vl|llama-3\.2.*vision|llama3\.2.*vision/.test(s);
  const reasoning = /deepseek-r1|o1|reasoning|think|r1-/.test(s);
  const fastPath = /flash|8b|7b|3b|1b|small|turbo|instruct|fast/.test(s);
  return { vision, reasoning, fastPath };
}
