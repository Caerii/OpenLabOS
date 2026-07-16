import path from "path";
import {
  listKitchenSessionManifests,
  readKitchenSessionManifestFile,
  type KitchenSavedManifestSummary,
  type KitchenStepSegment,
} from "./run-store.js";

export interface KitchenMediaEvidenceLink {
  runId: string;
  manifestRef: string;
  protocolId?: string;
  protocolName?: string;
  runStatus?: string;
  stepNumber?: number;
  stepInstruction?: string;
  segmentId?: string;
  attemptId?: string;
  attemptNumber?: number;
  attemptStatus?: string;
  savedAt?: string;
  adherenceActions: string[];
  deviationCount: number;
}

export interface KitchenMediaEvidenceSummary {
  evidenceLinks: KitchenMediaEvidenceLink[];
  linkedRunCount: number;
  deviationCount: number;
}

export type KitchenManifestLike = {
  run?: {
    protocolId?: string;
    protocolName?: string;
    status?: string;
  };
  adherence?: Array<{
    stepNumber?: number;
    action?: string;
  }>;
  stepAttempts?: Array<{
    attemptId?: string;
    status?: string;
  }>;
  stepSegments?: KitchenStepSegment[];
};

export interface KitchenMediaEvidenceManifestInput {
  summary: KitchenSavedManifestSummary;
  manifest?: KitchenManifestLike | null;
}

let mediaEvidenceCache: { at: number; map: Map<string, KitchenMediaEvidenceLink[]> } | null = null;

export function clearKitchenMediaEvidenceCache() {
  mediaEvidenceCache = null;
}

export function kitchenMediaPathKeys(filePath: string) {
  const normalized = filePath.replace(/^\/storage\/emulated\/0\//, "/sdcard/");
  return new Set([filePath, normalized, path.posix.basename(filePath)].filter(Boolean));
}

export function nativeRecordingPathsForKitchenSegment(segment: Pick<KitchenStepSegment, "nativeRecording">): string[] {
  const nativeRecording = segment.nativeRecording;
  if (!nativeRecording) return [];
  const activePaths = [
    nativeRecording.activeVideoPath,
    nativeRecording.healthActiveVideoPath,
  ].filter((value): value is string => typeof value === "string" && value.length > 0);
  const fallbackPaths = [
    nativeRecording.lastVideoPath,
    nativeRecording.healthLastVideoPath,
  ].filter((value): value is string => typeof value === "string" && value.length > 0);
  return [...new Set(activePaths.length ? activePaths : fallbackPaths)];
}

function addEvidenceLink(
  map: Map<string, KitchenMediaEvidenceLink[]>,
  filePath: string,
  link: KitchenMediaEvidenceLink,
) {
  for (const key of kitchenMediaPathKeys(filePath)) {
    const existing = map.get(key) || [];
    if (!existing.some((item) => (
      item.runId === link.runId &&
      item.segmentId === link.segmentId &&
      item.stepNumber === link.stepNumber
    ))) {
      existing.push(link);
    }
    map.set(key, existing);
  }
}

function adherenceByStep(manifest: KitchenManifestLike) {
  const map = new Map<number, string[]>();
  for (const adherence of manifest.adherence || []) {
    const stepNumber = Number(adherence?.stepNumber);
    const action = String(adherence?.action || "");
    if (!stepNumber || !action) continue;
    const actions = map.get(stepNumber) || [];
    actions.push(action);
    map.set(stepNumber, actions);
  }
  return map;
}

function attemptsById(manifest: KitchenManifestLike) {
  return new Map<string, { status?: string }>(
    (manifest.stepAttempts || [])
      .filter((attempt) => typeof attempt?.attemptId === "string")
      .map((attempt) => [attempt.attemptId!, attempt]),
  );
}

function buildLinkForSegment(
  summary: KitchenSavedManifestSummary,
  manifest: KitchenManifestLike,
  segment: KitchenStepSegment,
  actions: string[],
  attemptStatus?: string,
): KitchenMediaEvidenceLink {
  return {
    runId: summary.runId,
    manifestRef: summary.manifestRef,
    protocolId: manifest.run?.protocolId || summary.protocolId,
    protocolName: manifest.run?.protocolName || summary.protocolName,
    runStatus: manifest.run?.status || summary.status,
    stepNumber: Number(segment.stepNumber) || undefined,
    stepInstruction: segment.stepInstruction,
    segmentId: segment.id,
    attemptId: segment.attemptId,
    attemptNumber: segment.attemptNumber,
    attemptStatus,
    savedAt: summary.savedAt,
    adherenceActions: [...new Set(actions)],
    deviationCount: actions.filter((action) => action === "possible_deviation" || action === "blocked").length,
  };
}

export function buildKitchenMediaEvidenceMapFromManifests(
  entries: KitchenMediaEvidenceManifestInput[],
): Map<string, KitchenMediaEvidenceLink[]> {
  const map = new Map<string, KitchenMediaEvidenceLink[]>();
  for (const { summary, manifest } of entries) {
    if (!manifest) continue;

    const actionsByStep = adherenceByStep(manifest);
    const attempts = attemptsById(manifest);
    for (const segment of manifest.stepSegments || []) {
      const nativePaths = nativeRecordingPathsForKitchenSegment(segment);
      if (nativePaths.length === 0) continue;
      const actions = actionsByStep.get(Number(segment.stepNumber)) || [];
      const attempt = segment.attemptId ? attempts.get(segment.attemptId) : null;
      const link = buildLinkForSegment(summary, manifest, segment, actions, attempt?.status);
      for (const nativePath of nativePaths) addEvidenceLink(map, nativePath, link);
    }
  }
  return map;
}

export async function buildKitchenMediaEvidenceMap(): Promise<Map<string, KitchenMediaEvidenceLink[]>> {
  const summaries = await listKitchenSessionManifests();
  const entries = await Promise.all(summaries.map(async (summary) => ({
    summary,
    manifest: await readKitchenSessionManifestFile(summary.runId).catch(() => null) as KitchenManifestLike | null,
  })));
  return buildKitchenMediaEvidenceMapFromManifests(entries);
}

export async function getKitchenMediaEvidenceMap(opts: { ttlMs?: number } = {}) {
  const ttlMs = opts.ttlMs ?? 30_000;
  if (mediaEvidenceCache && Date.now() - mediaEvidenceCache.at < ttlMs) {
    return mediaEvidenceCache.map;
  }
  const map = await buildKitchenMediaEvidenceMap();
  mediaEvidenceCache = { at: Date.now(), map };
  return map;
}

export function kitchenEvidenceLinksForMediaPath(
  map: Map<string, KitchenMediaEvidenceLink[]>,
  filePath: string,
) {
  for (const key of kitchenMediaPathKeys(filePath)) {
    const links = map.get(key);
    if (links?.length) return links;
  }
  return [];
}

export async function summarizeKitchenMediaEvidence(filePath: string): Promise<KitchenMediaEvidenceSummary> {
  const evidenceLinks = kitchenEvidenceLinksForMediaPath(await getKitchenMediaEvidenceMap(), filePath);
  return {
    evidenceLinks,
    linkedRunCount: new Set(evidenceLinks.map((link) => link.runId)).size,
    deviationCount: evidenceLinks.reduce((total, link) => total + link.deviationCount, 0),
  };
}

export async function enrichKitchenMediaEvidenceEntries<T extends { path: string }>(
  entries: T[],
): Promise<Array<T & KitchenMediaEvidenceSummary>> {
  const evidenceMap = await getKitchenMediaEvidenceMap();
  return entries.map((entry) => {
    const evidenceLinks = kitchenEvidenceLinksForMediaPath(evidenceMap, entry.path);
    return {
      ...entry,
      evidenceLinks,
      linkedRunCount: new Set(evidenceLinks.map((link) => link.runId)).size,
      deviationCount: evidenceLinks.reduce((total, link) => total + link.deviationCount, 0),
    };
  });
}

export {
  listKitchenSessionManifests,
  readKitchenSessionManifestFile,
};
