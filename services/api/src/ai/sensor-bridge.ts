/**
 * Sensor Bridge — persistent SSE client that consumes all sensor data from HMD-class glasses.
 *
 * The on-device dashboard (port 8080) streams sensor events via Server-Sent Events:
 *   - imu: accelerometer + gyroscope at ~50-100Hz
 *   - gesture: head gestures (nod, shake, head_up, head_down, tilt_left, tilt_right)
 *   - battery: level + voltage updates
 *   - connection: MCU connection state changes
 *   - button: physical button presses
 *
 * This bridge maintains a synchronized sensor state buffer that frame-metadata.ts
 * can snapshot at the exact moment of frame capture, giving every frame full
 * 6-axis IMU context for scientific reproducibility.
 *
 * The IMU ring buffer stores the last 5 seconds of readings (~500 entries at 100Hz)
 * for temporal analysis — detecting motion patterns, stability windows, and transitions.
 */

import http from "http";

// ── Sensor Data Types ──────────────────────────────────

export interface ImuReading {
  timestamp: number;                         // Date.now() when received by bridge
  accel: [number, number, number];           // m/s², [x, y, z]
  gyro: [number, number, number];            // rad/s, [x, y, z]
}

export interface GestureEvent {
  timestamp: number;
  gesture: string;  // "nod", "shake", "head_up", "head_down", "tilt_left", "tilt_right"
}

export interface ButtonPressEvent {
  timestamp: number;
  buttonId: string;
  isLongPress: boolean;
}

export interface SensorSnapshot {
  // Raw sensor data (latest readings)
  imu?: ImuReading;
  imuAgeMs?: number;                         // how stale the IMU reading is
  gesture?: GestureEvent;
  gestureAgeMs?: number;
  battery?: { level: number; voltage?: number };
  mcuConnected?: boolean;

  // Derived values (computed from accelerometer)
  orientation?: {
    pitchDeg: number;                        // head up/down angle
    rollDeg: number;                         // head tilt left/right angle
  };
  motionMagnitude?: number;                  // residual acceleration (gravity-subtracted)
  isStill?: boolean;                         // low motion for sustained period
}

export interface SensorBridgeStats {
  connected: boolean;
  targetUrl: string | null;
  imuRate: number;                           // estimated Hz over last second
  totalImuReadings: number;
  totalGestures: number;
  totalButtonPresses: number;
  latestButtonPress: ButtonPressEvent | null;
  reconnectCount: number;
  lastEventTime: number | null;
  ringBufferSize: number;
}

// ── Ring Buffer ────────────────────────────────────────

const RING_BUFFER_SIZE = 500;  // ~5 seconds at 100Hz

class ImuRingBuffer {
  private buffer: ImuReading[] = new Array(RING_BUFFER_SIZE);
  private head = 0;         // next write position
  private count = 0;        // entries written (capped at RING_BUFFER_SIZE)

  push(reading: ImuReading) {
    this.buffer[this.head] = reading;
    this.head = (this.head + 1) % RING_BUFFER_SIZE;
    if (this.count < RING_BUFFER_SIZE) this.count++;
  }

  /** Get the most recent reading, or null if empty */
  latest(): ImuReading | null {
    if (this.count === 0) return null;
    const idx = (this.head - 1 + RING_BUFFER_SIZE) % RING_BUFFER_SIZE;
    return this.buffer[idx];
  }

  /** Get readings from the last `durationMs` milliseconds */
  getHistory(durationMs: number): ImuReading[] {
    if (this.count === 0) return [];

    const now = Date.now();
    const cutoff = now - durationMs;
    const result: ImuReading[] = [];

    // Walk backward from most recent
    for (let i = 0; i < this.count; i++) {
      const idx = (this.head - 1 - i + RING_BUFFER_SIZE * 2) % RING_BUFFER_SIZE;
      const reading = this.buffer[idx];
      if (reading.timestamp < cutoff) break;
      result.unshift(reading);  // maintain chronological order
    }

    return result;
  }

  /** Check if motion has been below threshold for the last N samples */
  isStill(threshold: number, sampleCount: number): boolean {
    if (this.count < sampleCount) return false;

    for (let i = 0; i < sampleCount; i++) {
      const idx = (this.head - 1 - i + RING_BUFFER_SIZE * 2) % RING_BUFFER_SIZE;
      const reading = this.buffer[idx];
      const [ax, ay, az] = reading.accel;
      const magnitude = Math.sqrt(ax * ax + ay * ay + az * az) - 9.81;
      if (Math.abs(magnitude) > threshold) return false;
    }

    return true;
  }

  get size(): number { return this.count; }

  clear() {
    this.head = 0;
    this.count = 0;
  }
}

// ── SSE Parser ─────────────────────────────────────────

/**
 * Minimal SSE line parser. The on-device NanoHTTPD sends events as:
 *   event: <type>\n
 *   data: <json>\n
 *   \n
 */
interface SSEEvent {
  event: string;
  data: string;
}

function parseSSEChunk(text: string): SSEEvent[] {
  const events: SSEEvent[] = [];
  const blocks = text.split("\n\n");

  for (const block of blocks) {
    if (!block.trim()) continue;
    let event = "message";
    let data = "";

    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) {
        event = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        data = line.slice(5).trim();
      }
    }

    if (data) {
      events.push({ event, data });
    }
  }

  return events;
}

// ── Sensor Bridge ──────────────────────────────────────

const STILLNESS_THRESHOLD = 0.3;   // m/s² residual acceleration
const STILLNESS_SAMPLES = 50;      // ~0.5s at 100Hz
const HEARTBEAT_TIMEOUT = 65000;   // device SSE may be quiet; reconnect after the device's ~60s idle timeout
const KEEPALIVE_INTERVAL = 50000;  // re-subscribe IMU every 50s (device timeout is 60s)
const MAX_RECONNECT_DELAY = 30000;

export class SensorBridge {
  // Connection state
  private request: ReturnType<typeof http.request> | null = null;
  private _connected = false;
  private targetHost = "127.0.0.1";
  private targetPort = 8080;
  private authToken: string | null = null;
  private _targetUrl: string | null = null;

  // Sensor state
  private imuBuffer = new ImuRingBuffer();
  private latestGesture: GestureEvent | null = null;
  private latestButtonPress: ButtonPressEvent | null = null;
  private latestBattery: { level: number; voltage?: number } | null = null;
  private mcuConnected: boolean | null = null;

  // Stats
  private totalImuReadings = 0;
  private totalGestures = 0;
  private totalButtonPresses = 0;
  private reconnectCount = 0;
  private lastEventTime: number | null = null;

  // IMU rate estimation (readings in the last second)
  private imuTimestamps: number[] = [];

  // Timers
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private keepaliveTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 1000;

  // Partial SSE data buffer (TCP chunks may not align with SSE boundaries)
  private sseBuffer = "";
  private buttonListeners = new Set<(event: ButtonPressEvent) => void | Promise<void>>();

  get connected(): boolean { return this._connected; }

  onButtonPress(listener: (event: ButtonPressEvent) => void | Promise<void>) {
    this.buttonListeners.add(listener);
    return () => {
      this.buttonListeners.delete(listener);
    };
  }

  /**
   * Connect to the on-device SSE event stream and start consuming sensor data.
   * Also starts the IMU stream on the device via MCU command.
   */
  connect(opts?: { host?: string; port?: number; token?: string }) {
    if (this._connected || this.request || this.reconnectTimer || this.heartbeatTimer || this.keepaliveTimer) {
      this.disconnect();
    }

    this.targetHost = opts?.host || "127.0.0.1";
    this.targetPort = opts?.port || 8080;
    this.authToken = opts?.token || null;
    this._targetUrl = `http://${this.targetHost}:${this.targetPort}/api/events`;
    this.reconnectDelay = 1000;

    console.log(`[SensorBridge] Connecting to ${this._targetUrl}`);

    this.openSSE();
    this.startHeartbeatMonitor();
    this.startKeepalive();
  }

  /** Disconnect from SSE stream and clean up */
  disconnect() {
    this._connected = false;
    this._targetUrl = null;

    if (this.request) {
      this.request.destroy();
      this.request = null;
    }
    if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null; }
    if (this.keepaliveTimer) { clearInterval(this.keepaliveTimer); this.keepaliveTimer = null; }
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }

    this.sseBuffer = "";
    console.log("[SensorBridge] Disconnected");
  }

  /**
   * Snapshot current sensor state — synchronized with frame capture.
   * Returns the latest readings with staleness info and derived values.
   *
   * @param toleranceMs - max age for IMU reading to be included (default 50ms)
   */
  snapshot(toleranceMs = 50): SensorSnapshot {
    const now = Date.now();
    const snap: SensorSnapshot = {};

    // IMU
    const latestImu = this.imuBuffer.latest();
    if (latestImu) {
      const age = now - latestImu.timestamp;
      snap.imu = latestImu;
      snap.imuAgeMs = age;

      // Only compute derived values if reading is fresh enough
      if (age <= toleranceMs) {
        const [ax, ay, az] = latestImu.accel;

        // Head orientation from gravity vector
        // pitch: positive = looking up, negative = looking down
        // roll: positive = tilted right, negative = tilted left
        snap.orientation = {
          pitchDeg: Math.atan2(ay, Math.sqrt(ax * ax + az * az)) * (180 / Math.PI),
          rollDeg: Math.atan2(-ax, az) * (180 / Math.PI),
        };

        // Residual acceleration (subtract gravity)
        snap.motionMagnitude = Math.abs(Math.sqrt(ax * ax + ay * ay + az * az) - 9.81);
      }

      // Stillness from ring buffer history (independent of tolerance)
      snap.isStill = this.imuBuffer.isStill(STILLNESS_THRESHOLD, STILLNESS_SAMPLES);
    }

    // Gesture
    if (this.latestGesture) {
      snap.gesture = this.latestGesture;
      snap.gestureAgeMs = now - this.latestGesture.timestamp;
    }

    // Battery
    if (this.latestBattery) {
      snap.battery = this.latestBattery;
    }

    // MCU connection
    if (this.mcuConnected !== null) {
      snap.mcuConnected = this.mcuConnected;
    }

    return snap;
  }

  /** Get IMU history for temporal analysis (last N milliseconds) */
  getImuHistory(durationMs: number): ImuReading[] {
    return this.imuBuffer.getHistory(durationMs);
  }

  /** Get bridge statistics */
  getStats(): SensorBridgeStats {
    // Calculate IMU rate from timestamps in the last second
    const now = Date.now();
    this.imuTimestamps = this.imuTimestamps.filter(t => now - t < 1000);

    return {
      connected: this._connected,
      targetUrl: this._targetUrl,
      imuRate: this.imuTimestamps.length,
      totalImuReadings: this.totalImuReadings,
      totalGestures: this.totalGestures,
      totalButtonPresses: this.totalButtonPresses,
      latestButtonPress: this.latestButtonPress,
      reconnectCount: this.reconnectCount,
      lastEventTime: this.lastEventTime,
      ringBufferSize: this.imuBuffer.size,
    };
  }

  // ── SSE Connection ─────────────────────────────────

  private openSSE() {
    const headers: Record<string, string> = {
      "Accept": "text/event-stream",
      "Cache-Control": "no-cache",
    };
    if (this.authToken) {
      headers["X-LabOS-Token"] = this.authToken;
    }

    const req = http.request(
      {
        hostname: this.targetHost,
        port: this.targetPort,
        path: "/api/events",
        method: "GET",
        headers,
        timeout: 0,  // no timeout — SSE is long-lived
      },
      (res) => {
        if (res.statusCode !== 200) {
          console.error(`[SensorBridge] SSE connection failed: HTTP ${res.statusCode}`);
          res.resume();
          this.scheduleReconnect();
          return;
        }

        this._connected = true;
        this.reconnectDelay = 1000;  // reset backoff on successful connect
        this.sseBuffer = "";
        console.log("[SensorBridge] SSE connected — consuming sensor events");

        // Start IMU stream on the device
        this.requestImuStart("connect");

        res.setEncoding("utf-8");
        res.on("data", (chunk: string) => {
          this.lastEventTime = Date.now();
          this.sseBuffer += chunk;

          // Process complete SSE blocks (delimited by double newlines)
          const events = parseSSEChunk(this.sseBuffer);

          // Keep any incomplete trailing data
          const lastDoubleNewline = this.sseBuffer.lastIndexOf("\n\n");
          if (lastDoubleNewline >= 0) {
            this.sseBuffer = this.sseBuffer.slice(lastDoubleNewline + 2);
          }

          for (const event of events) {
            this.handleEvent(event);
          }
        });

        res.on("end", () => {
          console.log("[SensorBridge] SSE connection closed by server");
          this._connected = false;
          this.scheduleReconnect();
        });

        res.on("error", (err) => {
          console.error(`[SensorBridge] SSE stream error: ${err.message}`);
          this._connected = false;
          this.scheduleReconnect();
        });
      }
    );

    req.on("error", (err) => {
      console.error(`[SensorBridge] Connection error: ${err.message}`);
      this._connected = false;
      this.scheduleReconnect();
    });

    req.end();
    this.request = req;
  }

  private handleEvent(event: SSEEvent) {
    try {
      const data = JSON.parse(event.data);

      switch (event.event) {
        case "imu": {
          const reading: ImuReading = {
            timestamp: Date.now(),
            accel: [data.accel?.[0] ?? 0, data.accel?.[1] ?? 0, data.accel?.[2] ?? 0],
            gyro: [data.gyro?.[0] ?? 0, data.gyro?.[1] ?? 0, data.gyro?.[2] ?? 0],
          };
          this.imuBuffer.push(reading);
          this.totalImuReadings++;
          this.imuTimestamps.push(Date.now());
          break;
        }

        case "gesture": {
          this.latestGesture = {
            timestamp: Date.now(),
            gesture: data.gesture || data.type || "unknown",
          };
          this.totalGestures++;
          break;
        }

        case "battery": {
          this.latestBattery = {
            level: data.percent ?? data.level ?? 0,
            voltage: data.voltage,
          };
          break;
        }

        case "connection": {
          this.mcuConnected = data.connected ?? data.state === "connected";
          break;
        }

        case "status": {
          // Initial status event on connect — populate battery + MCU state
          if (data.battery) {
            this.latestBattery = {
              level: data.battery.percent ?? data.battery.level ?? 0,
              voltage: data.battery.voltage,
            };
          }
          if (data.mcuConnected !== undefined) {
            this.mcuConnected = data.mcuConnected;
          }
          break;
        }

        // button, mcu — logged but not tracked in snapshot (low frequency, not needed for frame sync)
        case "button": {
          const buttonEvent: ButtonPressEvent = {
            timestamp: Date.now(),
            buttonId: data.buttonId || data.button || "unknown",
            isLongPress: data.longPress === true || data.isLongPress === true,
          };
          this.latestButtonPress = buttonEvent;
          this.totalButtonPresses++;
          for (const listener of this.buttonListeners) {
            void Promise.resolve(listener(buttonEvent)).catch((error) => {
              console.warn(`[SensorBridge] Button listener failed: ${error?.message || error}`);
            });
          }
          break;
        }

        default:
          break;
      }
    } catch {
      // Malformed JSON — skip silently (SSE can have comment lines starting with :)
    }
  }

  // ── IMU Keepalive ──────────────────────────────────

  /** Send IMU stream start command to the device (via MCU command endpoint) */
  sendImuStart(): Promise<void> {
    return this.sendMcuCommand('{"cmd": "imu_stream", "action": "start"}');
  }

  /** Send IMU stream stop command */
  sendImuStop(): Promise<void> {
    return this.sendMcuCommand('{"cmd": "imu_stream", "action": "stop"}');
  }

  /** Send a raw MCU command to the device */
  private sendMcuCommand(command: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const body = JSON.stringify({ command });

      const req = http.request(
        {
          hostname: this.targetHost,
          port: this.targetPort,
          path: "/api/mcu/command",
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(body),
            ...(this.authToken ? { "X-LabOS-Token": this.authToken } : {}),
          },
          timeout: 5000,
        },
        (res) => { res.resume(); resolve(); }
      );
      req.on("error", (err) => reject(err));
      req.on("timeout", () => { req.destroy(); reject(new Error("MCU command timeout")); });
      req.write(body);
      req.end();
    });
  }

  private requestImuStart(reason: string) {
    void this.sendImuStart().catch((error) => {
      this.mcuConnected = false;
      console.warn(`[SensorBridge] IMU keepalive failed during ${reason}: ${error?.message || error}`);
    });
  }

  private startKeepalive() {
    // Device auto-stops IMU after 60s — re-subscribe every 50s
    this.keepaliveTimer = setInterval(() => {
      if (this._connected) {
        this.requestImuStart("keepalive");
      }
    }, KEEPALIVE_INTERVAL);
  }

  // ── Heartbeat & Reconnect ──────────────────────────

  private startHeartbeatMonitor() {
    this.heartbeatTimer = setInterval(() => {
      if (!this._connected) return;

      const now = Date.now();
      if (this.lastEventTime && (now - this.lastEventTime) > HEARTBEAT_TIMEOUT) {
        console.warn("[SensorBridge] No events for 10s — forcing reconnect");
        this._connected = false;
        if (this.request) { this.request.destroy(); this.request = null; }
        this.scheduleReconnect();
      }
    }, HEARTBEAT_TIMEOUT / 2);
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;  // already scheduled
    if (!this._targetUrl) return;      // disconnect() was called

    this.reconnectCount++;
    console.log(`[SensorBridge] Reconnecting in ${this.reconnectDelay}ms (attempt #${this.reconnectCount})`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.openSSE();
    }, this.reconnectDelay);

    // Exponential backoff: 1s → 2s → 4s → 8s → ... → 30s max
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, MAX_RECONNECT_DELAY);
  }
}

/** Singleton sensor bridge instance */
export const sensorBridge = new SensorBridge();
