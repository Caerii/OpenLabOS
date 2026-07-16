/**
 * AI Provider Registry — unified model routing for LabOS vision pipeline (Vercel AI SDK).
 *
 * Backends:
 *   1. Google Gemini — `@ai-sdk/google` → `getModel("google:…")`
 *   2. OpenAI — `@ai-sdk/openai` default endpoint
 *   3. Ollama — `createOpenAI({ baseURL: …/v1 })` (OpenAI-compatible)
 *   4. LM Studio — same as Ollama
 *   5. Together.ai — same as Ollama, hosted at api.together.xyz
 *
 * All chat/vision **generation** goes through `getModel()` + `labos-inference.ts` (`generateText` / `generateObject` from `ai`).
 *
 * Model ID format: "provider:model-name"
 *   e.g. "google:gemini-2.5-flash", "together:meta-llama/Llama-3.2-11B-Vision-Instruct-Turbo"
 */

import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";
import { listTogetherModelIds } from "./together.js";

// ── Provider Configuration ──────────────────────────────

export interface ProviderConfig {
  google?: { apiKey: string };
  openai?: { apiKey: string };
  ollama?: { baseUrl: string };     // defaults to http://localhost:11434
  lmstudio?: { baseUrl: string };   // defaults to http://localhost:1234
  together?: { apiKey: string };
  runpod?: { baseUrl: string; apiKey: string };
}

/** Runtime config — loaded from env vars or set programmatically */
let config: ProviderConfig = {};

export function configureProviders(cfg: ProviderConfig) {
  config = { ...config, ...cfg };
}

/** Load provider config from environment variables */
export function loadProvidersFromEnv() {
  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    config.google = { apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY };
  }
  if (process.env.OPENAI_API_KEY) {
    config.openai = { apiKey: process.env.OPENAI_API_KEY };
  }
  if (process.env.TOGETHER_API_KEY?.trim()) {
    config.together = { apiKey: process.env.TOGETHER_API_KEY.trim() };
  }
  if (process.env.RUNPOD_BASE_URL?.trim()) {
    config.runpod = {
      baseUrl: process.env.RUNPOD_BASE_URL.trim(),
      apiKey: process.env.RUNPOD_API_KEY?.trim() || "runpod",
    };
  }
  // Local providers don't need API keys — just base URLs
  config.ollama = {
    baseUrl: process.env.OLLAMA_BASE_URL || "http://localhost:11434",
  };
  config.lmstudio = {
    baseUrl: process.env.LMSTUDIO_BASE_URL || "http://localhost:1234",
  };
}

// ── Provider Instances (lazy-initialized) ──────────────

let googleProvider: ReturnType<typeof createGoogleGenerativeAI> | null = null;
let openaiProvider: ReturnType<typeof createOpenAI> | null = null;
let ollamaProvider: ReturnType<typeof createOpenAI> | null = null;
let lmstudioProvider: ReturnType<typeof createOpenAI> | null = null;
let togetherProvider: ReturnType<typeof createOpenAI> | null = null;
let runpodProvider: ReturnType<typeof createOpenAI> | null = null;

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/+$/, "");
}

function openAICompatibleBaseUrl(baseUrl: string) {
  const normalized = normalizeBaseUrl(baseUrl);
  return normalized.endsWith("/v1") ? normalized : `${normalized}/v1`;
}

function envFlag(name: string, defaultValue: boolean, env: NodeJS.ProcessEnv = process.env) {
  const value = env[name];
  if (value === undefined || value.trim() === "") return defaultValue;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function isTogetherQwen35Model(model: unknown) {
  return typeof model === "string" && /^Qwen\/Qwen3\.5\b/i.test(model);
}

export function prepareTogetherChatCompletionsBody(body: string, env: NodeJS.ProcessEnv = process.env) {
  if (envFlag("LABOS_TOGETHER_REASONING_ENABLED", false, env)) return body;

  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    if (!isTogetherQwen35Model(parsed.model) || "reasoning" in parsed) return body;
    parsed.reasoning = { enabled: false };
    return JSON.stringify(parsed);
  } catch {
    return body;
  }
}

const togetherFetch: typeof fetch = async (input, init) => {
  const url = typeof input === "string"
    ? input
    : input instanceof URL
      ? input.toString()
      : input.url;
  const body = init?.body;
  if (
    url.includes("/chat/completions") &&
    typeof body === "string"
  ) {
    const preparedBody = prepareTogetherChatCompletionsBody(body);
    if (preparedBody !== body) return fetch(input, { ...init, body: preparedBody });
  }
  return fetch(input, init);
};

function getGoogleProvider() {
  if (!config.google?.apiKey) throw new Error("Google AI API key not configured. Set GOOGLE_GENERATIVE_AI_API_KEY env var.");
  if (!googleProvider) {
    googleProvider = createGoogleGenerativeAI({ apiKey: config.google.apiKey });
  }
  return googleProvider;
}

function getOpenAIProvider() {
  if (!config.openai?.apiKey) throw new Error("OpenAI API key not configured. Set OPENAI_API_KEY env var.");
  if (!openaiProvider) {
    openaiProvider = createOpenAI({ apiKey: config.openai.apiKey });
  }
  return openaiProvider;
}

/**
 * Ollama uses OpenAI-compatible API on port 11434.
 * We use @ai-sdk/openai pointed at Ollama's /v1 endpoint so any Ollama model
 * (llava, llama3.2-vision, moondream, etc.) works through the Vercel AI SDK.
 */
function getOllamaProvider() {
  const baseUrl = config.ollama?.baseUrl || "http://localhost:11434";
  if (!ollamaProvider) {
    ollamaProvider = createOpenAI({
      baseURL: openAICompatibleBaseUrl(baseUrl),
      apiKey: "ollama",  // Ollama doesn't check this but the SDK requires it
    });
  }
  return ollamaProvider;
}

/**
 * LM Studio exposes an OpenAI-compatible API on port 1234 by default.
 * Same pattern as Ollama — we use @ai-sdk/openai pointed at LM Studio's /v1 endpoint.
 * LM Studio auto-loads models from its GUI; the model name in requests should match
 * whatever is loaded in LM Studio (visible in the server tab).
 *
 * LM Studio supports vision models (LLaVA, etc.) if you load a multimodal GGUF.
 * The /v1/models endpoint lists currently loaded models.
 */
function getLmStudioProvider() {
  const baseUrl = config.lmstudio?.baseUrl || "http://localhost:1234";
  if (!lmstudioProvider) {
    lmstudioProvider = createOpenAI({
      baseURL: openAICompatibleBaseUrl(baseUrl),
      apiKey: "lm-studio",  // LM Studio doesn't require auth for local access
    });
  }
  return lmstudioProvider;
}

/** Together.ai — OpenAI-compatible Chat Completions + JSON schema (via Vercel AI SDK). */
function getTogetherProvider() {
  if (!config.together?.apiKey) {
    throw new Error("Together API key not configured. Set TOGETHER_API_KEY env var.");
  }
  if (!togetherProvider) {
    togetherProvider = createOpenAI({
      baseURL: "https://api.together.xyz/v1",
      apiKey: config.together.apiKey,
      fetch: togetherFetch,
    });
  }
  return togetherProvider;
}

/** RunPod/vLLM exposes the same OpenAI-compatible API as LM Studio and Together. */
function getRunPodProvider() {
  if (!config.runpod?.baseUrl) {
    throw new Error("RunPod base URL not configured. Set RUNPOD_BASE_URL to your pod's OpenAI-compatible endpoint.");
  }
  if (!runpodProvider) {
    runpodProvider = createOpenAI({
      baseURL: openAICompatibleBaseUrl(config.runpod.baseUrl),
      apiKey: config.runpod.apiKey,
    });
  }
  return runpodProvider;
}

/**
 * Get the Google provider's built-in tools (Google Search, Code Execution, URL Context, etc.)
 * These are special Gemini tools that enable grounding, search, and code execution.
 */
export function getGoogleTools() {
  const provider = getGoogleProvider();
  return provider.tools;
}

// ── Model Registry ──────────────────────────────────────

/**
 * Known model IDs and their provider routing.
 * Format: "provider:model-name"
 *
 * Cloud models (require API keys):
 *   google:gemini-2.5-flash                   — Fast multimodal, good for real-time frame analysis
 *   google:gemini-2.5-pro                     — Best quality, slower, for detailed scene understanding
 *   google:gemini-2.0-flash                   — Previous gen, still fast
 *   google:gemini-robotics-er-1.6-preview     — Embodied Reasoning: spatial understanding, instrument
 *                                               reading, physical-world task planning. 2-3x better than
 *                                               standard Gemini at spatial tasks. Free tier for vision I/O.
 *   google:gemini-robotics-er-1.5-preview     — Previous ER version, still available
 *   openai:gpt-4o                             — GPT-4o with vision
 *   openai:gpt-4o-mini                        — Cheaper/faster GPT-4o
 *
 * Local models via Ollama (no API key, port 11434):
 *   ollama:llava:13b              — LLaVA 13B, good vision-language model
 *   ollama:llava:7b               — LLaVA 7B, faster but less capable
 *   ollama:llama3.2-vision:11b    — Llama 3.2 Vision, Meta's VLM
 *   ollama:moondream              — Tiny VLM, very fast inference
 *   ollama:bakllava               — BakLLaVA, fine-tuned LLaVA variant
 *
 * Local models via LM Studio (no API key, port 1234):
 *   lmstudio:<loaded-model-name>  — Whatever model is loaded in LM Studio's server tab
 *   e.g. lmstudio:llava-v1.5-7b, lmstudio:phi-3-vision, lmstudio:internvl2
 *
 * Together.ai (API key, OpenAI-compatible):
 *   together:<together_model_id>  — e.g. together:meta-llama/Llama-3.2-11B-Vision-Instruct-Turbo
 */
export function getModel(modelId: string): LanguageModel {
  const [provider, ...rest] = modelId.split(":");
  const modelName = rest.join(":");  // rejoin in case model name has colons (e.g., llava:13b)

  if (!modelName && provider !== modelId) {
    throw new Error(`Invalid model ID "${modelId}" — expected format "provider:model-name"`);
  }

  switch (provider) {
    case "google":
      return getGoogleProvider()(modelName) as LanguageModel;
    case "openai":
      return getOpenAIProvider()(modelName) as LanguageModel;
    case "ollama":
      return getOllamaProvider().chat(modelName as any) as LanguageModel;
    case "lmstudio":
      return getLmStudioProvider().chat(modelName as any) as LanguageModel;
    case "together":
      return getTogetherProvider().chat(modelName as any) as LanguageModel;
    case "runpod":
      return getRunPodProvider().chat(modelName as any) as LanguageModel;
    default:
      // If no prefix, try to auto-detect from model name
      if (modelId.startsWith("gemini") || modelId.startsWith("gemma")) return getGoogleProvider()(modelId) as LanguageModel;
      if (modelId.startsWith("gpt")) return getOpenAIProvider()(modelId) as LanguageModel;
      // Default to Ollama for unknown models (local-first philosophy)
      return getOllamaProvider()(modelId) as LanguageModel;
  }
}

// ── Provider Status ─────────────────────────────────────

export interface ProviderStatus {
  name: string;
  available: boolean;
  configured: boolean;
  models: string[];
  error?: string;
}

/**
 * Check if a local OpenAI-compatible server is running and list its models.
 * Works for both Ollama (/api/tags) and LM Studio (/v1/models).
 */
async function probeLocalServer(
  baseUrl: string,
  type: "ollama" | "lmstudio" | "runpod",
  apiKey?: string,
): Promise<{ available: boolean; models: string[]; error?: string }> {
  let available = false;
  let models: string[] = [];
  let error: string | undefined;

  try {
    if (type === "ollama") {
      // Ollama has its own /api/tags endpoint
      const res = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        const data = await res.json() as { models?: { name: string }[] };
        available = true;
        models = (data.models ?? []).map((m) => m.name);
      }
    } else {
      // LM Studio, vLLM, and most OpenAI-compatible servers expose /v1/models.
      const headers = apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined;
      const res = await fetch(`${openAICompatibleBaseUrl(baseUrl)}/models`, {
        headers,
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) {
        const data = await res.json() as { data?: { id: string }[] };
        available = true;
        models = (data.data ?? []).map((m) => m.id);
      }
    }
  } catch (e: any) {
    error = `Not reachable at ${baseUrl}: ${e.message}`;
  }

  return { available, models, error };
}

/** Check which providers are configured and reachable */
export async function getProviderStatuses(): Promise<ProviderStatus[]> {
  const statuses: ProviderStatus[] = [];

  // Google
  statuses.push({
    name: "google",
    configured: !!config.google?.apiKey,
    available: !!config.google?.apiKey,
    models: config.google?.apiKey
      ? [
          "gemini-2.5-flash",
          "gemini-2.5-pro",
          "gemini-2.0-flash",
          "gemini-robotics-er-1.6-preview",
          "gemini-robotics-er-1.5-preview",
        ]
      : [],
  });

  // OpenAI
  statuses.push({
    name: "openai",
    configured: !!config.openai?.apiKey,
    available: !!config.openai?.apiKey,
    models: config.openai?.apiKey
      ? ["gpt-4o", "gpt-4o-mini"]
      : [],
  });

  // Ollama — probe local server
  const ollamaUrl = config.ollama?.baseUrl || "http://localhost:11434";
  const ollamaProbe = await probeLocalServer(ollamaUrl, "ollama");
  statuses.push({
    name: "ollama",
    configured: true,  // Ollama doesn't need config, just needs to be running
    available: ollamaProbe.available,
    models: ollamaProbe.models,
    error: ollamaProbe.error,
  });

  // LM Studio — probe local server
  const lmstudioUrl = config.lmstudio?.baseUrl || "http://localhost:1234";
  const lmstudioProbe = await probeLocalServer(lmstudioUrl, "lmstudio");
  statuses.push({
    name: "lmstudio",
    configured: true,  // LM Studio doesn't need config, just needs to be running
    available: lmstudioProbe.available,
    models: lmstudioProbe.models,
    error: lmstudioProbe.error,
  });

  // Together — list via OpenAI-compatible /v1/models (inference catalog)
  if (config.together?.apiKey) {
    const { ids, error } = await listTogetherModelIds(config.together.apiKey);
    const visionFirst = [...ids].sort((a, b) => {
      const av = /llava|vision|vl-|qwen.*vl|pixtral|moondream|internvl|mllama|florence|idefics/i.test(a) ? 0 : 1;
      const bv = /llava|vision|vl-|qwen.*vl|pixtral|moondream|internvl|mllama|florence|idefics/i.test(b) ? 0 : 1;
      return av - bv || a.localeCompare(b);
    });
    const cap = 72;
    statuses.push({
      name: "together",
      configured: true,
      available: ids.length > 0,
      models: visionFirst.slice(0, cap),
      error,
    });
  } else {
    statuses.push({
      name: "together",
      configured: false,
      available: false,
      models: [],
    });
  }

  // RunPod/vLLM - remote OpenAI-compatible endpoint
  if (config.runpod?.baseUrl) {
    const runpodProbe = await probeLocalServer(config.runpod.baseUrl, "runpod", config.runpod.apiKey);
    statuses.push({
      name: "runpod",
      configured: true,
      available: runpodProbe.available,
      models: runpodProbe.models,
      error: runpodProbe.error,
    });
  } else {
    statuses.push({
      name: "runpod",
      configured: false,
      available: false,
      models: [],
    });
  }

  return statuses;
}

/** Get all available model IDs across all configured providers */
export async function listAvailableModels(): Promise<string[]> {
  const statuses = await getProviderStatuses();
  const models: string[] = [];

  for (const status of statuses) {
    if (status.available) {
      for (const model of status.models) {
        models.push(`${status.name}:${model}`);
      }
    }
  }

  return models;
}
