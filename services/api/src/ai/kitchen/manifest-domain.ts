import type { KitchenStepSegment } from "./run-store.js";
import type { KitchenSessionManifest } from "./session-manifest.js";

export interface ManifestShapeIssue {
  path: string;
  message: string;
}

export type ManifestShapeResult =
  | { ok: true; manifest: KitchenSessionManifest; issues: ManifestShapeIssue[] }
  | { ok: false; issues: ManifestShapeIssue[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function numberValue(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.length > 0)
    : [];
}

function arrayValue(value: unknown) {
  return Array.isArray(value) ? value : [];
}

export function normalizeKitchenStepSegment(value: unknown): KitchenStepSegment | null {
  if (!isRecord(value)) return null;
  const id = stringValue(value.id);
  const createdAt = stringValue(value.createdAt);
  const runId = stringValue(value.runId);
  const protocolId = stringValue(value.protocolId);
  const stepNumber = numberValue(value.stepNumber);
  const endedAt = numberValue(value.endedAt);
  const source = stringValue(value.source) as KitchenStepSegment["source"] | undefined;
  if (!id || !createdAt || !runId || !protocolId || !stepNumber || endedAt === undefined || !source) {
    return null;
  }
  return {
    id,
    createdAt,
    runId,
    protocolId,
    protocolName: stringValue(value.protocolName),
    stepNumber,
    attemptId: stringValue(value.attemptId),
    attemptNumber: numberValue(value.attemptNumber),
    supersedesAttemptId: stringValue(value.supersedesAttemptId),
    stepInstruction: stringValue(value.stepInstruction),
    startedAt: numberValue(value.startedAt),
    endedAt,
    durationMs: numberValue(value.durationMs),
    source,
    frameRefs: stringArray(value.frameRefs),
    chunkRefs: stringArray(value.chunkRefs),
    nativeRecording: isRecord(value.nativeRecording)
      ? {
          active: value.nativeRecording.active === true,
          activeVideoPath: stringValue(value.nativeRecording.activeVideoPath),
          lastVideoPath: stringValue(value.nativeRecording.lastVideoPath),
          startedAt: stringValue(value.nativeRecording.startedAt) || null,
          stoppedAt: stringValue(value.nativeRecording.stoppedAt) || null,
          healthRecording: value.nativeRecording.healthRecording === true,
          healthActiveVideoPath: stringValue(value.nativeRecording.healthActiveVideoPath),
          healthLastVideoPath: stringValue(value.nativeRecording.healthLastVideoPath),
        }
      : undefined,
    notes: stringArray(value.notes),
  };
}

export function validateKitchenSessionManifestShape(value: unknown): ManifestShapeResult {
  const issues: ManifestShapeIssue[] = [];
  if (!isRecord(value)) {
    return { ok: false, issues: [{ path: "$", message: "Kitchen session manifest must be an object." }] };
  }
  if (!isRecord(value.run)) {
    return { ok: false, issues: [{ path: "run", message: "Manifest run must be an object." }] };
  }
  const runId = stringValue(value.run.id);
  const protocolId = stringValue(value.run.protocolId);
  const protocolName = stringValue(value.run.protocolName);
  const status = stringValue(value.run.status);
  if (!runId) issues.push({ path: "run.id", message: "Run id is required." });
  if (!protocolId) issues.push({ path: "run.protocolId", message: "Protocol id is required." });
  if (!protocolName) issues.push({ path: "run.protocolName", message: "Protocol name is required." });
  if (!status) issues.push({ path: "run.status", message: "Run status is required." });
  if (!runId || !protocolId || !protocolName || !status) return { ok: false, issues };

  const rawSegments = arrayValue(value.stepSegments);
  const stepSegments = rawSegments
    .map(normalizeKitchenStepSegment)
    .filter((segment): segment is KitchenStepSegment => !!segment);
  if (stepSegments.length < rawSegments.length) {
    issues.push({
      path: "stepSegments",
      message: `${rawSegments.length - stepSegments.length} malformed step segment(s) were ignored.`,
    });
  }

  const manifest = {
    ...value,
    schemaVersion: value.schemaVersion === "labos.kitchen.session-manifest.v1"
      ? value.schemaVersion
      : "labos.kitchen.session-manifest.v1",
    generatedAt: stringValue(value.generatedAt) || new Date(0).toISOString(),
    run: {
      id: runId,
      protocolId,
      protocolName,
      status,
      createdAt: numberValue(value.run.createdAt) || 0,
      startedAt: numberValue(value.run.startedAt),
      endedAt: numberValue(value.run.endedAt),
      currentStepIndex: numberValue(value.run.currentStepIndex) || 0,
      metrics: isRecord(value.run.metrics) ? value.run.metrics : {},
    },
    steps: arrayValue(value.steps),
    stepAttempts: arrayValue(value.stepAttempts),
    stepSegments,
    frames: arrayValue(value.frames),
    chunks: arrayValue(value.chunks),
    adherence: arrayValue(value.adherence),
    stepAnalyses: arrayValue(value.stepAnalyses),
    events: arrayValue(value.events),
    exportHints: isRecord(value.exportHints)
      ? value.exportHints
      : {
          trainingRepoRawTarget: "openlabos-training/data/raw/openlabos-runs",
          stableJoinKeys: [],
        },
  } as KitchenSessionManifest;

  return { ok: true, manifest, issues };
}

export function coerceKitchenSessionManifest(value: unknown): KitchenSessionManifest {
  const result = validateKitchenSessionManifestShape(value);
  if (!result.ok) {
    throw new Error(`Invalid kitchen session manifest: ${result.issues.map((issue) => `${issue.path} ${issue.message}`).join("; ")}`);
  }
  return result.manifest;
}
