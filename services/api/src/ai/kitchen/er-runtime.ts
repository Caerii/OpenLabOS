import { captureFrame } from "../frame-analyzer.js";
import { parseBoxDetections, parseERResponse, parsePointDetections } from "../er-utils.js";
import { labosGenerateText } from "../labos-inference.js";
import { providerIdFromModelId } from "../model-strategy.js";
import { getGoogleTools } from "../providers.js";
import { getModeConfig, type ERAnalysisMode } from "./er-modes.js";
import { uploadGeminiVideoFile } from "./gemini-video-upload.js";
import { isYouTubeUrl } from "./video-analysis.js";

export const DEFAULT_ER_MODEL = "google:gemini-robotics-er-1.6-preview";
export const FALLBACK_MODEL = "google:gemini-2.5-flash";

export interface RunEROptions {
  modelId?: string;
  frameBuffer?: Buffer;
  testImageUrl?: string;
  /** Optional before/after pair for visual-change verification. */
  beforeFrameBuffer?: Buffer;
  afterFrameBuffer?: Buffer;
  beforeImageUrl?: string;
  afterImageUrl?: string;
  /** YouTube video URL - passed as fileData to Gemini */
  videoUrl?: string;
  /** Local video chunk path - uploaded to Gemini Files API before analysis. */
  videoFilePath?: string;
  videoMimeType?: string;
  /** Optional clip window when using Gemini video understanding. */
  videoStartOffsetSec?: number;
  /** Optional clip window when using Gemini video understanding. */
  videoEndOffsetSec?: number;
  /** Optional video sampling rate override. */
  videoFps?: number;
  /** Enable Google Search grounding for real-time info */
  useSearch?: boolean;
  /** Thinking level override: minimal, low, medium, high */
  thinkingLevel?: "minimal" | "low" | "medium" | "high";
  /** Skip frame capture - for text-only queries (e.g., search grounding) */
  textOnly?: boolean;
}

export function extractEROptions(body: any): RunEROptions {
  const {
    modelId,
    testImage,
    testImageUrl,
    beforeImage,
    afterImage,
    beforeImageUrl,
    afterImageUrl,
    videoUrl,
    videoStartOffsetSec,
    videoEndOffsetSec,
    videoFps,
    useSearch,
    thinkingLevel,
    textOnly,
  } = body || {};
  return {
    modelId,
    frameBuffer: testImage ? Buffer.from(testImage, "base64") : undefined,
    testImageUrl,
    beforeFrameBuffer: beforeImage ? Buffer.from(beforeImage, "base64") : undefined,
    afterFrameBuffer: afterImage ? Buffer.from(afterImage, "base64") : undefined,
    beforeImageUrl,
    afterImageUrl,
    videoUrl,
    videoStartOffsetSec,
    videoEndOffsetSec,
    videoFps,
    useSearch,
    thinkingLevel,
    textOnly,
  };
}

export function hasBeforeAfterInputs(opts: RunEROptions): boolean {
  const hasBefore = !!opts.beforeFrameBuffer || !!opts.beforeImageUrl;
  const hasAfter = !!opts.afterFrameBuffer || !!opts.afterImageUrl;
  return hasBefore && hasAfter;
}

export function hasVideoChunkMetadata(opts: RunEROptions): boolean {
  return (
    !!opts.videoFilePath ||
    opts.videoStartOffsetSec !== undefined ||
    opts.videoEndOffsetSec !== undefined ||
    opts.videoFps !== undefined
  );
}

function extractProviderModelName(modelId: string) {
  const provider = providerIdFromModelId(modelId);
  return provider ? modelId.slice(provider.length + 1) : modelId;
}

function readGoogleApiKey() {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Google AI API key not configured. Set GOOGLE_GENERATIVE_AI_API_KEY.");
  }
  return apiKey;
}

function parseVideoOffsetSeconds(value: number | undefined, fieldName: string) {
  if (value === undefined) return undefined;
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${fieldName} must be a non-negative number`);
  }
  return `${value}s`;
}

function parseVideoFps(value: number | undefined) {
  if (value === undefined) return undefined;
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("videoFps must be a positive number");
  }
  return value;
}

export function buildGoogleVideoGenerateContentRequest(
  mode: ERAnalysisMode,
  opts: RunEROptions,
  videoUri = opts.videoUrl,
) {
  if (!videoUri) {
    throw new Error("videoUrl or videoFilePath is required for Google video requests");
  }

  const videoMetadata: Record<string, unknown> = {};
  const startOffset = parseVideoOffsetSeconds(opts.videoStartOffsetSec, "videoStartOffsetSec");
  const endOffset = parseVideoOffsetSeconds(opts.videoEndOffsetSec, "videoEndOffsetSec");
  const fps = parseVideoFps(opts.videoFps);

  if (startOffset) videoMetadata.startOffset = startOffset;
  if (endOffset) videoMetadata.endOffset = endOffset;
  if (fps !== undefined) videoMetadata.fps = fps;

  if (
    startOffset &&
    endOffset &&
    opts.videoStartOffsetSec !== undefined &&
    opts.videoEndOffsetSec !== undefined &&
    opts.videoEndOffsetSec <= opts.videoStartOffsetSec
  ) {
    throw new Error("videoEndOffsetSec must be greater than videoStartOffsetSec");
  }

  const modeConfig = getModeConfig(mode);
  const generationConfig: Record<string, unknown> = {
    temperature: modeConfig.temperature,
  };

  if (modeConfig.thinkingBudget !== undefined) {
    generationConfig.thinkingConfig = { thinkingBudget: modeConfig.thinkingBudget };
  }

  return {
    ...(mode.systemInstruction
      ? {
          systemInstruction: {
            parts: [{ text: mode.systemInstruction }],
          },
        }
      : {}),
    contents: [
      {
        role: "user",
        parts: [
          {
            fileData: {
              fileUri: videoUri,
              mimeType: opts.videoMimeType || "video/*",
            },
            ...(Object.keys(videoMetadata).length > 0 ? { videoMetadata } : {}),
          },
          {
            text: mode.prompt,
          },
        ],
      },
    ],
    generationConfig,
  };
}

async function uploadGoogleVideoFile(opts: RunEROptions) {
  if (!opts.videoFilePath) return null;
  return uploadGeminiVideoFile({
    videoFilePath: opts.videoFilePath,
    mimeType: opts.videoMimeType || "video/mp4",
    displayName: "labos-live-preview-chunk",
  });
}

async function runGoogleVideoMode(
  mode: ERAnalysisMode,
  modelId: string,
  opts: RunEROptions,
) {
  const modelName = extractProviderModelName(modelId);
  const apiKey = readGoogleApiKey();
  const uploaded = await uploadGoogleVideoFile(opts);
  try {
    const requestBody = buildGoogleVideoGenerateContentRequest(mode, opts, uploaded?.uri || opts.videoUrl);
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(requestBody),
      },
    );

    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message =
        json?.error?.message ||
        json?.error?.status ||
        `Google video request failed: HTTP ${response.status}`;
      throw new Error(message);
    }

    const rawText = json?.candidates?.[0]?.content?.parts
      ?.map((part: { text?: string }) => part?.text)
      .filter((value: unknown): value is string => typeof value === "string" && value.length > 0)
      .join("\n") || "";

    if (!rawText) {
      throw new Error("Google video request returned no text output");
    }

    return {
      rawText,
      sources: json?.candidates?.[0]?.groundingMetadata?.groundingChunks,
    };
  } finally {
    await uploaded?.cleanup().catch(() => {});
  }
}

async function loadImageFromUrl(url: string) {
  const imageResponse = await fetch(url);
  if (!imageResponse.ok) throw new Error(`Failed to fetch image: ${imageResponse.status}`);
  return Buffer.from(await imageResponse.arrayBuffer());
}

async function resolveImageInput(buffer: Buffer | undefined, url: string | undefined, label: string) {
  if (buffer) return buffer;
  if (url) return loadImageFromUrl(url);
  throw new Error(`${label} image is required`);
}

export async function runERMode(
  mode: ERAnalysisMode,
  opts: RunEROptions = {},
): Promise<{ raw: string; parsed: any; latencyMs: number; sources?: any[] }> {
  const start = Date.now();
  const resolvedModel = opts.modelId || DEFAULT_ER_MODEL;
  const modelProvider = providerIdFromModelId(resolvedModel);

  const modeConfig = getModeConfig(mode);

  if ((opts.videoUrl || opts.videoFilePath) && hasVideoChunkMetadata(opts)) {
    if (modelProvider !== "google") {
      throw new Error("Video chunk offsets/fps are currently only supported for Google Gemini models");
    }

    try {
      const result = await runGoogleVideoMode(mode, resolvedModel, opts);
      let parsed: any;

      try {
        if (mode.outputType === "points") {
          parsed = parsePointDetections(result.rawText);
        } else if (mode.outputType === "boxes") {
          parsed = parseBoxDetections(result.rawText);
        } else {
          parsed = parseERResponse(result.rawText);
        }
      } catch {
        parsed = { raw: result.rawText, parseError: true };
      }

      return {
        raw: result.rawText,
        parsed,
        latencyMs: Date.now() - start,
        ...(result.sources ? { sources: result.sources } : {}),
      };
    } catch (error: any) {
      if (resolvedModel === DEFAULT_ER_MODEL) {
        console.warn(`[Kitchen] ER video model failed (${error.message}), trying fallback...`);
        return runERMode(mode, { ...opts, modelId: FALLBACK_MODEL });
      }
      throw error;
    }
  }

  // Build content parts for the user message
  const contentParts: any[] = [];

  if (hasBeforeAfterInputs(opts)) {
    const before = await resolveImageInput(opts.beforeFrameBuffer, opts.beforeImageUrl, "before");
    const after = await resolveImageInput(opts.afterFrameBuffer, opts.afterImageUrl, "after");
    contentParts.push({ type: "image" as const, image: before });
    contentParts.push({ type: "image" as const, image: after });
  } else if (opts.videoUrl && isYouTubeUrl(opts.videoUrl)) {
    // YouTube video - passed as a file part with URL
    // @ai-sdk/google converts this to fileData { fileUri, mimeType } for Gemini
    contentParts.push({
      type: "file" as const,
      data: new URL(opts.videoUrl),
      mediaType: "video/*",
    });
  } else if (opts.frameBuffer) {
    contentParts.push({ type: "image" as const, image: opts.frameBuffer });
  } else if (opts.testImageUrl) {
    contentParts.push({ type: "image" as const, image: await loadImageFromUrl(opts.testImageUrl) });
  } else if (!opts.textOnly) {
    const frame = await captureFrame();
    contentParts.push({ type: "image" as const, image: frame });
  }

  contentParts.push({ type: "text" as const, text: mode.prompt });

  try {
    // Google Search + thinking budgets are Gemini-only (AI SDK provider options).
    const tools: Record<string, any> = {};
    if (opts.useSearch && modelProvider === "google") {
      try {
        const googleToolDefs = getGoogleTools();
        tools.google_search = googleToolDefs.googleSearch({});
      } catch {
        // Google Search not available - continue without it
      }
    }

    const providerOptions: Record<string, any> = {};
    if (
      modelProvider === "google" &&
      (opts.thinkingLevel || modeConfig.thinkingBudget !== undefined)
    ) {
      providerOptions.google = {
        thinkingConfig: opts.thinkingLevel
          ? { thinkingLevel: opts.thinkingLevel }
          : modeConfig.thinkingBudget !== undefined
            ? { thinkingBudget: modeConfig.thinkingBudget }
            : undefined,
      };
    }

    const result = await labosGenerateText({
      modelId: resolvedModel,
      messages: [
        ...(mode.systemInstruction
          ? [{ role: "system" as const, content: mode.systemInstruction }]
          : []),
        {
          role: "user" as const,
          content: contentParts,
        },
      ],
      temperature: modeConfig.temperature,
      ...(Object.keys(tools).length > 0 ? { tools } : {}),
      ...(Object.keys(providerOptions).length > 0 ? { providerOptions } : {}),
    });

    const rawText = result.text;
    let parsed: any;

    try {
      if (mode.outputType === "points") {
        parsed = parsePointDetections(rawText);
      } else if (mode.outputType === "boxes") {
        parsed = parseBoxDetections(rawText);
      } else {
        parsed = parseERResponse(rawText);
      }
    } catch {
      parsed = { raw: rawText, parseError: true };
    }

    const sources = (result as any).providerMetadata?.google?.groundingMetadata?.groundingChunks;
    return { raw: rawText, parsed, latencyMs: Date.now() - start, ...(sources ? { sources } : {}) };
  } catch (error: any) {
    if (resolvedModel === DEFAULT_ER_MODEL) {
      console.warn(`[Kitchen] ER model failed (${error.message}), trying fallback...`);
      return runERMode(mode, { ...opts, modelId: FALLBACK_MODEL });
    }
    throw error;
  }
}
