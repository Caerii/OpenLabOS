import crypto from "node:crypto";

export type EntitySegmentationProvider = "mock" | "sidecar" | "disabled";
export type EntityBoxFormat = "xyxy_pixel" | "er_yxyx_norm_1000";

export interface EntityBox {
  format: EntityBoxFormat;
  value: [number, number, number, number];
}

export interface EntityMask {
  encoding: "coco_rle" | "polygon" | "png_base64";
  coordinateFrame?: "pixel" | "normalized_1000";
  size?: [number, number];
  counts?: string;
  points?: Array<[number, number]>;
  data?: string;
  areaPx?: number;
}

export interface EntityObservation {
  entityId: string;
  trackId?: string;
  label: string;
  confidence: number;
  box?: EntityBox;
  mask?: EntityMask;
  centroid?: { x: number; y: number; coordinateFrame: "pixel" | "normalized_1000" };
  attributes?: Record<string, unknown>;
  source: EntitySegmentationProvider | "sidecar-normalized";
}

export interface EntityTrack {
  trackId: string;
  label: string;
  observationIds: string[];
  confidence: number;
  firstSeenAtMs?: number;
  lastSeenAtMs?: number;
}

export interface EntitySegmentationRequest {
  frameBuffer?: Buffer;
  imageUrl?: string;
  prompts: string[];
  includeMasks?: boolean;
  includeTracks?: boolean;
  sessionId?: string;
  frameId?: string;
  timestampMs?: number;
}

export interface EntitySegmentationResult {
  provider: EntitySegmentationProvider;
  configured: boolean;
  latencyMs: number;
  prompts: string[];
  observations: EntityObservation[];
  tracks: EntityTrack[];
  summary: {
    objectsFound: string[];
    missingPrompts: string[];
    averageConfidence: number;
    hasMasks: boolean;
    hasTracks: boolean;
  };
  warnings: string[];
}

export interface EntitySegmentationStatus {
  mode: EntitySegmentationProvider;
  configured: boolean;
  sidecarUrl?: string;
  authConfigured: boolean;
  health?: {
    ok: boolean;
    backend?: string;
    authRequired?: boolean;
  };
  error?: string;
}

function cleanPrompts(prompts: string[]) {
  return [...new Set(
    prompts
      .map((prompt) => String(prompt || "").trim())
      .filter(Boolean),
  )];
}

function segmentationMode(): EntitySegmentationProvider {
  const mode = String(process.env.LABOS_ENTITY_SEGMENTATION_MODE || "").trim().toLowerCase();
  if (mode === "off" || mode === "disabled" || mode === "none") return "disabled";
  if (mode === "sidecar") return "sidecar";
  if (mode === "mock") return "mock";
  return sidecarUrl() ? "sidecar" : "mock";
}

function sidecarUrl() {
  return (
    process.env.LABOS_SEGMENTATION_SIDECAR_URL ||
    process.env.SEGMENTATION_SIDECAR_URL ||
    ""
  ).trim();
}

function sidecarToken() {
  return (
    process.env.LABOS_SEGMENTATION_SIDECAR_TOKEN ||
    process.env.SEGMENTATION_SIDECAR_TOKEN ||
    ""
  ).trim();
}

function sidecarEndpoint(url: string) {
  const trimmed = url.replace(/\/+$/, "");
  return /\/(segment|entity-segmentation|infer)$/i.test(trimmed)
    ? trimmed
    : `${trimmed}/segment`;
}

function idFor(label: string, index: number, frameId?: string) {
  const hash = crypto
    .createHash("sha1")
    .update(`${frameId || "frame"}:${label}:${index}`)
    .digest("hex")
    .slice(0, 10);
  return `ent_${hash}`;
}

function boxForIndex(index: number): [number, number, number, number] {
  const col = index % 3;
  const row = Math.floor(index / 3) % 3;
  const x1 = 90 + col * 285;
  const y1 = 120 + row * 220;
  const x2 = Math.min(960, x1 + 190);
  const y2 = Math.min(920, y1 + 160);
  return [y1, x1, y2, x2];
}

function polygonFromBox(box: [number, number, number, number]): Array<[number, number]> {
  const [y1, x1, y2, x2] = box;
  return [[x1, y1], [x2, y1], [x2, y2], [x1, y2]];
}

function buildSummary(
  prompts: string[],
  observations: EntityObservation[],
  tracks: EntityTrack[],
): EntitySegmentationResult["summary"] {
  const labels = observations.map((observation) => observation.label.toLowerCase());
  const missingPrompts = prompts.filter((prompt) => {
    const normalized = prompt.toLowerCase();
    return !labels.some((label) => label.includes(normalized) || normalized.includes(label));
  });
  const averageConfidence = observations.length
    ? observations.reduce((sum, item) => sum + item.confidence, 0) / observations.length
    : 0;
  return {
    objectsFound: observations.map((observation) => observation.label),
    missingPrompts,
    averageConfidence,
    hasMasks: observations.some((observation) => !!observation.mask),
    hasTracks: tracks.length > 0,
  };
}

function mockSegmentation(input: EntitySegmentationRequest, start: number): EntitySegmentationResult {
  const prompts = cleanPrompts(input.prompts);
  const observations = prompts.map((label, index) => {
    const box = boxForIndex(index);
    const entityId = idFor(label, index, input.frameId);
    return {
      entityId,
      trackId: input.includeTracks === false ? undefined : `track_${label.toLowerCase().replace(/[^a-z0-9]+/g, "_") || index}`,
      label,
      confidence: 0.62,
      box: { format: "er_yxyx_norm_1000" as const, value: box },
      centroid: {
        x: Math.round((box[1] + box[3]) / 2),
        y: Math.round((box[0] + box[2]) / 2),
        coordinateFrame: "normalized_1000" as const,
      },
      mask: input.includeMasks === false
        ? undefined
        : {
            encoding: "polygon" as const,
            coordinateFrame: "normalized_1000" as const,
            points: polygonFromBox(box),
          },
      attributes: { mock: true },
      source: "mock" as const,
    };
  });
  const tracks = input.includeTracks === false
    ? []
    : observations.map((observation) => ({
        trackId: observation.trackId!,
        label: observation.label,
        observationIds: [observation.entityId],
        confidence: observation.confidence,
        firstSeenAtMs: input.timestampMs,
        lastSeenAtMs: input.timestampMs,
      }));

  return {
    provider: "mock",
    configured: false,
    latencyMs: Date.now() - start,
    prompts,
    observations,
    tracks,
    summary: buildSummary(prompts, observations, tracks),
    warnings: [
      "entity_segmentation_mock: set LABOS_SEGMENTATION_SIDECAR_URL to use SAM/Grounded-SAM output",
    ],
  };
}

function asNumberTuple(value: unknown): [number, number, number, number] | undefined {
  if (!Array.isArray(value) || value.length < 4) return undefined;
  const nums = value.slice(0, 4).map(Number);
  return nums.every(Number.isFinite) ? nums as [number, number, number, number] : undefined;
}

function normalizeBox(raw: any): EntityBox | undefined {
  const erBox = asNumberTuple(raw?.box_2d || raw?.boxYxyx || raw?.erBox);
  if (erBox) return { format: "er_yxyx_norm_1000", value: erBox };
  const xyxy = asNumberTuple(raw?.bbox || raw?.box || raw?.xyxy);
  if (xyxy) return { format: "xyxy_pixel", value: xyxy };
  return undefined;
}

function normalizeMask(raw: any): EntityMask | undefined {
  const mask = raw?.mask || raw?.segmentation;
  if (!mask) return undefined;
  if (typeof mask === "string") {
    return { encoding: "png_base64", data: mask };
  }
  if (mask.counts && mask.size) {
    return {
      encoding: "coco_rle",
      size: mask.size,
      counts: mask.counts,
      areaPx: Number.isFinite(Number(mask.area)) ? Number(mask.area) : undefined,
    };
  }
  if (Array.isArray(mask.points) || Array.isArray(mask.polygon)) {
    return {
      encoding: "polygon",
      coordinateFrame: mask.coordinateFrame || "pixel",
      points: (mask.points || mask.polygon).map((point: any) => [Number(point[0]), Number(point[1])]),
    };
  }
  return undefined;
}

function normalizeSidecarPayload(payload: any, input: EntitySegmentationRequest, start: number): EntitySegmentationResult {
  const prompts = cleanPrompts(input.prompts);
  const rawItems = Array.isArray(payload?.observations)
    ? payload.observations
    : Array.isArray(payload?.entities)
      ? payload.entities
      : Array.isArray(payload?.annotations)
        ? payload.annotations
        : [];

  const observations: EntityObservation[] = rawItems.map((item: any, index: number) => {
    const label = String(item.label || item.class_name || item.name || prompts[index] || `entity-${index + 1}`);
    const entityId = String(item.entityId || item.id || idFor(label, index, input.frameId));
    const trackId = item.trackId || item.track_id || item.instance_id;
    const box = normalizeBox(item);
    return {
      entityId,
      ...(trackId ? { trackId: String(trackId) } : {}),
      label,
      confidence: Math.max(0, Math.min(1, Number(item.confidence ?? item.score ?? 0.5))),
      ...(box ? { box } : {}),
      ...(normalizeMask(item) ? { mask: normalizeMask(item) } : {}),
      ...(item.centroid ? { centroid: item.centroid } : {}),
      ...(item.attributes ? { attributes: item.attributes } : {}),
      source: "sidecar-normalized",
    };
  });

  const tracks: EntityTrack[] = Array.isArray(payload?.tracks)
    ? payload.tracks.map((track: any) => ({
        trackId: String(track.trackId || track.track_id || track.id),
        label: String(track.label || track.class_name || "entity"),
        observationIds: Array.isArray(track.observationIds) ? track.observationIds.map(String) : [],
        confidence: Math.max(0, Math.min(1, Number(track.confidence ?? 0.5))),
        firstSeenAtMs: Number.isFinite(Number(track.firstSeenAtMs)) ? Number(track.firstSeenAtMs) : undefined,
        lastSeenAtMs: Number.isFinite(Number(track.lastSeenAtMs)) ? Number(track.lastSeenAtMs) : undefined,
      }))
    : observations
        .filter((observation) => !!observation.trackId)
        .map((observation) => ({
          trackId: observation.trackId!,
          label: observation.label,
          observationIds: [observation.entityId],
          confidence: observation.confidence,
        }));

  return {
    provider: "sidecar",
    configured: true,
    latencyMs: Date.now() - start,
    prompts,
    observations,
    tracks,
    summary: buildSummary(prompts, observations, tracks),
    warnings: Array.isArray(payload?.warnings) ? payload.warnings.map(String) : [],
  };
}

async function runSidecar(input: EntitySegmentationRequest, start: number): Promise<EntitySegmentationResult> {
  const url = sidecarUrl();
  if (!url) {
    return {
      provider: "sidecar",
      configured: false,
      latencyMs: Date.now() - start,
      prompts: cleanPrompts(input.prompts),
      observations: [],
      tracks: [],
      summary: buildSummary(cleanPrompts(input.prompts), [], []),
      warnings: ["entity_segmentation_sidecar_unconfigured"],
    };
  }

  const response = await fetch(sidecarEndpoint(url), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(sidecarToken() ? { authorization: `Bearer ${sidecarToken()}` } : {}),
    },
    body: JSON.stringify({
      imageBase64: input.frameBuffer?.toString("base64"),
      imageUrl: input.imageUrl,
      prompts: cleanPrompts(input.prompts),
      includeMasks: input.includeMasks !== false,
      includeTracks: input.includeTracks !== false,
      sessionId: input.sessionId,
      frameId: input.frameId,
      timestampMs: input.timestampMs,
      outputFormat: "labos.entity-segmentation.v1",
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || payload?.message || `Segmentation sidecar failed: HTTP ${response.status}`);
  }
  return normalizeSidecarPayload(payload, input, start);
}

export async function runEntitySegmentation(input: EntitySegmentationRequest): Promise<EntitySegmentationResult> {
  const start = Date.now();
  const prompts = cleanPrompts(input.prompts);
  if (!prompts.length) {
    throw new Error("At least one segmentation prompt is required");
  }

  const mode = segmentationMode();
  if (mode === "disabled") {
    return {
      provider: "disabled",
      configured: false,
      latencyMs: Date.now() - start,
      prompts,
      observations: [],
      tracks: [],
      summary: buildSummary(prompts, [], []),
      warnings: ["entity_segmentation_disabled"],
    };
  }

  if (mode === "sidecar") {
    return runSidecar({ ...input, prompts }, start);
  }

  return mockSegmentation({ ...input, prompts }, start);
}

export async function getEntitySegmentationStatus(probe = false): Promise<EntitySegmentationStatus> {
  const mode = segmentationMode();
  const url = sidecarUrl();
  const token = sidecarToken();
  const status: EntitySegmentationStatus = {
    mode,
    configured: mode === "sidecar" ? !!url : mode === "mock",
    ...(url ? { sidecarUrl: url } : {}),
    authConfigured: !!token,
  };

  if (!probe || mode !== "sidecar" || !url) {
    return status;
  }

  try {
    const response = await fetch(`${url.replace(/\/+$/, "")}/health`, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
    const body = await response.json().catch(() => ({}));
    status.health = {
      ok: response.ok && body?.ok !== false,
      backend: body?.backend,
      authRequired: body?.authRequired,
    };
    if (!response.ok) status.error = body?.error || body?.detail || `HTTP ${response.status}`;
  } catch (error: any) {
    status.health = { ok: false };
    status.error = error?.message || String(error);
  }

  return status;
}
