import { Router, Request, Response } from "express";
import http from "http";
import { adb } from "./adb.js";

const router = Router();

/**
 * WiFi proxy mode forwards selected dashboard API requests to the on-device
 * DashboardRouter on port 8080. Host-local orchestration routes stay local.
 */

let glassesIp: string | null = null;
let apiToken: string | null = null;

export function isWifiMode(): boolean {
  return glassesIp !== null;
}

export function getGlassesUrl(): string {
  return `http://${glassesIp}:8080`;
}

export function getToken(): string | null {
  return apiToken;
}

export function getWifiProxyStatus() {
  return {
    mode: glassesIp ? "wifi" : "adb",
    glassesIp,
    hasToken: !!apiToken,
  };
}

export async function enableWifiProxy(ip: string, token?: string | null) {
  if (!ip) {
    throw new Error("Missing glasses IP");
  }

  await proxyGet(ip, "/health", token || null);
  glassesIp = ip;
  apiToken = token || null;

  if (!apiToken) {
    try {
      const authResult = await proxyGet(ip, "/api/auth/token", null);
      const parsed = JSON.parse(authResult);
      apiToken = parsed.token;
    } catch {
      // Token fetch is optional; some devices require ADB pairing first.
    }
  }

  if (!apiToken) {
    try {
      apiToken = await fetchTokenViaAdbForward();
    } catch {
      // Keep proxy usable for unauthenticated health checks.
    }
  }

  console.log(`[WiFi Proxy] Enabled - glasses at ${ip}, token: ${apiToken ? "set" : "none"}`);
  return { success: true, ip: glassesIp, token: apiToken, mode: "wifi" };
}

router.post("/enable", async (req: Request, res: Response) => {
  try {
    res.json(await enableWifiProxy(req.body?.ip, req.body?.token));
  } catch (e: any) {
    res.status(req.body?.ip ? 502 : 400).json({
      error: req.body?.ip
        ? `Cannot reach glasses at ${req.body.ip}:8080 - ${e.message}`
        : "Missing 'ip' field",
    });
  }
});

router.post("/disable", (_req: Request, res: Response) => {
  glassesIp = null;
  apiToken = null;
  console.log("[WiFi Proxy] Disabled - reverting to ADB mode");
  res.json({ success: true, mode: "adb" });
});

router.get("/status", (_req: Request, res: Response) => {
  res.json(getWifiProxyStatus());
});

const ROUTE_MAP: Record<string, string> = {
  "/api/device/info": "/api/system/info",
  "/api/system/reboot": "/api/system/reboot",
  "/api/system/shell": "/api/dev/shell",
  "/api/hardware/battery": "/api/battery/summary",
  "/api/hardware/overview": "/api/status",
  "/api/files/list": "/api/dev/files",
  "/api/settings": "/api/settings",
  "/api/mcu/status": "/api/mcu/status",
  "/api/console/send": "/api/mcu/command",
  "/api/console/history": "/api/mcu/status",
  "/api/preview/start": "/api/camera/start",
  "/api/preview/stop": "/api/camera/stop",
  "/api/preview/stream": "/api/preview/stream",
  "/api/preview/frame": "/api/preview/frame",
  "/api/preview/health": "/api/preview/health",
  "/api/battery/history": "/api/battery/history",
  "/api/battery/summary": "/api/battery/summary",
  "/api/audio/test-tone": "/api/audio/play",
  "/api/network/wifi": "/api/wifi/status",
  "/api/ota/current": "/api/status",
  "/api/buttons/mappings": "/api/settings",
  "/api/apps": "/api/dev/packages",
};

export function isHostLocalApiPath(path: string) {
  return (
    path === "/api/health" ||
    path.startsWith("/api/wifi-proxy") ||
    path.startsWith("/api/kitchen") ||
    path.startsWith("/api/live-coach") ||
    path.startsWith("/api/preview") ||
    path.startsWith("/api/preview/recording") ||
    path.startsWith("/api/labos") ||
    path.startsWith("/api/workflows") ||
    path.startsWith("/api/agents") ||
    path.startsWith("/api/runpod") ||
    path.startsWith("/api/labclaw") ||
    path.startsWith("/api/audio/cue") ||
    path === "/api/audio/protocol-step" ||
    path === "/api/device/status" ||
    path === "/api/device/scan" ||
    path === "/api/device/connect" ||
    path === "/api/device/disconnect" ||
    path === "/api/device/list" ||
    path === "/api/device/select"
  );
}

type ProxyErrorResponse = Pick<Response, "end" | "headersSent" | "json" | "status" | "writableEnded">;

export function sendProxyErrorIfPossible(
  res: ProxyErrorResponse,
  status: number,
  payload: Record<string, unknown>,
) {
  if (res.writableEnded) return;
  if (res.headersSent) {
    res.end();
    return;
  }
  res.status(status).json(payload);
}

export function wifiProxyMiddleware(req: Request, res: Response, next: Function) {
  if (!glassesIp || isHostLocalApiPath(req.path) || !req.path.startsWith("/api/")) {
    next();
    return;
  }

  const devicePath = ROUTE_MAP[req.path] || req.path;
  const body = ["POST", "PUT", "DELETE"].includes(req.method) ? JSON.stringify(req.body) : null;

  const options: http.RequestOptions = {
    hostname: glassesIp,
    port: 8080,
    path: devicePath + (req.url.includes("?") ? `?${req.url.split("?")[1]}` : ""),
    method: req.method,
    timeout: 15000,
    headers: {
      "Content-Type": "application/json",
      ...(apiToken ? { "X-LabOS-Token": apiToken } : {}),
    },
  };

  const proxyReq = http.request(options, (proxyRes) => {
    const contentType = proxyRes.headers["content-type"] || "application/json";

    if (contentType.includes("multipart") || contentType.includes("event-stream") || contentType.includes("image/")) {
      if (res.writableEnded) {
        proxyRes.resume();
        return;
      }
      res.writeHead(proxyRes.statusCode || 200, {
        "Content-Type": contentType,
        "Cache-Control": "no-cache",
        "Access-Control-Allow-Origin": "*",
      });
      proxyRes.pipe(res);
      return;
    }

    let data = "";
    proxyRes.on("data", (chunk: Buffer) => { data += chunk.toString(); });
    proxyRes.on("end", () => {
      if (res.headersSent || res.writableEnded) return;
      try {
        res.status(proxyRes.statusCode || 200)
          .header("Content-Type", "application/json")
          .send(data);
      } catch {
        sendProxyErrorIfPossible(res, 500, { error: "Proxy response error" });
      }
    });
  });

  proxyReq.on("error", (err) => {
    console.error(`[WiFi Proxy] Error: ${err.message}`);
    sendProxyErrorIfPossible(res, 502, {
      error: `Device unreachable: ${err.message}`,
      mode: "wifi",
      glassesIp,
    });
  });

  proxyReq.on("timeout", () => {
    proxyReq.destroy();
    sendProxyErrorIfPossible(res, 504, { error: "Device request timed out" });
  });

  if (body) {
    proxyReq.write(body);
  }
  proxyReq.end();
}

async function fetchTokenViaAdbForward() {
  const localPort = 18080;
  await adb(["forward", `tcp:${localPort}`, "tcp:8080"], 5000);
  try {
    const authResult = await proxyGet("127.0.0.1", "/api/auth/token", null, localPort);
    const parsed = JSON.parse(authResult);
    if (typeof parsed.token !== "string" || !parsed.token) {
      throw new Error("Token response did not include token");
    }
    return parsed.token;
  } finally {
    await adb(["forward", "--remove", `tcp:${localPort}`], 5000).catch(() => {});
  }
}

function proxyGet(ip: string, path: string, token: string | null, port = 8080): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: ip,
      port,
      path,
      method: "GET",
      timeout: 5000,
      headers: token ? { "X-LabOS-Token": token } : {},
    }, (res) => {
      let data = "";
      res.on("data", (chunk: Buffer) => { data += chunk.toString(); });
      res.on("end", () => {
        const status = res.statusCode || 0;
        if (status < 200 || status >= 300) {
          reject(new Error(`HTTP ${status}${data ? `: ${data.slice(0, 200)}` : ""}`));
          return;
        }
        if (!data.trim()) {
          reject(new Error(`HTTP ${status}: empty response from ${path}`));
          return;
        }
        resolve(data);
      });
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Timeout")); });
    req.end();
  });
}

export default router;
