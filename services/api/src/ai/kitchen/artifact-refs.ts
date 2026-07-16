import path from "path";
import { getKitchenDataPaths } from "./run-store.js";

export type KitchenArtifactKind = "frame" | "chunk" | "native_video";

export interface KitchenArtifactRef {
  ref: string;
  kind: KitchenArtifactKind;
  localPath: string;
}

const ARTIFACT_PREFIXES: Record<KitchenArtifactKind, string> = {
  frame: "kitchen/frames/",
  chunk: "kitchen/chunks/",
  native_video: "kitchen/native-videos/",
};

function kindForRef(ref: string, allowedKinds?: KitchenArtifactKind[]) {
  const kinds = allowedKinds?.length ? allowedKinds : Object.keys(ARTIFACT_PREFIXES) as KitchenArtifactKind[];
  return kinds.find((kind) => ref.startsWith(ARTIFACT_PREFIXES[kind]));
}

export function normalizeKitchenArtifactRef(
  ref: string,
  opts: { allowedKinds?: KitchenArtifactKind[] } = {},
) {
  const trimmed = ref.trim().replace(/\\/g, "/");
  if (!trimmed || trimmed.includes("\0") || path.posix.isAbsolute(trimmed)) {
    throw new Error("Invalid kitchen artifact ref");
  }
  const normalized = path.posix.normalize(trimmed);
  const kind = kindForRef(normalized, opts.allowedKinds);
  if (!kind) {
    const allowed = (opts.allowedKinds?.length ? opts.allowedKinds : Object.keys(ARTIFACT_PREFIXES))
      .map((item) => ARTIFACT_PREFIXES[item as KitchenArtifactKind])
      .join(", ");
    throw new Error(`Kitchen artifact ref must start with one of: ${allowed}`);
  }
  return { ref: normalized, kind };
}

export function resolveKitchenArtifactRef(
  ref: string,
  opts: { allowedKinds?: KitchenArtifactKind[] } = {},
): KitchenArtifactRef {
  const normalized = normalizeKitchenArtifactRef(ref, opts);
  const { dataDir } = getKitchenDataPaths();
  const localPath = path.resolve(dataDir, normalized.ref);
  const dataRoot = path.resolve(dataDir);
  if (localPath !== dataRoot && !localPath.startsWith(`${dataRoot}${path.sep}`)) {
    throw new Error("Kitchen artifact ref escapes data root");
  }
  return { ...normalized, localPath };
}

export function isSafeKitchenArtifactRef(
  ref: unknown,
  opts: { allowedKinds?: KitchenArtifactKind[] } = {},
): ref is string {
  if (typeof ref !== "string") return false;
  try {
    resolveKitchenArtifactRef(ref, opts);
    return true;
  } catch {
    return false;
  }
}

export function isSafeKitchenFrameRef(ref: unknown): ref is string {
  return isSafeKitchenArtifactRef(ref, { allowedKinds: ["frame"] });
}

export function kitchenArtifactUrl(ref: string, opts: { download?: boolean } = {}) {
  const { ref: normalized } = normalizeKitchenArtifactRef(ref);
  const query = new URLSearchParams({ ref: normalized });
  if (opts.download) query.set("download", "1");
  return `/api/kitchen/session/artifact?${query.toString()}`;
}
