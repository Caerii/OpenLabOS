import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { networkInterfaces } from "os";
import { findAdb } from "./adb.js";
import wifiProxyRouter, { wifiProxyMiddleware } from "./wifi-proxy.js";
import deviceRoutes from "./routes/device.js";
import appsRoutes from "./routes/apps.js";
import labosRoutes from "./routes/labos.js";
import systemRoutes from "./routes/system.js";
import hardwareRoutes from "./routes/hardware.js";
import mcuRoutes from "./routes/mcu.js";
import filesRoutes from "./routes/files.js";
import networkRoutes from "./routes/network.js";
import settingsRoutes from "./routes/settings.js";
import otaRoutes from "./routes/ota.js";
import consoleRoutes from "./routes/console.js";
import previewRoutes from "./routes/preview.js";
import batteryRoutes from "./routes/battery.js";
import audioRoutes from "./routes/audio.js";
import buttonRoutes from "./routes/buttons.js";
import aiRoutes from "./routes/ai.js";
import kitchenRoutes from "./routes/kitchen.js";
import liveCoachRoutes from "./routes/live-coach.js";
import labclawRoutes from "./routes/labclaw.js";
import agentsRoutes from "./routes/agents.js";
import runpodRoutes from "./routes/runpod.js";
import workflowRoutes from "./routes/workflows.js";
import perceptionRoutes from "./routes/perception.js";
import { liveCoach } from "./live-coach/singleton.js";
import { mountHonoOnExpress } from "./hono/mount-on-express.js";
import { dashboardApiHost, dashboardApiPort } from "./runtime-config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = dashboardApiPort();
const HOST = dashboardApiHost();
const CLOUD_MODE = process.env.CLOUD_MODE === "true";

const app = express();

app.use(cors({
  origin: process.env.CORS_ORIGIN || true,
  credentials: true,
}));
app.use(express.json({ limit: "50mb" }));

// ── AI routes (always available — work in cloud and local) ──
app.use("/api/ai", aiRoutes);
app.use("/api/kitchen", kitchenRoutes);
app.use("/api/live-coach", liveCoachRoutes);
app.use("/api/labclaw", labclawRoutes);
app.use("/api/agents", agentsRoutes);
app.use("/api/runpod", runpodRoutes);
app.use("/api/workflows", workflowRoutes);
app.use("/api/perception", perceptionRoutes);

// ── Device routes (local only — need ADB or device access) ──
if (!CLOUD_MODE) {
  // WiFi proxy control endpoints (enable/disable/status)
  app.use("/api/wifi-proxy", wifiProxyRouter);

  // WiFi proxy middleware — when enabled, intercepts /api/* and forwards to device
  app.use(wifiProxyMiddleware);

  app.use("/api/device", deviceRoutes);
  app.use("/api/apps", appsRoutes);
  app.use("/api/labos", labosRoutes);
  app.use("/api/system", systemRoutes);
  app.use("/api/hardware", hardwareRoutes);
  app.use("/api/mcu", mcuRoutes);
  app.use("/api/files", filesRoutes);
  app.use("/api/network", networkRoutes);
  app.use("/api/settings", settingsRoutes);
  app.use("/api/ota", otaRoutes);
  app.use("/api/console", consoleRoutes);
  app.use("/api/preview", previewRoutes);
  app.use("/api/battery", batteryRoutes);
  app.use("/api/audio", audioRoutes);
  app.use("/api/buttons", buttonRoutes);
}

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, mode: CLOUD_MODE ? "cloud" : "local", adbPath: CLOUD_MODE ? null : findAdb() });
});

// Hono coordination routes (/api/healthz, /api/sessions, device proxy, …)
await mountHonoOnExpress(app);

// In production, serve the built frontend
const clientDist = path.resolve(__dirname, "..", "client");
app.use(express.static(clientDist));
app.get("*", (_req, res) => {
  const indexPath = path.join(clientDist, "index.html");
  res.sendFile(indexPath, (err) => {
    if (err) {
      res.status(404).send("Frontend not built. Run pnpm build:web first.");
    }
  });
});

const server = app.listen(PORT, HOST, () => {
  console.log(`[LabOS] Server running on http://${HOST}:${PORT} (${CLOUD_MODE ? "cloud" : "local"} mode)`);
  if (!CLOUD_MODE) {
    console.log(`[LabOS] ADB path: ${findAdb()}`);
  }

  // Print local network IPs for convenience
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] ?? []) {
      if (net.family === "IPv4" && !net.internal) {
        console.log(`[LabOS] Accessible at: http://${net.address}:${PORT}`);
      }
    }
  }
});

// WebSocket bridge for Gemini Live audio (browser <-> server <-> Gemini Live)
// This is demo-grade: single active ws client at a time.
try {
  const { WebSocketServer } = await import("ws");
  const { WebSocket } = await import("ws");
  const wss = new WebSocketServer({ server, path: "/api/live-coach/ws" });
  wss.on("connection", async (ws: InstanceType<typeof WebSocket>) => {
    await liveCoach.bindClient(ws);
    ws.on("message", async (data: unknown) => {
      try {
        const msg = JSON.parse(String(data));
        if (msg?.type === "start") {
          await liveCoach.start();
          return;
        }
        if (msg?.type === "stop") {
          await liveCoach.stop();
          return;
        }
        if (msg?.type === "pcm16" && typeof msg.data === "string") {
          await liveCoach.sendPcm16Base64(msg.data);
          return;
        }
        if (msg?.type === "text" && typeof msg.text === "string") {
          await liveCoach.sendText(msg.text);
          return;
        }
      } catch {
        // ignore
      }
    });
  });
  console.log(`[LiveCoach] WS bridge at ws://<host>:${PORT}/api/live-coach/ws`);
} catch (e: any) {
  console.warn(`[LiveCoach] WS unavailable: ${e?.message || e}`);
}
