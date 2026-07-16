interface OllamaVersionResponse {
  version: string;
}

interface OllamaTagsResponse {
  models?: any[];
}

interface LmStudioModelsResponse {
  data?: Array<{ id: string; object?: string }>;
}

async function fetchJson<T>(url: string, timeoutMs: number, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export function getOllamaBaseUrl() {
  return process.env.OLLAMA_BASE_URL || "http://localhost:11434";
}

export async function fetchOllamaModels(ollamaUrl = getOllamaBaseUrl()) {
  const tags = await fetchJson<OllamaTagsResponse>(`${ollamaUrl}/api/tags`, 3000);
  return tags.models || [];
}

export async function getOllamaStatus() {
  const ollamaUrl = getOllamaBaseUrl();
  try {
    const [version, models] = await Promise.all([
      fetchJson<OllamaVersionResponse>(`${ollamaUrl}/api/version`, 3000),
      fetchOllamaModels(ollamaUrl),
    ]);
    return {
      available: true,
      url: ollamaUrl,
      version: version.version,
      models,
      gpuNote: "RTX 4090 - 24GB VRAM, supports 7B-13B VLMs at real-time speeds",
    };
  } catch (e: any) {
    return {
      available: false,
      url: ollamaUrl,
      error: e.message,
      installHint: "Install Ollama: https://ollama.com/download - then run: ollama pull llava:7b",
    };
  }
}

export async function pullOllamaModel(model: string, ollamaUrl = getOllamaBaseUrl()) {
  return fetchJson(
    `${ollamaUrl}/api/pull`,
    600000,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: model, stream: false }),
    },
  );
}

export function getLmStudioBaseUrl() {
  return process.env.LMSTUDIO_BASE_URL || "http://localhost:1234";
}

export async function fetchLmStudioModels(lmstudioUrl = getLmStudioBaseUrl()) {
  const models = await fetchJson<LmStudioModelsResponse>(`${lmstudioUrl}/v1/models`, 3000);
  return models.data || [];
}

export async function getLmStudioStatus() {
  const lmstudioUrl = getLmStudioBaseUrl();
  try {
    const models = await fetchLmStudioModels(lmstudioUrl);
    return {
      available: true,
      url: lmstudioUrl,
      models: models.map((model) => ({
        name: model.id,
        type: model.object || "model",
      })),
    };
  } catch (e: any) {
    return {
      available: false,
      url: lmstudioUrl,
      error: e.message,
      installHint: "Install LM Studio: https://lmstudio.ai - load a model and start the local server (port 1234)",
    };
  }
}
