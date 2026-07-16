import { GoogleGenAI, type GoogleGenAIOptions } from "@google/genai";

export type GoogleGenAIAuthMode = "gemini-api-key" | "vertex-adc";

export interface GoogleGenAIClientConfig {
  configured: boolean;
  mode: GoogleGenAIAuthMode | "unconfigured";
  apiVersion?: string;
  apiKeyEnv?: "GOOGLE_GENERATIVE_AI_API_KEY" | "GOOGLE_API_KEY" | "GEMINI_API_KEY";
  project?: string;
  location?: string;
  missing: string[];
}

function clean(value: string | undefined) {
  return value?.trim() || "";
}

function readApiKey(env: NodeJS.ProcessEnv) {
  const candidates = [
    ["GOOGLE_GENERATIVE_AI_API_KEY", clean(env.GOOGLE_GENERATIVE_AI_API_KEY)] as const,
    ["GOOGLE_API_KEY", clean(env.GOOGLE_API_KEY)] as const,
    ["GEMINI_API_KEY", clean(env.GEMINI_API_KEY)] as const,
  ];
  return candidates.find(([, value]) => Boolean(value)) || null;
}

export function getGoogleGenAIClientConfig(
  env: NodeJS.ProcessEnv = process.env,
  opts: { apiVersion?: string } = {},
): GoogleGenAIClientConfig {
  const useVertex = clean(env.GOOGLE_GENAI_USE_VERTEXAI).toLowerCase() === "true";
  if (useVertex) {
    const project = clean(env.GOOGLE_CLOUD_PROJECT);
    const location = clean(env.GOOGLE_CLOUD_LOCATION) || "us-central1";
    const missing = project ? [] : ["GOOGLE_CLOUD_PROJECT"];
    return {
      configured: missing.length === 0,
      mode: missing.length === 0 ? "vertex-adc" : "unconfigured",
      apiVersion: opts.apiVersion,
      project,
      location,
      missing,
    };
  }

  const apiKey = readApiKey(env);
  if (apiKey) {
    return {
      configured: true,
      mode: "gemini-api-key",
      apiVersion: opts.apiVersion,
      apiKeyEnv: apiKey[0],
      missing: [],
    };
  }

  return {
    configured: false,
    mode: "unconfigured",
    apiVersion: opts.apiVersion,
    missing: ["GOOGLE_GENERATIVE_AI_API_KEY or GOOGLE_GENAI_USE_VERTEXAI=true + GOOGLE_CLOUD_PROJECT"],
  };
}

export function createGoogleGenAI(
  env: NodeJS.ProcessEnv = process.env,
  opts: { apiVersion?: string } = {},
) {
  const config = getGoogleGenAIClientConfig(env, opts);
  if (!config.configured) {
    throw new Error(`Google GenAI is not configured. Missing: ${config.missing.join(", ")}.`);
  }

  let clientOptions: GoogleGenAIOptions;
  if (config.mode === "vertex-adc") {
    clientOptions = {
      vertexai: true,
      project: config.project,
      location: config.location,
      apiVersion: config.apiVersion,
    };
  } else {
    const apiKey = readApiKey(env)?.[1];
    clientOptions = {
      apiKey,
      apiVersion: config.apiVersion,
    };
  }

  return new GoogleGenAI(clientOptions);
}
