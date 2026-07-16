/**
 * Together.ai — discovery + profiling only. Inference is provider-agnostic via
 * `@ai-sdk/openai` + `getModel("together:…")` in `providers.ts` (same pattern as Ollama / LM Studio).
 */

import { heuristicModelCapabilities } from "./heuristic-model-profile.js";

const TOGETHER_BASE = "https://api.together.xyz/v1";

export interface TogetherModelProfile {
  id: string;
  /** LabOS vision / kitchen selector id */
  labosModelId: string;
  vision: boolean;
  reasoning: boolean;
  fastPath: boolean;
}

let cache: { t: number; ids: string[]; error?: string } | null = null;
const TTL_OK_MS = 5 * 60 * 1000;
const TTL_ERR_MS = 45 * 1000;

/** @deprecated use heuristicModelCapabilities */
export function profileTogetherModelId(id: string): Pick<TogetherModelProfile, "vision" | "reasoning" | "fastPath"> {
  return heuristicModelCapabilities(id);
}

function idFromUnknownModel(value: unknown) {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  return typeof record.id === "string" ? record.id : typeof record.name === "string" ? record.name : "";
}

export function parseTogetherModelIds(rawText: string): string[] {
  const parsed = JSON.parse(rawText) as unknown;
  const models = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as any)?.data)
      ? (parsed as any).data
      : Array.isArray((parsed as any)?.models)
        ? (parsed as any).models
        : [];

  return (models as unknown[])
    .map(idFromUnknownModel)
    .filter((id): id is string => id.length > 0);
}

export async function listTogetherModelIds(apiKey: string): Promise<{ ids: string[]; error?: string }> {
  const now = Date.now();
  if (cache && now - cache.t < (cache.error ? TTL_ERR_MS : TTL_OK_MS)) {
    return { ids: cache.ids, error: cache.error };
  }

  try {
    const res = await fetch(`${TOGETHER_BASE}/models`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(15000),
    });
    const rawText = await res.text();
    if (!res.ok) {
      const msg = `Together HTTP ${res.status}: ${rawText.slice(0, 240)}`;
      cache = { t: now, ids: [], error: msg };
      return { ids: [], error: msg };
    }
    let ids: string[];
    try {
      ids = parseTogetherModelIds(rawText);
    } catch {
      const msg = "Together returned non-JSON";
      cache = { t: now, ids: [], error: msg };
      return { ids: [], error: msg };
    }
    cache = { t: now, ids, error: undefined };
    return { ids };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Together request failed";
    cache = { t: now, ids: [], error: message };
    return { ids: [], error: message };
  }
}

export function buildTogetherProfiles(ids: string[]): TogetherModelProfile[] {
  return ids.map((id) => {
    const p = heuristicModelCapabilities(id);
    return {
      id,
      labosModelId: `together:${id}`,
      ...p,
    };
  });
}
