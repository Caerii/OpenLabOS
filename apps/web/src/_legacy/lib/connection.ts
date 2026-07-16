/**
 * Connection manager — handles routing API calls to the right backend.
 *
 * In production (Vercel), there's no local Express server.
 * Instead:
 *   - Device ops → glasses HTTP API directly (WiFi, port 8080)
 *   - AI ops → cloud backend (Railway/Fly.io)
 *
 * In development:
 *   - Everything → localhost:3847 (Vite proxy handles it)
 */

export interface ConnectionConfig {
  /** Glasses direct IP (e.g. "192.168.50.122") */
  glassesIp: string | null;
  /** Cloud AI backend URL (e.g. "https://labos-api.railway.app") */
  aiBackendUrl: string | null;
  /** Auth token for glasses HTTP API */
  glassesToken: string | null;
  /** Auth token for cloud backend */
  backendToken: string | null;
}

const STORAGE_KEY = "labos_connection";

let config: ConnectionConfig = loadConfig();

function loadConfig(): ConnectionConfig {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return { glassesIp: null, aiBackendUrl: null, glassesToken: null, backendToken: null };
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function getConnectionConfig(): ConnectionConfig {
  return { ...config };
}

export function setGlassesIp(ip: string | null) {
  config.glassesIp = ip;
  save();
}

export function setGlassesToken(token: string | null) {
  config.glassesToken = token;
  save();
}

export function setAiBackendUrl(url: string | null) {
  config.aiBackendUrl = url?.replace(/\/$/, "") || null;
  save();
}

export function setBackendToken(token: string | null) {
  config.backendToken = token;
  save();
}

/** Whether we're running in production (Vercel) or local dev */
export function isProduction(): boolean {
  return import.meta.env.PROD;
}

/** Whether glasses are configured for direct connection */
export function hasGlassesConnection(): boolean {
  return !!config.glassesIp;
}

/** Whether cloud AI backend is configured */
export function hasAiBackend(): boolean {
  return !!config.aiBackendUrl;
}

/**
 * Get the base URL for device/glasses API calls.
 * - Dev mode: "" (proxied by Vite to localhost:3847)
 * - Production + glasses IP: "http://<ip>:8080"
 * - Production + no glasses: null (not connected)
 */
export function getDeviceBase(): string | null {
  if (!isProduction()) return "";
  if (config.glassesIp) return `http://${config.glassesIp}:8080`;
  return null;
}

/**
 * Get the base URL for AI API calls.
 * - Dev mode: "" (proxied by Vite to localhost:3847)
 * - Production + cloud backend: the backend URL
 * - Production + no backend: null
 */
export function getAiBase(): string | null {
  if (!isProduction()) return "";
  return config.aiBackendUrl;
}

/**
 * Get auth headers for glasses API.
 */
export function getGlassesHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  if (config.glassesToken) {
    headers["X-LabOS-Token"] = config.glassesToken;
  }
  return headers;
}

/**
 * Get auth headers for cloud backend.
 */
export function getBackendHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  if (config.backendToken) {
    headers["Authorization"] = `Bearer ${config.backendToken}`;
  }
  return headers;
}

/**
 * Attempt to connect to glasses and fetch auth token.
 */
export async function connectToGlasses(ip: string): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`http://${ip}:8080/api/auth/token`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    setGlassesIp(ip);
    if (data.token) setGlassesToken(data.token);
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message || "Connection failed" };
  }
}

/**
 * Deploy an APK to glasses by URL.
 * Uses the on-device install-url endpoint (device owner silent install).
 */
export async function deployApkToGlasses(apkUrl: string): Promise<{ success: boolean; error?: string }> {
  const base = getDeviceBase();
  if (!base) return { success: false, error: "Not connected to glasses" };

  try {
    const res = await fetch(`${base}/api/dev/packages/install-url`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getGlassesHeaders() },
      body: JSON.stringify({ url: apkUrl }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}
