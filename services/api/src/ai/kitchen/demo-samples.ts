import fs from "node:fs/promises";
import path from "node:path";

export interface KitchenDemoSample {
  sampleId: string;
  sourceId: string;
  title: string;
  uploader: string;
  videoUrl: string;
  protocolId: string;
  recipe: string;
  stepHint: string;
  labelHint: string;
  split: string;
  clipStartSec: number;
  clipEndSec: number;
  clipDurationSec: number;
  targetFps: number;
  frameCount: number;
  notes?: string;
  previewVideoUrl?: string;
  frameUrls?: string[];
}

export interface KitchenDemoSamplesResult {
  configured: boolean;
  manifestPath?: string;
  samples: KitchenDemoSample[];
  error?: string;
}

function defaultManifestCandidates() {
  const cwd = process.cwd();
  const rels = [
    path.join("data", "raw", "youtube_egocentric_kitchen_seed", "manifests", "samples.jsonl"),
    path.join("data", "raw", "youtube_qwen35_seed", "manifests", "samples.jsonl"),
  ];
  const roots = [
    path.resolve(cwd, "..", "openlabos-training"),
    path.resolve(cwd, "..", "..", "openlabos-training"),
    cwd,
  ];
  return [
    process.env.KITCHEN_DEMO_SAMPLES_MANIFEST,
    ...roots.flatMap((root) => rels.map((rel) => path.resolve(root, rel))),
  ].filter((candidate): candidate is string => !!candidate);
}

async function firstExistingPath(candidates: string[]) {
  for (const candidate of candidates) {
    const resolved = path.resolve(candidate);
    try {
      const stat = await fs.stat(resolved);
      if (stat.isFile()) return resolved;
    } catch {}
  }
  return undefined;
}

function toNumber(value: unknown, fallback = 0) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toStringField(value: unknown, fallback = "") {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

async function readJsonl(filePath: string) {
  try {
    const text = await fs.readFile(filePath, "utf-8");
    return text
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter((row): row is any => !!row);
  } catch (e: any) {
    if (e?.code === "ENOENT") return [];
    throw e;
  }
}

async function loadSourceMap(manifestPath: string) {
  const rows = await readJsonl(path.join(path.dirname(manifestPath), "sources.jsonl"));
  const entries: Array<[string, any]> = [];
  for (const row of rows) {
    const sourceId = String(row.source_id || "");
    if (sourceId) entries.push([sourceId, row]);
  }
  return new Map<string, any>(entries);
}

async function loadFramePathMap(manifestPath: string) {
  const rows = await readJsonl(path.join(path.dirname(manifestPath), "frames.jsonl"));
  const grouped = new Map<string, any[]>();
  for (const row of rows) {
    const sampleId = String(row.sample_id || "");
    if (!sampleId || typeof row.image_path !== "string") continue;
    const group = grouped.get(sampleId) || [];
    group.push(row);
    grouped.set(sampleId, group);
  }
  const out = new Map<string, string[]>();
  for (const [sampleId, group] of grouped) {
    out.set(
      sampleId,
      group
        .sort((a, b) => toNumber(a.frame_index, toNumber(a.timestamp_ms)) - toNumber(b.frame_index, toNumber(b.timestamp_ms)))
        .map((row) => String(row.image_path)),
    );
  }
  return out;
}

function normalizeSample(
  raw: any,
  sources = new Map<string, any>(),
  framePathsBySample = new Map<string, string[]>(),
): KitchenDemoSample | null {
  const sampleId = typeof raw?.sample_id === "string" ? raw.sample_id : "";
  const sourceId = String(raw?.source_id || "");
  const source = sourceId ? sources.get(sourceId) : undefined;
  const videoUrl =
    toStringField(raw?.url) ||
    toStringField(source?.url) ||
    toStringField(raw?.local_path) ||
    toStringField(source?.local_path) ||
    toStringField(raw?.clip_path);
  if (!videoUrl || !sampleId) return null;

  const encodedSampleId = encodeURIComponent(sampleId);
  const framePaths = Array.isArray(raw.frame_paths) ? raw.frame_paths : (framePathsBySample.get(sampleId) || []);

  return {
    sampleId,
    sourceId,
    title: toStringField(raw.title, toStringField(source?.title, toStringField(raw.query, "Kitchen demo clip"))),
    uploader: toStringField(raw.uploader, toStringField(source?.uploader, toStringField(raw.source, toStringField(source?.source)))),
    videoUrl,
    protocolId: toStringField(raw.protocol_id, toStringField(source?.protocol_id, "kitchen-tea-v1")),
    recipe: toStringField(raw.recipe, toStringField(source?.recipe, "tea")),
    stepHint: toStringField(raw.step_hint, toStringField(source?.step_hint)),
    labelHint: toStringField(raw.label_hint, toStringField(source?.label_hint)),
    split: toStringField(raw.split, toStringField(source?.split, "demo")),
    clipStartSec: toNumber(raw.clip_start_ms) / 1000,
    clipEndSec: toNumber(raw.clip_end_ms) / 1000,
    clipDurationSec: toNumber(raw.clip_duration_seconds),
    targetFps: toNumber(raw.target_fps, 2),
    frameCount: toNumber(raw.frame_count, framePaths.length),
    notes: toStringField(raw.notes, toStringField(source?.notes)) || undefined,
    previewVideoUrl: raw.clip_path ? `/api/kitchen/demo/samples/${encodedSampleId}/clip` : undefined,
    frameUrls: framePaths
      .slice(0, 12)
      .map((_framePath: unknown, index: number) => `/api/kitchen/demo/samples/${encodedSampleId}/frames/${index}`),
  };
}

export async function listKitchenDemoSamples(limit = 48): Promise<KitchenDemoSamplesResult> {
  const manifestPath = await firstExistingPath(defaultManifestCandidates());
  if (!manifestPath) {
    return {
      configured: false,
      samples: [],
      error: "No kitchen demo sample manifest found. Run labos-ingest-video-sources or set KITCHEN_DEMO_SAMPLES_MANIFEST.",
    };
  }

  const [rows, sources, framePathsBySample] = await Promise.all([
    readJsonl(manifestPath),
    loadSourceMap(manifestPath),
    loadFramePathMap(manifestPath),
  ]);
  const samples = rows
    .map((row) => normalizeSample(row, sources, framePathsBySample))
    .filter((sample): sample is KitchenDemoSample => !!sample)
    .slice(0, Math.max(1, limit));

  return {
    configured: true,
    manifestPath,
    samples,
  };
}

export async function resolveKitchenDemoSampleAsset(
  sampleId: string,
  asset: { type: "clip" } | { type: "frame"; index: number },
): Promise<string | null> {
  const manifestPath = await firstExistingPath(defaultManifestCandidates());
  if (!manifestPath) return null;

  const [rows, framePathsBySample] = await Promise.all([
    readJsonl(manifestPath),
    loadFramePathMap(manifestPath),
  ]);
  for (const raw of rows) {
    try {
      if (raw?.sample_id !== sampleId) continue;
      if (asset.type === "clip") return typeof raw.clip_path === "string" ? raw.clip_path : null;
      const framePaths = Array.isArray(raw.frame_paths) ? raw.frame_paths : (framePathsBySample.get(sampleId) || []);
      return typeof framePaths[asset.index] === "string" ? framePaths[asset.index] : null;
    } catch {}
  }
  return null;
}
