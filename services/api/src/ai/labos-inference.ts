/**
 * LabOS multimodal inference — **single boundary** for Vercel AI SDK (`ai` package).
 *
 * All server-side `generateText` / `generateObject` calls must go through this module
 * so every provider resolves via `getModel("provider:modelId")` in `providers.ts`.
 *
 * **Do not** `import { generateText, generateObject } from "ai"` elsewhere under `src/server`.
 *
 * **Intentional exceptions** (not generic chat completion):
 * - `live-coach/`: Gemini **Live** bidirectional audio uses `@google/genai` — no multi-provider
 *   Live equivalent in the AI SDK today; keep isolated there.
 * - **Discovery only** (not LLM inference): HTTP in `providers.ts`, `together.ts`, `routes/ai.ts`
 *   (Ollama tags, LM Studio / Together model lists).
 */

import { generateObject, generateText } from "ai";
import { getModel } from "./providers.js";

type GenerateTextInput = Parameters<typeof generateText>[0];
type GenerateObjectInput = Parameters<typeof generateObject>[0];

export function labosGenerateText(options: Omit<GenerateTextInput, "model"> & { modelId: string }) {
  const { modelId, ...rest } = options;
  return generateText({
    ...(rest as Omit<GenerateTextInput, "model">),
    model: getModel(modelId),
  } as GenerateTextInput);
}

/** `generateObject` has a wide discriminated input type; we only inject `model` from `modelId`. */
export function labosGenerateObject(options: { modelId: string } & Record<string, unknown>) {
  const { modelId, ...rest } = options;
  return generateObject({
    ...rest,
    model: getModel(modelId),
  } as GenerateObjectInput);
}
