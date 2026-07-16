import type { Response } from "express";
import http from "node:http";
import {
  ensurePortForward,
  LOCAL_PREVIEW_HOST,
  PREVIEW_PORT,
} from "./device-preview.js";
import { tapPreviewStreamChunk } from "./mjpeg-last-frame.js";
import { ingestStreamFrameMeta } from "./preview-pipeline-recorder.js";

const IDLE_GRACE_MS = 12_000;
const RECONNECT_MS = 1_000;
const SOURCE_STALL_MS = 12_000;
const SOURCE_STALL_CHECK_MS = 4_000;

type StreamClient = Response;

export interface SharedPreviewStreamStatus {
  running: boolean;
  clients: number;
  startedAt: number | null;
  lastDataAt: number | null;
  reconnects: number;
  lastError: string | null;
}

class SharedPreviewStreamHub {
  private clients = new Set<StreamClient>();
  private req: http.ClientRequest | null = null;
  private sourceActive = false;
  private starting: Promise<void> | null = null;
  private idleTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private stallTimer: NodeJS.Timeout | null = null;
  private startedAt: number | null = null;
  private lastDataAt: number | null = null;
  private reconnects = 0;
  private lastError: string | null = null;

  status(): SharedPreviewStreamStatus {
    return {
      running: this.sourceActive,
      clients: this.clients.size,
      startedAt: this.startedAt,
      lastDataAt: this.lastDataAt,
      reconnects: this.reconnects,
      lastError: this.lastError,
    };
  }

  addClient(res: StreamClient) {
    this.clearIdleTimer();
    this.writeStreamHeaders(res);
    this.clients.add(res);
    res.on("close", () => {
      this.clients.delete(res);
      this.scheduleIdleStop();
    });
    void this.ensureSource();
  }

  private writeStreamHeaders(res: Response) {
    res.writeHead(200, {
      "Content-Type": "multipart/x-mixed-replace; boundary=labos-frame-boundary",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });
  }

  private async ensureSource() {
    if (this.sourceActive || this.req) return;
    if (this.starting) return this.starting;
    this.starting = this.openSource()
      .catch((error) => {
        this.lastError = error instanceof Error ? error.message : String(error);
        this.scheduleReconnect();
      })
      .finally(() => {
        this.starting = null;
      });
    return this.starting;
  }

  private async openSource() {
    await ensurePortForward();
    if (this.req || this.sourceActive) return;

    const req = http.request(
      {
        hostname: LOCAL_PREVIEW_HOST,
        port: PREVIEW_PORT,
        path: "/stream",
        method: "GET",
        headers: { Accept: "multipart/x-mixed-replace" },
      },
      (sourceRes) => {
        if ((sourceRes.statusCode || 0) >= 400) {
          this.lastError = `/stream HTTP ${sourceRes.statusCode || 0}`;
          sourceRes.resume();
          this.dropSource();
          this.scheduleReconnect();
          return;
        }

        this.sourceActive = true;
        this.startedAt = this.startedAt || Date.now();
        this.lastDataAt = Date.now();
        this.lastError = null;
        this.startStallWatchdog();

        sourceRes.on("data", (chunk: Buffer) => {
          this.lastDataAt = Date.now();
          try {
            tapPreviewStreamChunk(chunk);
            ingestStreamFrameMeta();
          } catch {
            // The tap is diagnostic/evidence plumbing; never fail the live view.
          }
          for (const client of [...this.clients]) {
            if (!client.destroyed) client.write(chunk);
          }
        });
        sourceRes.on("end", () => {
          this.dropSource();
          this.scheduleReconnect();
        });
        sourceRes.on("error", (error) => {
          this.lastError = error.message;
          this.dropSource();
          this.scheduleReconnect();
        });
      },
    );

    this.req = req;
    req.on("error", (error) => {
      this.lastError = error.message;
      this.dropSource();
      this.scheduleReconnect();
    });
    req.end();
  }

  private dropSource() {
    this.req?.destroy();
    this.req = null;
    this.sourceActive = false;
    this.clearStallWatchdog();
  }

  private scheduleReconnect() {
    if (!this.clients.size || this.reconnectTimer) return;
    this.reconnects += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.ensureSource();
    }, RECONNECT_MS);
    this.reconnectTimer.unref?.();
  }

  private scheduleIdleStop() {
    if (this.clients.size || this.idleTimer) return;
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null;
      if (this.clients.size) return;
      this.dropSource();
      this.startedAt = null;
      this.lastDataAt = null;
    }, IDLE_GRACE_MS);
    this.idleTimer.unref?.();
  }

  private clearIdleTimer() {
    if (!this.idleTimer) return;
    clearTimeout(this.idleTimer);
    this.idleTimer = null;
  }

  private startStallWatchdog() {
    if (this.stallTimer) return;
    this.stallTimer = setInterval(() => {
      if (!this.sourceActive || !this.clients.size) return;
      const lastDataAt = this.lastDataAt || this.startedAt || 0;
      if (Date.now() - lastDataAt <= SOURCE_STALL_MS) return;
      this.lastError = `No preview stream data for ${SOURCE_STALL_MS}ms`;
      this.dropSource();
      this.scheduleReconnect();
    }, SOURCE_STALL_CHECK_MS);
    this.stallTimer.unref?.();
  }

  private clearStallWatchdog() {
    if (!this.stallTimer) return;
    clearInterval(this.stallTimer);
    this.stallTimer = null;
  }
}

export const sharedPreviewStreamHub = new SharedPreviewStreamHub();
