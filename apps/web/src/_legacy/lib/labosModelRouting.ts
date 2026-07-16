/**
 * Client-side model id rules — must stay aligned with `src/server/ai/model-strategy.ts`
 * (Vercel AI SDK routing). Used for UI-only hints (e.g. pipeline concurrency).
 */

export function providerIdFromModelId(modelId: string): string {
  const i = modelId.indexOf(":");
  return i === -1 ? "" : modelId.slice(0, i);
}

export function prefersFreeformFrameAnalysis(modelId: string): boolean {
  const p = providerIdFromModelId(modelId);
  return p === "ollama" || p === "lmstudio";
}

export function suggestedVisionMaxConcurrent(modelId: string): number {
  return prefersFreeformFrameAnalysis(modelId) ? 1 : 3;
}
