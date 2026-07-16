/**
 * Data Collection Store — persists frame+annotation pairs for training data.
 *
 * This is what makes LabOS a recursive self-improvement platform:
 *   1. Glasses capture egocentric video
 *   2. VLMs annotate frames (objects, hands, activities, text)
 *   3. Annotations are stored here as structured training data
 *   4. Data exports to COCO, YOLO, or custom formats for fine-tuning
 *   5. Fine-tuned local models replace cloud models → better annotations → repeat
 *
 * Storage: JSON-lines file on disk (one JSON object per line).
 * Simple, appendable, streamable, and trivially convertible to any ML format.
 * No database dependency — just files that can be rsync'd, git-tracked, or uploaded.
 */

import fs from "fs";
import path from "path";
import type { FrameAnalysis } from "./frame-analyzer.js";
import type { FrameMetadata } from "./frame-metadata.js";
import { parseJpegDimensions } from "./frame-metadata.js";
import type { SensorSnapshot } from "./sensor-bridge.js";
import { openLabosDataDir } from "../data-root.js";

// ── Configuration ───────────────────────────────────────

const DATA_DIR = openLabosDataDir();
const FRAMES_DIR = path.join(DATA_DIR, "frames");       // saved JPEG frames
const ANNOTATIONS_FILE = path.join(DATA_DIR, "annotations.jsonl");  // frame analysis results
const METADATA_FILE = path.join(DATA_DIR, "metadata.json");         // dataset metadata

// ── Types ───────────────────────────────────────────────

export interface AnnotationRecord {
  id: string;                    // unique ID for this annotation
  frameFile: string;             // filename of the saved JPEG frame
  timestamp: number;             // when the frame was captured
  modelId: string;               // which model produced this annotation
  latencyMs: number;             // inference time
  analysis: FrameAnalysis;       // full analysis result
  tags?: string[];               // manual tags for filtering (e.g., "indoor", "hand-visible")
  verified?: boolean;            // human-verified flag for high-quality training data
  qualityScore?: number;         // 0-1 quality score (set by multi-model agreement or human review)
  experimentId?: string;         // which experiment run produced this annotation
  metadata?: FrameMetadata;      // camera/device state at capture time (for reproducibility)
  frameWidth?: number;           // actual JPEG width in pixels
  frameHeight?: number;          // actual JPEG height in pixels
  moduleId?: string;             // which scientific module produced this annotation
  moduleVersion?: string;        // module version for reproducibility
  moduleOutput?: any;            // raw module-specific structured output (schema varies by module)
  sensorSnapshot?: SensorSnapshot;  // full sensor state at capture time (IMU, gesture, orientation)
}

export interface DatasetMetadata {
  name: string;
  description: string;
  created: number;
  lastUpdated: number;
  totalFrames: number;
  totalAnnotations: number;
  models: string[];              // which models have contributed annotations
  tags: Record<string, number>;  // tag → count
}

export interface DatasetStats {
  totalFrames: number;
  totalAnnotations: number;
  diskUsageMB: number;
  models: Record<string, number>;  // model → annotation count
  recentAnnotations: AnnotationRecord[];
}

// ── Region → Bbox Conversion ────────────────────────────

/**
 * Convert a VLM region label (e.g., "center", "top-left") to an approximate
 * COCO-format bounding box [x, y, width, height] using a 3x3 grid.
 *
 * The grid divides the image into 9 cells:
 *   top-left    | top-center    | top-right
 *   center-left | center        | center-right
 *   bottom-left | bottom-center | bottom-right
 *
 * Each cell covers 1/3 of the image in each dimension.
 * This is a coarse approximation — good enough for weak supervision
 * and as a starting point for active learning with bbox refinement.
 */
function regionToBbox(region: string | undefined, imgWidth: number, imgHeight: number): [number, number, number, number] {
  const cellW = Math.round(imgWidth / 3);
  const cellH = Math.round(imgHeight / 3);

  if (!region) {
    // No region info — default to center third of image
    return [cellW, cellH, cellW, cellH];
  }

  const r = region.toLowerCase().replace(/[-_]/g, " ").trim();

  // Map region strings to grid positions
  const colMap: Record<string, number> = { left: 0, center: 1, right: 2 };
  const rowMap: Record<string, number> = { top: 0, center: 1, middle: 1, bottom: 2 };

  let col = 1, row = 1; // default to center

  for (const [key, val] of Object.entries(colMap)) {
    if (r.includes(key)) { col = val; break; }
  }
  for (const [key, val] of Object.entries(rowMap)) {
    if (r.includes(key)) { row = val; break; }
  }

  return [col * cellW, row * cellH, cellW, cellH];
}

// ── Experiment Tracking ─────────────────────────────────

export interface Experiment {
  id: string;
  name?: string;
  startedAt: number;
  endedAt?: number;
  config: {
    modelId: string;
    intervalMs: number;
    maxConcurrent: number;
    saveToDataset: boolean;
  };
  metrics: {
    framesAnalyzed: number;
    errors: number;
    avgLatencyMs: number;
    totalLatencyMs: number;
  };
  deviceSnapshot?: {
    batteryLevel?: number;
    thermalMaxC?: number;
    cpuUsagePercent?: number;
  };
}

const EXPERIMENTS_FILE = path.join(DATA_DIR, "experiments.jsonl");

export async function saveExperiment(experiment: Experiment): Promise<void> {
  await fs.promises.mkdir(DATA_DIR, { recursive: true });
  await fs.promises.appendFile(EXPERIMENTS_FILE, JSON.stringify(experiment) + "\n");
}

export async function loadExperiments(): Promise<Experiment[]> {
  try {
    const content = await fs.promises.readFile(EXPERIMENTS_FILE, "utf-8");
    return content.trim().split("\n").filter(Boolean).map((line) => {
      try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean) as Experiment[];
  } catch {
    return [];
  }
}

// ── Store Implementation ────────────────────────────────

export class DataStore {
  private metadata: DatasetMetadata;
  private initialized = false;

  constructor() {
    this.metadata = {
      name: "labos-egocentric",
      description: "Egocentric vision data collected from LabOS smart glasses",
      created: Date.now(),
      lastUpdated: Date.now(),
      totalFrames: 0,
      totalAnnotations: 0,
      models: [],
      tags: {},
    };
  }

  /** Ensure data directories exist and load metadata */
  async init() {
    if (this.initialized) return;

    // Create directories
    await fs.promises.mkdir(FRAMES_DIR, { recursive: true });

    // Load existing metadata if present
    try {
      const raw = await fs.promises.readFile(METADATA_FILE, "utf-8");
      this.metadata = JSON.parse(raw);
    } catch {
      // First run — save initial metadata
      await this.saveMetadata();
    }

    this.initialized = true;
    console.log(`[DataStore] Initialized at ${DATA_DIR} — ${this.metadata.totalAnnotations} annotations`);
  }

  /** Save a frame + its analysis as a training data pair */
  async saveAnnotation(
    frameBuffer: Buffer,
    analysis: FrameAnalysis,
    tags?: string[],
    opts?: { experimentId?: string; qualityScore?: number; sensorSnapshot?: SensorSnapshot }
  ): Promise<AnnotationRecord> {
    await this.init();

    const id = `${analysis.timestamp}-${Math.random().toString(36).slice(2, 8)}`;
    const frameFile = `${id}.jpg`;
    const framePath = path.join(FRAMES_DIR, frameFile);

    // Save the JPEG frame
    await fs.promises.writeFile(framePath, frameBuffer);

    // Extract actual image dimensions from the JPEG buffer
    const dims = parseJpegDimensions(frameBuffer);

    // Build annotation record with full metadata
    const record: AnnotationRecord = {
      id,
      frameFile,
      timestamp: analysis.timestamp,
      modelId: analysis.modelId,
      latencyMs: analysis.latencyMs,
      analysis,
      tags,
      verified: false,
      qualityScore: opts?.qualityScore,
      experimentId: opts?.experimentId,
      metadata: analysis.metadata,
      frameWidth: dims?.width,
      frameHeight: dims?.height,
      moduleId: analysis.moduleId,
      moduleVersion: analysis.moduleVersion,
      moduleOutput: analysis.moduleOutput,
      sensorSnapshot: opts?.sensorSnapshot,
    };

    // Append to JSONL file (one JSON object per line — streamable, appendable)
    await fs.promises.appendFile(
      ANNOTATIONS_FILE,
      JSON.stringify(record) + "\n"
    );

    // Update metadata
    this.metadata.totalFrames++;
    this.metadata.totalAnnotations++;
    this.metadata.lastUpdated = Date.now();
    if (!this.metadata.models.includes(analysis.modelId)) {
      this.metadata.models.push(analysis.modelId);
    }
    if (tags) {
      for (const tag of tags) {
        this.metadata.tags[tag] = (this.metadata.tags[tag] || 0) + 1;
      }
    }
    await this.saveMetadata();

    return record;
  }

  /** Get dataset statistics */
  async getStats(): Promise<DatasetStats> {
    await this.init();

    // Calculate disk usage
    let diskUsageBytes = 0;
    try {
      const files = await fs.promises.readdir(FRAMES_DIR);
      for (const file of files) {
        const stat = await fs.promises.stat(path.join(FRAMES_DIR, file));
        diskUsageBytes += stat.size;
      }
      // Add annotations file size
      try {
        const aStat = await fs.promises.stat(ANNOTATIONS_FILE);
        diskUsageBytes += aStat.size;
      } catch { /* file may not exist yet */ }
    } catch { /* directory may not exist yet */ }

    // Count annotations per model
    const models: Record<string, number> = {};
    const recentAnnotations: AnnotationRecord[] = [];

    try {
      const lines = (await fs.promises.readFile(ANNOTATIONS_FILE, "utf-8")).trim().split("\n");
      for (const line of lines) {
        if (!line) continue;
        try {
          const record: AnnotationRecord = JSON.parse(line);
          models[record.modelId] = (models[record.modelId] || 0) + 1;
          recentAnnotations.push(record);
        } catch { /* skip malformed lines */ }
      }
    } catch { /* file may not exist yet */ }

    // Only keep last 20 annotations for the response
    const recent = recentAnnotations.slice(-20);

    return {
      totalFrames: this.metadata.totalFrames,
      totalAnnotations: this.metadata.totalAnnotations,
      diskUsageMB: Math.round(diskUsageBytes / (1024 * 1024) * 100) / 100,
      models,
      recentAnnotations: recent,
    };
  }

  /** Get annotations with optional filtering */
  async getAnnotations(opts?: {
    limit?: number;
    offset?: number;
    modelId?: string;
    tag?: string;
    verified?: boolean;
  }): Promise<{ annotations: AnnotationRecord[]; total: number }> {
    await this.init();

    const allRecords: AnnotationRecord[] = [];
    try {
      const lines = (await fs.promises.readFile(ANNOTATIONS_FILE, "utf-8")).trim().split("\n");
      for (const line of lines) {
        if (!line) continue;
        try {
          const record: AnnotationRecord = JSON.parse(line);

          // Apply filters
          if (opts?.modelId && record.modelId !== opts.modelId) continue;
          if (opts?.tag && (!record.tags || !record.tags.includes(opts.tag))) continue;
          if (opts?.verified !== undefined && record.verified !== opts.verified) continue;

          allRecords.push(record);
        } catch { /* skip malformed lines */ }
      }
    } catch {
      return { annotations: [], total: 0 };
    }

    const total = allRecords.length;
    const offset = opts?.offset || 0;
    const limit = opts?.limit || 50;
    const annotations = allRecords.slice(offset, offset + limit);

    return { annotations, total };
  }

  /**
   * Export dataset in COCO format for object detection training.
   * Uses actual JPEG dimensions (not hardcoded) and converts VLM region labels
   * to approximate bounding boxes using a 3x3 grid mapping.
   *
   * VLMs don't output pixel-precise bboxes, so region-based boxes are approximate.
   * The "labos" field on each annotation preserves full VLM output for downstream use.
   */
  async exportCOCO(): Promise<object> {
    await this.init();

    const images: any[] = [];
    const annotations: any[] = [];
    const categoriesMap = new Map<string, number>();
    let annotationId = 1;

    const records = (await this.getAnnotations({ limit: 999999 })).annotations;

    for (const record of records) {
      const imageId = images.length + 1;
      const w = record.frameWidth || 1920;
      const h = record.frameHeight || 1080;

      images.push({
        id: imageId,
        file_name: record.frameFile,
        width: w,
        height: h,
        date_captured: new Date(record.timestamp).toISOString(),
        // LabOS-specific: capture context for reproducibility
        labos_metadata: record.metadata ? {
          camera: record.metadata.camera,
          device: record.metadata.device,
          frameSequence: record.metadata.frameSequence,
        } : undefined,
      });

      // Convert detected objects to COCO annotations
      for (const obj of record.analysis.objects) {
        if (!categoriesMap.has(obj.label)) {
          categoriesMap.set(obj.label, categoriesMap.size + 1);
        }

        // Convert region label to approximate bbox using 3x3 grid
        const bbox = regionToBbox(obj.region, w, h);

        annotations.push({
          id: annotationId++,
          image_id: imageId,
          category_id: categoriesMap.get(obj.label),
          bbox,                            // [x, y, width, height] in pixels
          area: bbox[2] * bbox[3],
          iscrowd: 0,
          // LabOS-specific extensions (preserved but won't break standard COCO tools)
          labos: {
            region: obj.region,
            confidence: obj.confidence,
            bbox_source: obj.region ? "region_grid" : "unknown",  // how the bbox was derived
          },
        });
      }

      // Export hand annotations as COCO keypoints (if present)
      if (record.analysis.hands && record.analysis.hands.length > 0) {
        if (!categoriesMap.has("hand")) {
          categoriesMap.set("hand", categoriesMap.size + 1);
        }
        for (const hand of record.analysis.hands) {
          // Place hand bbox based on left/right side of frame
          const handX = hand.side === "left" ? 0 : w * 0.5;
          const handBbox = [handX, h * 0.4, w * 0.5, h * 0.6];

          annotations.push({
            id: annotationId++,
            image_id: imageId,
            category_id: categoriesMap.get("hand"),
            bbox: handBbox,
            area: handBbox[2] * handBbox[3],
            iscrowd: 0,
            labos: {
              side: hand.side,
              gesture: hand.gesture,
              holding: hand.holding,
              bbox_source: "side_heuristic",
            },
          });
        }
      }
    }

    const categories = Array.from(categoriesMap.entries()).map(([name, id]) => ({
      id,
      name,
      supercategory: name === "hand" ? "body" : "object",
    }));

    return {
      info: {
        description: this.metadata.description,
        version: "2.0",
        year: new Date().getFullYear(),
        contributor: "LabOS Data Collection Pipeline",
        date_created: new Date(this.metadata.created).toISOString(),
        labos_version: "0.3.0",
        note: "Bboxes are approximate (derived from VLM region labels, not pixel detection). Use labos.bbox_source field to filter by annotation quality.",
      },
      images,
      annotations,
      categories,
    };
  }

  /**
   * Export dataset as raw JSONL — preserves everything without lossy COCO conversion.
   * Best for custom training pipelines, scene classification, and activity recognition.
   * Each line is a complete AnnotationRecord with full metadata.
   */
  async exportJSONL(): Promise<string> {
    await this.init();
    try {
      return await fs.promises.readFile(ANNOTATIONS_FILE, "utf-8");
    } catch {
      return "";
    }
  }

  /** Mark an annotation as human-verified (high-quality training data) */
  async verifyAnnotation(id: string): Promise<boolean> {
    await this.init();

    // Read all lines, find and update the matching one, rewrite file
    try {
      const content = await fs.promises.readFile(ANNOTATIONS_FILE, "utf-8");
      const lines = content.trim().split("\n");
      let found = false;

      const updated = lines.map((line) => {
        if (!line) return line;
        try {
          const record: AnnotationRecord = JSON.parse(line);
          if (record.id === id) {
            record.verified = true;
            found = true;
            return JSON.stringify(record);
          }
        } catch { /* skip */ }
        return line;
      });

      if (found) {
        await fs.promises.writeFile(ANNOTATIONS_FILE, updated.join("\n") + "\n");
      }
      return found;
    } catch {
      return false;
    }
  }

  /** Delete all collected data (careful!) */
  async clearAll(): Promise<void> {
    try { await fs.promises.rm(FRAMES_DIR, { recursive: true, force: true }); } catch { /* ok */ }
    try { await fs.promises.unlink(ANNOTATIONS_FILE); } catch { /* ok */ }
    await fs.promises.mkdir(FRAMES_DIR, { recursive: true });
    this.metadata.totalFrames = 0;
    this.metadata.totalAnnotations = 0;
    this.metadata.models = [];
    this.metadata.tags = {};
    this.metadata.lastUpdated = Date.now();
    await this.saveMetadata();
  }

  private async saveMetadata() {
    await fs.promises.writeFile(METADATA_FILE, JSON.stringify(this.metadata, null, 2));
  }
}

/** Singleton data store instance */
export const dataStore = new DataStore();
