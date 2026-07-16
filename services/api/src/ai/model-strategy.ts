/**
 * Provider-agnostic rules for how LabOS uses Vercel AI SDK (`ai` + `getModel()`).
 * Call sites should import from here instead of branching on raw provider strings.
 *
 * Client UI hints: keep `src/client/lib/labosModelRouting.ts` in sync when changing rules here.
 */

/** First path segment of a LabOS model id, e.g. `together:meta-llama/...` → `together` */
export function providerIdFromModelId(modelId: string): string {
  const i = modelId.indexOf(":");
  return i === -1 ? "" : modelId.slice(0, i);
}

/**
 * Local OpenAI-compatible stacks often return flaky strict JSON from `generateObject`;
 * we use freeform + manual JSON parse for those.
 */
export function prefersFreeformFrameAnalysis(modelId: string): boolean {
  const p = providerIdFromModelId(modelId);
  return p === "ollama" || p === "lmstudio";
}

/** Models routed through `generateObject` + multimodal messages (AI SDK). */
export function usesStructuredFramePipeline(modelId: string): boolean {
  return !prefersFreeformFrameAnalysis(modelId);
}

/** Suggested max parallel analyses for the vision pipeline (local = 1). */
export function suggestedVisionMaxConcurrent(modelId: string): number {
  return prefersFreeformFrameAnalysis(modelId) ? 1 : 3;
}
