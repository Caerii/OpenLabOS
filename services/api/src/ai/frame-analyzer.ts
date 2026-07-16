/**
 * Frame Analysis Pipeline — processes camera frames through VLMs for scene understanding.
 *
 * This is the core loop for LabOS's AI vision system:
 *   1. Taps MJPEG stream at configurable intervals
 *   2. Sends frames to selected VLM via Vercel AI SDK `getModel()` (Gemini, OpenAI, Together, Ollama, LM Studio)
 *   3. Returns structured analysis (objects, hands, scene description, etc.)
 *   4. Stores results in the data collection store for training data export
 *
 * Designed for recursive self-improvement: collected frame+annotation pairs
 * can be exported to fine-tune local models, which then produce better annotations,
 * which produce better training data, and so on.
 */

import { labosGenerateObject, labosGenerateText } from "./labos-inference.js";
import { prefersFreeformFrameAnalysis } from "./model-strategy.js";
import { collectFrameMetadata, type FrameMetadata } from "./frame-metadata.js";
import { getModule, getDefaultModule } from "./modules/registry.js";
import type { ScientificModule } from "./modules/types.js";
import { z } from "zod";
import http from "http";
import { getGlassesUrl, getToken, isWifiMode } from "../wifi-proxy.js";
import { getRecentStreamJpegIfFresh } from "../preview/mjpeg-last-frame.js";
import { previewFrameBuffer } from "../preview/rolling-frame-buffer.js";
import { dashboardApiPort } from "../runtime-config.js";

// ── Analysis Types ──────────────────────────────────────

/** What the VLM sees in a single frame */
export interface FrameAnalysis {
  timestamp: number;
  modelId: string;
  latencyMs: number;

  // Scene understanding
  scene: string;              // natural language scene description
  objects: DetectedObject[];  // objects visible in frame
  hands?: HandPose[];         // hand tracking results (if visible)
  text?: string[];            // OCR'd text in frame

  // Egocentric context (specific to smart glasses POV)
  activity?: string;          // what the wearer appears to be doing
  gazeTarget?: string;        // what the wearer seems to be looking at
  environment?: string;       // indoor/outdoor, lighting, setting type

  // Raw model output for debugging
  rawResponse?: string;

  // Frame-level metadata for scientific reproducibility
  metadata?: FrameMetadata;

  // Module system — which scientific module produced this analysis
  moduleId?: string;
  moduleVersion?: string;
  /** Raw module-specific structured output (schema varies by module) */
  moduleOutput?: any;
}

export interface DetectedObject {
  label: string;
  confidence?: number;
  region?: string;  // "center", "top-left", "bottom-right", etc.
}

export interface HandPose {
  side: "left" | "right";
  gesture?: string;           // "pointing", "grasping", "open", "pinch", etc.
  holding?: string;           // what the hand is holding, if anything
}

// ── Analysis Schemas (for structured output) ────────────

/** Zod schema for structured VLM output — forces consistent JSON from any model */
const frameAnalysisSchema = z.object({
  scene: z.string().describe("Brief description of the overall scene from an egocentric (first-person) perspective"),
  objects: z.array(z.object({
    label: z.string().describe("Object name/type"),
    confidence: z.number().min(0).max(1).optional().describe("Detection confidence 0-1"),
    region: z.string().optional().describe("Where in frame: center, top-left, top-right, bottom-left, bottom-right"),
  })).describe("Objects visible in the frame"),
  hands: z.array(z.object({
    side: z.enum(["left", "right"]),
    gesture: z.string().optional().describe("Hand gesture: pointing, grasping, open, pinch, thumbs-up, etc."),
    holding: z.string().optional().describe("What the hand is holding, if anything"),
  })).optional().describe("Hands visible in the frame"),
  text: z.array(z.string()).optional().describe("Any readable text visible in the frame"),
  activity: z.string().optional().describe("What the wearer appears to be doing"),
  gazeTarget: z.string().optional().describe("What the wearer seems to be looking at"),
  environment: z.string().optional().describe("Setting type: indoor/outdoor, office, kitchen, street, etc."),
});

// ── Frame Capture ───────────────────────────────────────

/** JPEG magic bytes — first 3 bytes of any valid JPEG file */
const JPEG_MAGIC = Buffer.from([0xFF, 0xD8, 0xFF]);

function dashboardLoopbackPreviewFrameTarget(): { hostname: string; port: number; path: string } {
  return { hostname: "127.0.0.1", port: dashboardApiPort(), path: "/api/preview/frame" };
}

/**
 * Grab a JPEG for ER / verify pipelines.
 *
 * 1) If `/api/preview/stream` is active (browser or any client), reuse the latest
 *    full frame parsed from that MJPEG (same `mLatestFrame` the device wraps in multipart).
 * 2) Otherwise GET `/api/preview/frame` (loopback or WiFi device router).
 */
export function captureFrame(): Promise<Buffer> {
  const streamed = getRecentStreamJpegIfFresh(4500);
  if (streamed) return Promise.resolve(streamed);
  return captureFrameViaHttp();
}

function captureFrameViaHttp(): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const wifi = isWifiMode();
    if (process.env.CLOUD_MODE === "true" && !wifi) {
      reject(new Error("Frame capture is unavailable in CLOUD_MODE without a device route; upload a test image instead."));
      return;
    }

    const target = wifi
      ? { hostname: new URL(getGlassesUrl()).hostname, port: 8080, path: "/api/preview/frame" }
      : dashboardLoopbackPreviewFrameTarget();

    const headers: Record<string, string> = {};
    const token = getToken();
    if (wifi && token) headers["X-LabOS-Token"] = token;

    const req = http.request(
      {
        hostname: target.hostname,
        port: target.port,
        path: target.path,
        method: "GET",
        timeout: wifi ? 8000 : 12000,
        ...(Object.keys(headers).length > 0 ? { headers } : {}),
      },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          req.destroy();
          reject(new Error(`Frame capture failed: HTTP ${res.statusCode} — is the camera streaming?`));
          return;
        }
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const buf = Buffer.concat(chunks);
          // Validate JPEG magic bytes to catch corrupted frames
          if (buf.length < 3 || buf[0] !== JPEG_MAGIC[0] || buf[1] !== JPEG_MAGIC[1] || buf[2] !== JPEG_MAGIC[2]) {
            reject(new Error(`Frame capture returned invalid JPEG data (${buf.length} bytes)`));
            return;
          }
          previewFrameBuffer.push(buf);
          resolve(buf);
        });
      }
    );
    req.on("error", (err) =>
      reject(new Error(`Frame capture failed (${wifi ? "WiFi → device :8080" : "loopback /api/preview/frame"}): ${err.message}`)),
    );
    req.on("timeout", () => { req.destroy(); reject(new Error("Frame capture timeout — preview server unreachable")); });
    req.end();
  });
}

// ── Analysis Functions ──────────────────────────────────

const SYSTEM_PROMPT = `You are a vision analysis system for LabOS smart glasses (an HMD-class smart-glasses device).
You receive first-person egocentric camera frames from glasses worn by a user.
Analyze what you see from this first-person perspective.

Focus on:
- What objects are visible and where they are in the frame
- Hand positions, gestures, and what they're manipulating
- Any readable text (signs, screens, labels, documents)
- The activity the wearer is performing
- The environment/setting

Be concise but thorough. This data feeds into a training pipeline for improving
egocentric understanding models, so accuracy matters more than prose quality.`;

/**
 * Analyze a single frame using structured output (generateObject).
 * Best for: Gemini, GPT-4o — models that support structured JSON output well.
 * When a scientific module is provided, uses the module's prompt and schema.
 */
export async function analyzeFrameStructured(
  frameBuffer: Buffer,
  modelId: string,
  metadata?: FrameMetadata,
  sciModule?: ScientificModule
): Promise<FrameAnalysis> {
  const start = Date.now();

  // Use module's config if provided, otherwise fall back to built-in defaults
  const systemPrompt = sciModule?.systemPrompt || SYSTEM_PROMPT;
  const schema = sciModule?.analysisSchema || frameAnalysisSchema;
  const userPrompt = sciModule?.userPrompt ||
    "Analyze this egocentric camera frame. Identify all objects, hands, text, and describe the scene and activity.";

  // Run module's preprocessor if available
  const processedFrame = sciModule?.preprocessFrame
    ? await sciModule.preprocessFrame(frameBuffer)
    : frameBuffer;

  const result = await labosGenerateObject({
    modelId,
    schema,
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: [
          { type: "image", image: processedFrame },
          { type: "text", text: userPrompt },
        ],
      },
    ],
  });

  const latencyMs = Date.now() - start;

  // Run module's postprocessor if available
  const output = sciModule?.postprocessResult
    ? sciModule.postprocessResult(result.object)
    : result.object;

  return {
    timestamp: start,
    modelId,
    latencyMs,
    // Extract standard fields if present (modules may or may not include them)
    scene: output.scene || "",
    objects: Array.isArray(output.objects) ? output.objects : [],
    hands: Array.isArray(output.hands) ? output.hands : undefined,
    text: Array.isArray(output.text) ? output.text : undefined,
    activity: output.activity,
    gazeTarget: output.gazeTarget,
    environment: output.environment,
    rawResponse: JSON.stringify(output),
    metadata,
    moduleId: sciModule?.id,
    moduleVersion: sciModule?.version,
    moduleOutput: output,
  };
}

/**
 * Analyze a single frame using free-form text output (generateText).
 * Fallback for local models (Ollama, LM Studio) that may not support
 * structured output schemas well. Parses JSON from the response manually.
 * When a scientific module is provided, uses the module's prompt.
 */
export async function analyzeFrameFreeform(
  frameBuffer: Buffer,
  modelId: string,
  metadata?: FrameMetadata,
  sciModule?: ScientificModule
): Promise<FrameAnalysis> {
  const start = Date.now();

  const systemPrompt = sciModule?.systemPrompt || SYSTEM_PROMPT;

  // For freeform, embed the expected JSON structure in the user prompt
  const defaultFreeformPrompt = `Analyze this egocentric camera frame. Respond in this exact JSON format:
{
  "scene": "brief scene description",
  "objects": [{"label": "object name", "region": "center/top-left/etc"}],
  "hands": [{"side": "left/right", "gesture": "gesture type", "holding": "what"}],
  "text": ["any visible text"],
  "activity": "what the wearer is doing",
  "gazeTarget": "what they're looking at",
  "environment": "setting type"
}`;

  const userPrompt = sciModule?.userPrompt
    ? `${sciModule.userPrompt}\n\nRespond with valid JSON only.`
    : defaultFreeformPrompt;

  // Run module's preprocessor if available
  const processedFrame = sciModule?.preprocessFrame
    ? await sciModule.preprocessFrame(frameBuffer)
    : frameBuffer;

  const result = await labosGenerateText({
    modelId,
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: [
          { type: "image", image: processedFrame },
          { type: "text", text: userPrompt },
        ],
      },
    ],
  });

  const latencyMs = Date.now() - start;

  // Try to parse JSON from the model's free-form response.
  // Models may wrap JSON in markdown code blocks, so we extract carefully.
  let parsed: any = {};
  try {
    // First try: look for JSON in a code block
    const codeBlockMatch = result.text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (codeBlockMatch) {
      parsed = JSON.parse(codeBlockMatch[1]);
    } else {
      // Second try: find the first complete JSON object (non-greedy)
      const jsonMatch = result.text.match(/\{[\s\S]*?\}(?=\s*$|\s*```)/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        // Last resort: try parsing the entire text as JSON
        parsed = JSON.parse(result.text.trim());
      }
    }
  } catch {
    // If all parsing fails, use the raw text as the scene description
    parsed = { scene: result.text.slice(0, 500) };
  }

  // Run module's postprocessor if available
  const output = sciModule?.postprocessResult
    ? sciModule.postprocessResult(parsed)
    : parsed;

  return {
    timestamp: start,
    modelId,
    latencyMs,
    scene: output.scene || result.text.slice(0, 500),
    objects: Array.isArray(output.objects) ? output.objects : [],
    hands: Array.isArray(output.hands) ? output.hands : undefined,
    text: Array.isArray(output.text) ? output.text : undefined,
    activity: output.activity,
    gazeTarget: output.gazeTarget,
    environment: output.environment,
    rawResponse: result.text,
    metadata,
    moduleId: sciModule?.id,
    moduleVersion: sciModule?.version,
    moduleOutput: output,
  };
}

/**
 * Smart analyze — picks structured or freeform based on model provider.
 * Cloud models (Gemini, GPT-4o) get structured output.
 * Local models (Ollama, LM Studio) get freeform with JSON parsing for reliability.
 *
 * When moduleId is provided, the corresponding scientific module's prompt and schema
 * are used instead of the defaults. This is what makes the pipeline domain-configurable.
 */
export async function analyzeFrame(
  frameBuffer: Buffer,
  modelId: string,
  opts?: { collectMetadata?: boolean; moduleId?: string }
): Promise<FrameAnalysis> {
  // Resolve scientific module (defaults to "general" which matches legacy behavior)
  const sciModule = opts?.moduleId
    ? getModule(opts.moduleId) || getDefaultModule()
    : undefined;

  // Collect frame metadata in parallel with model inference setup (adds ~20-50ms)
  const metadata = opts?.collectMetadata !== false
    ? await collectFrameMetadata(frameBuffer)
    : undefined;

  // Local OpenAI-compatible stacks: freeform + JSON parse (see model-strategy.ts).
  if (prefersFreeformFrameAnalysis(modelId)) {
    return analyzeFrameFreeform(frameBuffer, modelId, metadata, sciModule);
  }

  // Gemini, OpenAI, Together, etc. — `labos-inference` → `getModel` + AI SDK
  return analyzeFrameStructured(frameBuffer, modelId, metadata, sciModule);
}

// ── Continuous Analysis Loop ────────────────────────────

export interface AnalysisPipelineConfig {
  modelId: string;
  intervalMs: number;        // how often to analyze frames (e.g., 2000 = every 2 seconds)
  maxConcurrent: number;     // max parallel analyses (1 for local models, 3+ for cloud)
  /** Scientific module ID — drives prompts, schemas, and export format */
  moduleId?: string;
  /** Called with the analysis result AND the original frame buffer for dataset saving */
  onResult: (result: FrameAnalysis, frameBuffer: Buffer) => void;
  onError: (error: Error) => void;
}

export class AnalysisPipeline {
  private config: AnalysisPipelineConfig;
  private timer: ReturnType<typeof setInterval> | null = null;
  private activeCount = 0;
  private totalAnalyzed = 0;
  private totalErrors = 0;
  private _running = false;

  constructor(config: AnalysisPipelineConfig) {
    this.config = config;
  }

  get running() { return this._running; }
  get stats() {
    return {
      running: this._running,
      totalAnalyzed: this.totalAnalyzed,
      totalErrors: this.totalErrors,
      activeCount: this.activeCount,
      modelId: this.config.modelId,
      intervalMs: this.config.intervalMs,
      moduleId: this.config.moduleId,
    };
  }

  start() {
    if (this._running) return;
    this._running = true;

    console.log(`[AI] Starting analysis pipeline: model=${this.config.modelId}, interval=${this.config.intervalMs}ms`);

    this.timer = setInterval(async () => {
      // Skip if we're at max concurrent analyses
      if (this.activeCount >= this.config.maxConcurrent) return;

      this.activeCount++;
      try {
        // Capture once, analyze once, pass both to callback for optional dataset save
        const frame = await captureFrame();
        const result = await analyzeFrame(frame, this.config.modelId, {
          moduleId: this.config.moduleId,
        });
        this.totalAnalyzed++;
        this.config.onResult(result, frame);
      } catch (e: any) {
        this.totalErrors++;
        this.config.onError(e);
      } finally {
        this.activeCount--;
      }
    }, this.config.intervalMs);
  }

  stop() {
    if (!this._running) return;
    this._running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    console.log(`[AI] Pipeline stopped. Analyzed: ${this.totalAnalyzed}, Errors: ${this.totalErrors}`);
  }

  /** Update config on the fly (model, interval, concurrency) */
  updateConfig(partial: Partial<AnalysisPipelineConfig>) {
    const wasRunning = this._running;
    if (wasRunning) this.stop();

    // Validate before applying
    if (partial.intervalMs !== undefined && partial.intervalMs < 500) {
      partial.intervalMs = 500;  // minimum 500ms between analyses
    }
    if (partial.maxConcurrent !== undefined && partial.maxConcurrent < 1) {
      partial.maxConcurrent = 1;
    }

    Object.assign(this.config, partial);
    if (wasRunning) this.start();
  }
}
