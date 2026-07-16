/**
 * Frame Metadata Collector — captures device/sensor state at the moment of frame capture.
 *
 * For scientific data collection, every frame needs context beyond just its pixels:
 *   - Camera parameters: what ISO/exposure/WB was actually used
 *   - Stream health: FPS, frame size, frame sequence number
 *   - Device state: battery level, thermal readings, CPU load
 *   - High-resolution timestamp with monotonic clock for sequencing
 *
 * This data travels with the frame through the analysis pipeline and gets
 * saved alongside annotations, enabling reproducible experiments and
 * proper ablation studies when fine-tuning models.
 *
 * Data sources (all fetched from existing dashboard API endpoints):
 *   /api/preview/health     → FPS, frame count, streaming status
 *   /api/preview/capabilities → camera sensor ranges + current values
 *   /api/hardware/overview   → battery, thermal, CPU, memory (single call)
 */

import http from "http";
import { sensorBridge } from "./sensor-bridge.js";
import { dashboardApiPort } from "../runtime-config.js";

// ── Frame Metadata Types ────────────────────────────────

/**
 * Complete snapshot of device state at frame capture time.
 * This is what makes the difference between "some pictures with labels"
 * and "a scientifically reproducible egocentric vision dataset."
 */
export interface FrameMetadata {
  // Timing — sub-ms precision for frame sequencing
  captureTimestamp: number;        // Date.now() at capture initiation
  captureHrtime: [number, number]; // process.hrtime() for monotonic sub-ms ordering
  frameSequence: number;           // monotonic counter, incremented per capture

  // Camera sensor state — what the hardware was actually doing
  camera?: {
    iso?: number;
    exposureNs?: number;           // exposure time in nanoseconds
    aeCompensation?: number;       // EV compensation steps
    awbMode?: string;              // white balance mode (auto, daylight, etc.)
    focusDistance?: number;         // diopters
    manualMode?: boolean;          // whether manual controls are active
  };

  // Stream health — quality metrics for this capture
  stream?: {
    serverFps: number;             // frames per second at capture time
    frameCount: number;            // total frames served by preview server
    streaming: boolean;
    // Derived from frame buffer
    frameSizeBytes?: number;       // JPEG file size (proxy for scene complexity + quality)
  };

  // Device state — environmental context
  device?: {
    batteryLevel?: number;         // 0-100%
    batteryStatus?: string;        // charging, discharging, etc.
    batteryTempC?: number;         // battery temperature
    cpuUsagePercent?: number;      // overall CPU load
    memoryUsedPercent?: number;    // RAM pressure
    maxThermalC?: number;          // hottest thermal zone
  };

  // Frame properties — derived from the JPEG itself
  frame?: {
    widthPx?: number;              // actual image width (from JPEG header)
    heightPx?: number;             // actual image height (from JPEG header)
    sizeBytes: number;             // JPEG file size
  };

  // IMU — 6-axis inertial measurement from glasses MCU (synced to frame capture)
  imu?: {
    accel: [number, number, number];   // m/s², [x, y, z]
    gyro: [number, number, number];    // rad/s, [x, y, z]
    ageMs: number;                     // staleness of reading relative to frame capture
  };

  // Head gesture — latest detected gesture from IMU-based gesture recognition
  gesture?: {
    latest: string;                    // "nod", "shake", "head_up", "head_down", etc.
    ageMs: number;                     // time since gesture was detected
  };

  // Head orientation — derived from accelerometer gravity vector
  orientation?: {
    pitchDeg: number;                  // positive = looking up, negative = looking down
    rollDeg: number;                   // positive = tilted right, negative = tilted left
  };

  // Motion state — derived from accelerometer magnitude over time
  motion?: {
    magnitude: number;                 // residual acceleration in m/s² (gravity subtracted)
    isStill: boolean;                  // below threshold for sustained period
  };
}

// ── Frame Sequence Counter ──────────────────────────────

let frameSequenceCounter = 0;

export function nextFrameSequence(): number {
  return ++frameSequenceCounter;
}

export function getFrameSequence(): number {
  return frameSequenceCounter;
}

// ── JPEG Dimension Parser ───────────────────────────────

/**
 * Extract width and height from a JPEG buffer by parsing SOF markers.
 * Much faster than loading the full image — just reads the header bytes.
 * Returns null if the JPEG is malformed or dimensions can't be found.
 */
export function parseJpegDimensions(buf: Buffer): { width: number; height: number } | null {
  // JPEG SOF markers that contain image dimensions:
  // SOF0 (0xFFC0) through SOF15 (0xFFCF), excluding DHT (0xFFC4) and DAC (0xFFCC)
  let offset = 2; // skip SOI marker (FF D8)
  while (offset < buf.length - 8) {
    if (buf[offset] !== 0xFF) return null;

    const marker = buf[offset + 1];

    // SOF markers: C0-C3, C5-C7, C9-CB, CD-CF
    if (
      (marker >= 0xC0 && marker <= 0xC3) ||
      (marker >= 0xC5 && marker <= 0xC7) ||
      (marker >= 0xC9 && marker <= 0xCB) ||
      (marker >= 0xCD && marker <= 0xCF)
    ) {
      // SOF segment: length(2) + precision(1) + height(2) + width(2)
      const height = buf.readUInt16BE(offset + 5);
      const width = buf.readUInt16BE(offset + 7);
      return { width, height };
    }

    // Skip to next marker (2 byte marker + 2 byte length)
    const segLength = buf.readUInt16BE(offset + 2);
    offset += 2 + segLength;
  }
  return null;
}

// ── Metadata Collectors ─────────────────────────────────

const PREVIEW_PORT = 8089;

/** Fetch JSON from a local HTTP endpoint with a short timeout */
function fetchLocal(port: number, path: string, timeoutMs = 2000): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { hostname: "127.0.0.1", port, path, method: "GET", timeout: timeoutMs },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          resolve(null);
          return;
        }
        let body = "";
        res.on("data", (chunk: Buffer) => { body += chunk.toString(); });
        res.on("end", () => {
          try { resolve(JSON.parse(body)); } catch { resolve(null); }
        });
      }
    );
    req.on("error", () => resolve(null));
    req.on("timeout", () => { req.destroy(); resolve(null); });
    req.end();
  });
}

/**
 * Collect all available metadata for a frame capture.
 *
 * Fetches stream health + device overview in parallel.
 * Camera capabilities are cached (they rarely change mid-session).
 * Total overhead: ~20-50ms (two parallel HTTP requests to localhost).
 */
export async function collectFrameMetadata(frameBuffer: Buffer): Promise<FrameMetadata> {
  const captureTimestamp = Date.now();
  const captureHrtime = process.hrtime() as [number, number];
  const frameSequence = nextFrameSequence();

  // Parse JPEG dimensions from the buffer itself (fast, no network)
  const dims = parseJpegDimensions(frameBuffer);

  // Fetch stream health and device state in parallel
  // These hit our own dashboard server endpoints (localhost:3847)
  const [health, overview, caps] = await Promise.all([
    fetchLocal(PREVIEW_PORT, "/health"),
    fetchLocal(dashboardApiPort(), "/api/hardware/overview"),
    getCachedCapabilities(),
  ]);

  const metadata: FrameMetadata = {
    captureTimestamp,
    captureHrtime,
    frameSequence,

    frame: {
      widthPx: dims?.width,
      heightPx: dims?.height,
      sizeBytes: frameBuffer.length,
    },
  };

  // Stream health from on-device preview server
  if (health) {
    metadata.stream = {
      serverFps: health.fps || 0,
      frameCount: health.frameCount || 0,
      streaming: health.streaming ?? health.ok ?? false,
      frameSizeBytes: frameBuffer.length,
    };
  }

  // Device state from hardware overview endpoint
  if (overview) {
    metadata.device = {
      batteryLevel: overview.battery?.level,
      batteryStatus: overview.battery?.status,
      batteryTempC: overview.battery?.temperatureC,
      cpuUsagePercent: overview.cpu?.usagePercent,
      memoryUsedPercent: overview.memory?.usedPercent,
      maxThermalC: overview.thermal?.maxTemperatureC,
    };
  }

  // Camera state from capabilities (includes current values when streaming)
  if (caps) {
    metadata.camera = {
      iso: caps.current_iso,
      exposureNs: caps.current_exposure_ns,
      aeCompensation: caps.current_ae_comp,
      awbMode: caps.current_awb_mode,
      focusDistance: caps.current_focus_distance,
      manualMode: caps.manual_mode,
    };
  }

  // Sensor fusion — grab synchronized IMU/gesture/orientation from the sensor bridge
  // If the bridge isn't connected, these fields stay undefined (graceful degradation)
  if (sensorBridge.connected) {
    const sensorSnap = sensorBridge.snapshot();

    if (sensorSnap.imu) {
      metadata.imu = {
        accel: sensorSnap.imu.accel,
        gyro: sensorSnap.imu.gyro,
        ageMs: sensorSnap.imuAgeMs ?? 0,
      };
    }

    if (sensorSnap.gesture) {
      metadata.gesture = {
        latest: sensorSnap.gesture.gesture,
        ageMs: sensorSnap.gestureAgeMs ?? 0,
      };
    }

    if (sensorSnap.orientation) {
      metadata.orientation = sensorSnap.orientation;
    }

    if (sensorSnap.motionMagnitude !== undefined) {
      metadata.motion = {
        magnitude: sensorSnap.motionMagnitude,
        isStill: sensorSnap.isStill ?? false,
      };
    }
  }

  return metadata;
}

// ── Camera Capabilities Cache ───────────────────────────
// Capabilities (ISO range, exposure range, etc.) don't change during a session.
// Current sensor values (current_iso, current_exposure_ns) DO change per frame,
// but the broadcast → file → read round-trip is too slow (~500ms) for per-frame capture.
// We cache and refresh periodically instead.

let cachedCaps: any = null;
let capsLastFetched = 0;
const CAPS_CACHE_TTL_MS = 10000; // refresh every 10 seconds

async function getCachedCapabilities(): Promise<any> {
  const now = Date.now();
  if (cachedCaps && (now - capsLastFetched) < CAPS_CACHE_TTL_MS) {
    return cachedCaps;
  }

  // Fetch from our own API endpoint (which broadcasts to camera module and reads the file)
  const caps = await fetchLocal(dashboardApiPort(), "/api/preview/capabilities");
  if (caps && !caps.error) {
    cachedCaps = caps;
    capsLastFetched = now;
  }
  return cachedCaps;
}

/** Force-refresh capabilities cache (call after changing manual params) */
export function invalidateCapabilitiesCache() {
  cachedCaps = null;
  capsLastFetched = 0;
}
