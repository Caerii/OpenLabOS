/**
 * On-device preview smoke: balanced MJPEG → lowLatency H.264 → metrics.
 * Usage: LABOS_DEVICE_IP=192.168.50.123 pnpm exec tsx src/scripts/preview-device-smoke.ts
 */
import http from "node:http";
import { adb, setTargetDevice } from "../adb.js";

const DEVICE_IP = process.env.LABOS_DEVICE_IP || process.env.LABOS_GLASSES_IP || "192.168.50.123";
const SERIAL = `${DEVICE_IP}:5555`;
const DASHBOARD_PORT = Number(process.env.LABOS_DASHBOARD_FORWARD_PORT || 18080);
const PREVIEW_PORT = Number(process.env.LABOS_PREVIEW_FORWARD_PORT || 18089);

type Json = Record<string, unknown>;

function log(section: string, data: unknown) {
  console.log(`[preview-smoke] ${section}`, typeof data === "string" ? data : JSON.stringify(data, null, 2));
}

function httpJson(
  opts: { hostname: string; port: number; path: string; method?: string; headers?: Record<string, string>; body?: string },
  timeoutMs = 8000,
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: opts.hostname,
        port: opts.port,
        path: opts.path,
        method: opts.method || "GET",
        headers: opts.headers,
        timeout: timeoutMs,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve({ status: res.statusCode || 0, body: Buffer.concat(chunks).toString("utf8") }));
      },
    );
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error(`timeout ${opts.path}`));
    });
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

async function ensureForwards() {
  await adb(["connect", SERIAL], 15_000);
  setTargetDevice(SERIAL);
  await adb(["forward", `tcp:${DASHBOARD_PORT}`, "tcp:8080"], 10_000);
  await adb(["forward", `tcp:${PREVIEW_PORT}`, "tcp:8089"], 10_000);
}

async function getToken(): Promise<string> {
  const res = await httpJson({ hostname: "127.0.0.1", port: DASHBOARD_PORT, path: "/api/auth/token" });
  if (res.status !== 200) throw new Error(`token HTTP ${res.status}: ${res.body}`);
  const parsed = JSON.parse(res.body) as { token?: string };
  if (!parsed.token) throw new Error("missing token");
  return parsed.token;
}

function authHeaders(token: string, extra: Record<string, string> = {}) {
  return { "X-LabOS-Token": token, ...extra };
}

async function dashboardGet(token: string, path: string) {
  const res = await httpJson({ hostname: "127.0.0.1", port: DASHBOARD_PORT, path, headers: authHeaders(token) });
  return { status: res.status, json: safeJson(res.body), raw: res.body };
}

async function cameraBroadcast(action: string) {
  return adb(
    ["shell", "am", "broadcast", "-a", action, "-n", "com.openlab.labos.camera/.CameraCommandReceiver"],
    10_000,
  );
}

async function cameraStart() {
  await cameraBroadcast("com.openlab.labos.camera.ACTION_START_PREVIEW");
}

async function cameraStop() {
  await cameraBroadcast("com.openlab.labos.camera.ACTION_STOP_PREVIEW");
}

async function dashboardPost(token: string, path: string) {
  const res = await httpJson({
    hostname: "127.0.0.1",
    port: DASHBOARD_PORT,
    path,
    method: "POST",
    headers: authHeaders(token, { "Content-Length": "0" }),
  });
  return { status: res.status, json: safeJson(res.body), raw: res.body };
}

async function previewGet(path: string) {
  const res = await httpJson({ hostname: "127.0.0.1", port: PREVIEW_PORT, path }, 6000);
  return { status: res.status, json: safeJson(res.body), raw: res.body, bytes: res.body.length };
}

async function previewPut(path: string, body: Json) {
  const payload = JSON.stringify(body);
  const res = await httpJson({
    hostname: "127.0.0.1",
    port: PREVIEW_PORT,
    path,
    method: "PUT",
    headers: { "Content-Type": "application/json", "Content-Length": String(Buffer.byteLength(payload)) },
    body: payload,
  });
  return { status: res.status, json: safeJson(res.body), raw: res.body };
}

function safeJson(body: string): Json | null {
  try {
    return JSON.parse(body) as Json;
  } catch {
    return null;
  }
}

async function waitForPreviewPort(attempts = 15) {
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await previewGet("/health");
      if (res.status === 200) return res.json;
      log("preview-port", `attempt ${i} status ${res.status}`);
    } catch (error) {
      log("preview-port", `attempt ${i} ${error instanceof Error ? error.message : String(error)}`);
    }
    await sleep(1000);
  }
  throw new Error("preview server on :8089 not reachable");
}
async function waitForStreaming(token: string, label: string, attempts = 20) {
  for (let i = 1; i <= attempts; i++) {
    const health = await dashboardGet(token, "/api/preview/health");
    const streaming = health.json?.streaming === true;
    const frameCount = Number(health.json?.frameCount || 0);
    const fps = Number(health.json?.fps || 0);
    const age = health.json?.streamFrameAgeMs;
    const ageMs = typeof age === "number" ? age : Number.POSITIVE_INFINITY;
    log(`${label} attempt ${i}`, { streaming, frameCount, fps, streamFrameAgeMs: age, status: health.status });
    if (frameCount > 0 && ageMs < 2000) return health.json;
    await sleep(1500);
  }
  throw new Error(`${label}: preview did not become ready`);
}

async function fetchJpegFrame(token: string) {
  const res = await httpJson({
    hostname: "127.0.0.1",
    port: DASHBOARD_PORT,
    path: `/api/preview/frame?t=${Date.now()}`,
    headers: authHeaders(token),
  }, 10_000);
  return { status: res.status, bytes: res.body.length };
}

async function probeH264AnnexB(ms = 3000) {
  return new Promise<{ bytes: number; chunks: number }>((resolve, reject) => {
    let bytes = 0;
    let chunks = 0;
    const req = http.request(
      { hostname: "127.0.0.1", port: PREVIEW_PORT, path: "/stream/avc", method: "GET", timeout: ms + 2000 },
      (res) => {
        if ((res.statusCode || 0) >= 400) {
          res.resume();
          reject(new Error(`H.264 stream HTTP ${res.statusCode}`));
          return;
        }
        res.on("data", (chunk: Buffer) => {
          bytes += chunk.length;
          chunks += 1;
        });
        res.on("end", () => resolve({ bytes, chunks }));
      },
    );
    req.on("error", reject);
    req.end();
    setTimeout(() => {
      req.destroy();
      resolve({ bytes, chunks });
    }, ms);
  });
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function ensureDashboardRunning() {
  await adb(
    ["shell", "am", "start", "-a", "com.openlab.labos.dashboard.START", "-n", "com.openlab.labos.dashboard/.DashboardBootstrapActivity"],
    10_000,
  ).catch(() => "");
  await sleep(4000);
}

async function main() {
  log("device", { ip: DEVICE_IP, serial: SERIAL });
  await ensureForwards();
  await ensureDashboardRunning();

  const token = await getToken();
  log("token", "ok");

  // ── Phase 1: balanced MJPEG ─────────────────────────────
  log("phase", "1 balanced MJPEG");
  await cameraStop().catch(() => null);
  await sleep(1000);
  await cameraStart();
  await waitForPreviewPort();
  await previewPut("/config", {
    encodeMode: "software-jpeg",
    transport: "mjpeg-http",
    width: 480,
    height: 360,
    fps: 6,
    jpegQuality: 45,
    instrumentMetrics: true,
  });
  await cameraStop();
  await sleep(1000);
  await cameraStart();
  await waitForPreviewPort();

  const balancedHealth = await waitForStreaming(token, "balanced");
  const frame1 = await fetchJpegFrame(token);
  log("balanced/frame", frame1);

  const metrics1 = await previewGet("/metrics");
  log("balanced/metrics", metrics1.json || metrics1.raw);

  const rawHealth1 = await previewGet("/health");
  log("balanced/raw-health", rawHealth1.json || rawHealth1.raw);

  // ── Phase 2: lowLatency H.264 ───────────────────────────
  log("phase", "2 lowLatency H.264");
  await cameraStop();
  await sleep(1500);
  await cameraStart();
  await waitForPreviewPort();

  const h264Config = await previewPut("/config", {
    encodeMode: "hardware-h264",
    transport: "h264-annexb-http",
    width: 1280,
    height: 720,
    fps: 30,
    h264Bitrate: 2_000_000,
    h264KeyframeIntervalSec: 1,
    lowLatency: true,
    instrumentMetrics: true,
  });
  log("h264/config", h264Config.json || h264Config.raw);
  await cameraStop();
  await sleep(1500);
  await cameraStart();
  await waitForPreviewPort();
  await sleep(3000);

  const h264Health = await waitForStreaming(token, "h264", 25);
  log("h264/health", h264Health);

  let annexB = { bytes: 0, chunks: 0 };
  try {
    annexB = await probeH264AnnexB(4000);
    log("h264/annexb-probe", annexB);
  } catch (error) {
    log("h264/annexb-probe", `FAILED: ${error instanceof Error ? error.message : String(error)}`);
  }

  const metrics2 = await previewGet("/metrics");
  log("h264/metrics", metrics2.json || metrics2.raw);

  // ── Summary ───────────────────────────────────────────────
  const summary = {
    ok: true,
    device: DEVICE_IP,
    balanced: {
      streaming: balancedHealth?.streaming,
      frameCount: balancedHealth?.frameCount,
      streamFrameAgeMs: balancedHealth?.streamFrameAgeMs,
      frameBytes: frame1.bytes,
      lastGlassToGlassMs: metrics1.json?.lastGlassToGlassMs,
      avgEncodeMs: metrics1.json?.avgEncodeMs,
    },
    h264: {
      streaming: h264Health?.streaming,
      frameCount: h264Health?.frameCount,
      encodeMode: h264Health?.encodeMode,
      transport: h264Health?.transport,
      annexBBytes: annexB.bytes,
      annexBChunks: annexB.chunks,
      lastGlassToGlassMs: metrics2.json?.lastGlassToGlassMs,
      avgEncodeMs: metrics2.json?.avgEncodeMs,
    },
  };
  log("SUMMARY", summary);
  console.log("[preview-smoke] all phases completed");
}

main().catch((error) => {
  console.error("[preview-smoke] FAILED:", error);
  process.exit(1);
});
