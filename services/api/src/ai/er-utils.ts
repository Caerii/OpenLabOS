/**
 * Gemini Robotics ER 1.6 — Coordinate parsing and response utilities.
 *
 * The ER model uses a normalized coordinate system:
 * - All coordinates range from 0 to 1000 (not pixels, not 0-1)
 * - Points are [y, x] (row-major — y first!)
 * - Bounding boxes are [ymin, xmin, ymax, xmax]
 * - The model wraps JSON in markdown fences that must be stripped
 *
 * This module provides parsing, conversion, and validation utilities
 * for working with ER's spatial output in the LabOS pipeline.
 */

// ── Coordinate Types ────────────────────────────────────

/** ER normalized point: [y, x] in range 0-1000 */
export type ERPoint = [number, number];

/** ER normalized bounding box: [ymin, xmin, ymax, xmax] in range 0-1000 */
export type ERBoundingBox = [number, number, number, number];

/** A detected object with a single point and label */
export interface ERPointDetection {
  point: ERPoint;
  label: string;
}

/** A detected object with a bounding box and label */
export interface ERBoxDetection {
  box_2d: ERBoundingBox;
  label: string;
}

/** A detected object with box + segmentation mask */
export interface ERSegmentationDetection {
  box_2d: ERBoundingBox;
  label: string;
  mask: string;  // base64-encoded PNG: "data:image/png;base64,..."
}

/** Pixel coordinates after denormalization */
export interface PixelPoint {
  x: number;
  y: number;
}

/** Pixel bounding box after denormalization */
export interface PixelBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Trajectory: ordered sequence of points with step labels */
export interface ERTrajectory {
  points: ERPointDetection[];
  startLabel: string;
  endLabel: string;
}

// ── JSON Response Parsing ───────────────────────────────

/**
 * Strip markdown code fences from ER model output.
 * The model often wraps JSON responses in ```json ... ``` blocks.
 */
export function stripCodeFences(text: string): string {
  // Remove ```json and ``` wrappers
  let cleaned = text.trim();

  // Handle ```json\n...\n```
  if (cleaned.startsWith("```")) {
    const firstNewline = cleaned.indexOf("\n");
    if (firstNewline !== -1) {
      cleaned = cleaned.slice(firstNewline + 1);
    }
    if (cleaned.endsWith("```")) {
      cleaned = cleaned.slice(0, -3);
    }
  }

  return cleaned.trim();
}

/**
 * Parse ER model JSON response — handles markdown fences, trailing commas,
 * and other common LLM JSON quirks.
 */
export function parseERResponse<T = any>(rawText: string): T {
  const cleaned = stripCodeFences(rawText);

  try {
    return JSON.parse(cleaned);
  } catch (e) {
    // Try removing trailing commas (common LLM mistake)
    const noTrailingCommas = cleaned
      .replace(/,\s*}/g, "}")
      .replace(/,\s*]/g, "]");
    try {
      return JSON.parse(noTrailingCommas);
    } catch {
      throw new Error(`Failed to parse ER response as JSON: ${(e as Error).message}\nRaw: ${rawText.slice(0, 200)}`);
    }
  }
}

// ── Coordinate Conversion ───────────────────────────────

/**
 * Convert ER normalized point [y, x] (0-1000) to pixel coordinates.
 * Note: ER uses [y, x] order — this converts to {x, y} for standard use.
 */
export function erPointToPixel(
  point: ERPoint,
  imageWidth: number,
  imageHeight: number
): PixelPoint {
  const [yNorm, xNorm] = point;
  return {
    x: Math.round((xNorm / 1000) * imageWidth),
    y: Math.round((yNorm / 1000) * imageHeight),
  };
}

/**
 * Convert pixel coordinates to ER normalized [y, x] format.
 */
export function pixelToERPoint(
  pixel: PixelPoint,
  imageWidth: number,
  imageHeight: number
): ERPoint {
  return [
    Math.round((pixel.y / imageHeight) * 1000),
    Math.round((pixel.x / imageWidth) * 1000),
  ];
}

/**
 * Convert ER normalized bounding box [ymin, xmin, ymax, xmax] to pixel rect.
 */
export function erBoxToPixel(
  box: ERBoundingBox,
  imageWidth: number,
  imageHeight: number
): PixelBox {
  const [ymin, xmin, ymax, xmax] = box;
  const x = Math.round((xmin / 1000) * imageWidth);
  const y = Math.round((ymin / 1000) * imageHeight);
  const x2 = Math.round((xmax / 1000) * imageWidth);
  const y2 = Math.round((ymax / 1000) * imageHeight);
  return {
    x,
    y,
    width: x2 - x,
    height: y2 - y,
  };
}

/**
 * Convert pixel rect back to ER normalized bounding box.
 */
export function pixelToERBox(
  rect: PixelBox,
  imageWidth: number,
  imageHeight: number
): ERBoundingBox {
  return [
    Math.round((rect.y / imageHeight) * 1000),
    Math.round((rect.x / imageWidth) * 1000),
    Math.round(((rect.y + rect.height) / imageHeight) * 1000),
    Math.round(((rect.x + rect.width) / imageWidth) * 1000),
  ];
}

// ── Detection Result Parsing ────────────────────────────

/**
 * Parse an array of point detections from ER response text.
 * Expected format: [{"point": [y, x], "label": "..."}, ...]
 */
export function parsePointDetections(rawText: string): ERPointDetection[] {
  const data = parseERResponse<ERPointDetection[]>(rawText);
  if (!Array.isArray(data)) {
    throw new Error(`Expected array of point detections, got: ${typeof data}`);
  }
  return data.filter(
    (d) => d.point && Array.isArray(d.point) && d.point.length === 2 && d.label
  );
}

/**
 * Parse an array of bounding box detections from ER response text.
 * Expected format: [{"box_2d": [ymin, xmin, ymax, xmax], "label": "..."}, ...]
 */
export function parseBoxDetections(rawText: string): ERBoxDetection[] {
  const data = parseERResponse<ERBoxDetection[]>(rawText);
  if (!Array.isArray(data)) {
    throw new Error(`Expected array of box detections, got: ${typeof data}`);
  }
  return data.filter(
    (d) => d.box_2d && Array.isArray(d.box_2d) && d.box_2d.length === 4 && d.label
  );
}

/**
 * Parse a trajectory response (ordered points labeled "0", "1", ... "N").
 */
export function parseTrajectory(rawText: string): ERTrajectory {
  const points = parsePointDetections(rawText);
  // Sort by numeric label
  const sorted = [...points].sort(
    (a, b) => parseInt(a.label) - parseInt(b.label)
  );
  return {
    points: sorted,
    startLabel: sorted[0]?.label ?? "0",
    endLabel: sorted[sorted.length - 1]?.label ?? String(sorted.length - 1),
  };
}

// ── Thinking Budget Presets ─────────────────────────────

/**
 * Thinking budget presets for different ER task types.
 * These control how much "reasoning" the model does before responding.
 *
 * - FAST (0): No thinking. Best for simple detection, pointing, bounding boxes.
 * - MEDIUM (1024): Light thinking. For spatial reasoning, "make room for X".
 * - THOROUGH (-1): Unlimited. Physical reasoning, complex counting, weight limits.
 * - DEFAULT (undefined): Model decides. Good for trajectories.
 */
export const ER_THINKING = {
  /** No thinking — fast detection and pointing */
  FAST: 0,
  /** Light reasoning — spatial queries */
  MEDIUM: 1024,
  /** Full reasoning — physical constraints, complex planning */
  THOROUGH: -1,
  /** Model decides — trajectory planning */
  DEFAULT: undefined,
} as const;

export type ERThinkingBudget = typeof ER_THINKING[keyof typeof ER_THINKING];

// ── Prompt Templates ────────────────────────────────────

/**
 * Standard prompt suffixes used across ER analysis modes.
 * These tell the model what output format to use.
 */
export const ER_PROMPTS = {
  /** Point detection output format instruction */
  POINT_FORMAT: `The answer should follow the JSON format:
[{"point": <point>, "label": <label>}]
The points are in [y, x] format normalized to 0-1000.`,

  /** Bounding box output format instruction */
  BOX_FORMAT: `Return bounding boxes as a JSON array with labels. Never return masks or code fencing.
The format should be:
[{"box_2d": [ymin, xmin, ymax, xmax], "label": <label for the object>}]
normalized to 0-1000. The values in box_2d must only be integers.`,

  /** Trajectory output format instruction */
  TRAJECTORY_FORMAT: `The points should be labeled by order of the trajectory, from '0' (start point) to <n> (final point).
The answer should follow the JSON format:
[{"point": <point>, "label": <step_number>}]
The points are in [y, x] format normalized to 0-1000.`,

  /** Success detection format */
  SUCCESS_FORMAT: `Answer with JSON in the format:
{"success": true/false, "confidence": 0.0-1.0, "reasoning": "brief explanation"}`,

  /** Instrument reading format */
  INSTRUMENT_FORMAT: `Read the instrument/display and return JSON:
{"reading": <value>, "unit": "<unit>", "confidence": 0.0-1.0, "instrument_type": "<type>"}`,

  /** System instruction for JSON-only responses */
  JSON_SYSTEM: `Be precise. When JSON is requested, reply with ONLY that JSON (no preface, no markdown code fence, no text before or after). Use numeric literals for numbers. For confidence, use a float in [0,1] reflecting how certain you are given image quality and visibility.`,
} as const;

// ── Validation Utilities ────────────────────────────────

/** Check if a point is within valid ER coordinate range */
export function isValidERPoint(point: ERPoint): boolean {
  return (
    Array.isArray(point) &&
    point.length === 2 &&
    point[0] >= 0 && point[0] <= 1000 &&
    point[1] >= 0 && point[1] <= 1000
  );
}

/** Check if a bounding box is valid (non-zero area, within range) */
export function isValidERBox(box: ERBoundingBox): boolean {
  if (!Array.isArray(box) || box.length !== 4) return false;
  const [ymin, xmin, ymax, xmax] = box;
  return (
    ymin >= 0 && ymin <= 1000 &&
    xmin >= 0 && xmin <= 1000 &&
    ymax >= 0 && ymax <= 1000 &&
    xmax >= 0 && xmax <= 1000 &&
    ymax > ymin &&
    xmax > xmin
  );
}

/** Calculate area of an ER bounding box (in normalized units²) */
export function erBoxArea(box: ERBoundingBox): number {
  const [ymin, xmin, ymax, xmax] = box;
  return (ymax - ymin) * (xmax - xmin);
}

/** Calculate IoU (intersection over union) between two ER boxes */
export function erBoxIoU(boxA: ERBoundingBox, boxB: ERBoundingBox): number {
  const [aymin, axmin, aymax, axmax] = boxA;
  const [bymin, bxmin, bymax, bxmax] = boxB;

  const iymin = Math.max(aymin, bymin);
  const ixmin = Math.max(axmin, bxmin);
  const iymax = Math.min(aymax, bymax);
  const ixmax = Math.min(axmax, bxmax);

  if (iymax <= iymin || ixmax <= ixmin) return 0;

  const intersection = (iymax - iymin) * (ixmax - ixmin);
  const areaA = erBoxArea(boxA);
  const areaB = erBoxArea(boxB);
  const union = areaA + areaB - intersection;

  return union > 0 ? intersection / union : 0;
}

/** Calculate Euclidean distance between two ER points (normalized space) */
export function erPointDistance(a: ERPoint, b: ERPoint): number {
  const dy = a[0] - b[0];
  const dx = a[1] - b[1];
  return Math.sqrt(dy * dy + dx * dx);
}
