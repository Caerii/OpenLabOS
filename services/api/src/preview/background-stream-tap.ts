import http from "node:http";
import { dashboardApiPort } from "../runtime-config.js";

export interface BackgroundPreviewTapStatus {
  running: boolean;
  startedAt: number | null;
  lastDataAt: number | null;
  reconnects: number;
  lastError: string | null;
}

class BackgroundPreviewTap {
  private req: http.ClientRequest | null = null;
  private running = false;
  private startedAt: number | null = null;
  private lastDataAt: number | null = null;
  private reconnects = 0;
  private lastError: string | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;

  status(): BackgroundPreviewTapStatus {
    return {
      running: this.running,
      startedAt: this.startedAt,
      lastDataAt: this.lastDataAt,
      reconnects: this.reconnects,
      lastError: this.lastError,
    };
  }

  start() {
    if (this.running) return this.status();
    this.running = true;
    this.startedAt = Date.now();
    this.lastError = null;
    this.open();
    return this.status();
  }

  stop() {
    this.running = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.req?.destroy();
    this.req = null;
    return this.status();
  }

  private open() {
    if (!this.running) return;
    const port = dashboardApiPort();
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: "/api/preview/stream",
        method: "GET",
        headers: { Accept: "multipart/x-mixed-replace" },
      },
      (res) => {
        res.on("data", () => {
          this.lastDataAt = Date.now();
        });
        res.on("end", () => {
          this.scheduleReconnect();
        });
      },
    );
    this.req = req;
    req.on("error", (error) => {
      this.lastError = error.message;
      this.scheduleReconnect();
    });
    req.end();
  }

  private scheduleReconnect() {
    this.req = null;
    if (!this.running || this.reconnectTimer) return;
    this.reconnects += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.open();
    }, 1000);
    this.reconnectTimer.unref?.();
  }
}

export const backgroundPreviewTap = new BackgroundPreviewTap();
