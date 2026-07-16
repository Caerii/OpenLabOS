import fs from "fs";
import path from "path";
import type { FrameMetadata } from "./frame-metadata.js";
import { parseJpegDimensions } from "./frame-metadata.js";

const DATA_DIR = path.resolve(process.cwd(), "data");
const FRAMES_DIR = path.join(DATA_DIR, "supervision-frames");
const PAIRS_FILE = path.join(DATA_DIR, "supervision-pairs.jsonl");

export interface SupervisionModelResult {
  modelId: string;
  latencyMs: number;
  raw: string;
  parsed: any;
  validSchema: boolean;
  validationError?: string;
}

export interface SupervisionPairRecord {
  id: string;
  frameFile: string;
  timestamp: number;
  taskType: string;
  protocolId?: string;
  stepNumber?: number;
  stepId?: string;
  prompt: string;
  teacher: SupervisionModelResult;
  student: SupervisionModelResult;
  agreement?: Record<string, unknown>;
  tags?: string[];
  metadata?: FrameMetadata;
  frameWidth?: number;
  frameHeight?: number;
}

async function ensureSupervisionStore() {
  await fs.promises.mkdir(FRAMES_DIR, { recursive: true });
}

export async function saveSupervisionPair(
  frameBuffer: Buffer,
  pair: Omit<SupervisionPairRecord, "id" | "frameFile" | "frameWidth" | "frameHeight">,
) {
  await ensureSupervisionStore();

  const id = `${pair.timestamp}-${Math.random().toString(36).slice(2, 8)}`;
  const frameFile = `${id}.jpg`;
  const framePath = path.join(FRAMES_DIR, frameFile);
  const dims = parseJpegDimensions(frameBuffer);

  await fs.promises.writeFile(framePath, frameBuffer);

  const record: SupervisionPairRecord = {
    ...pair,
    id,
    frameFile,
    frameWidth: dims?.width,
    frameHeight: dims?.height,
  };

  await fs.promises.appendFile(PAIRS_FILE, JSON.stringify(record) + "\n");
  return record;
}
