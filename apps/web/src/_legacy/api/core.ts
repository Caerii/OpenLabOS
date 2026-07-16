import { logError, logRequest, logResponse } from "../lib/apiLog";

export type ConnectionMode = "adb" | "wifi";

const LOCAL_API_BASE_STORAGE_KEY = "labos_local_backend_api";
const LOCAL_API_URL_PARAM = "localBackend";
const DESKTOP_LOCAL_API_BASE = "http://127.0.0.1:3847";

function storageGet(key: string) {
  try {
    return typeof localStorage === "undefined" ? "" : localStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

function storageSet(key: string, value: string) {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(key, value);
  } catch {}
}

function storageRemove(key: string) {
  try {
    if (typeof localStorage !== "undefined") localStorage.removeItem(key);
  } catch {}
}

let connectionMode: ConnectionMode = (storageGet("labos_mode") as ConnectionMode) || "adb";
let wifiBaseUrl = storageGet("labos_wifi_base");
let apiToken = storageGet("labos_api_token");
let localApiBase = loadLocalBackendBaseFromEnv();

function normalizeLocalBackendBase(value: string): string {
  let trimmed = value.trim();
  if (!trimmed) return "";

  // Remove common wrappers and trailing punctuation characters from copy/paste.
  trimmed = trimmed.replace(/^\s*["'`<({\[\s]+/, "");
  trimmed = trimmed.replace(/[\s"'"`)>}\]\. ,;:]+$/, "");
  trimmed = trimmed.replace(/\/+$/, "");
  trimmed = trimmed.replace(/[)\]}>"'`.,;:]+$/, "");

  if (!trimmed) return "";

  const withScheme = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `http://${trimmed}`;

  try {
    const parsed = new URL(withScheme);
    if (!/^https?:$/i.test(parsed.protocol)) return "";
    return parsed.origin;
  } catch {
    return "";
  }
}

function sanitizeStoredBackend(value: string): string {
  const normalized = normalizeLocalBackendBase(value);
  return normalized;
}

function loadLocalBackendBaseFromEnv() {
  try {
    if (typeof window === "undefined") return "";
    const params = new URLSearchParams(window.location.search);
    const value = params.get(LOCAL_API_URL_PARAM);
    if (value) {
      const base = sanitizeStoredBackend(value);
      if (base) storageSet(LOCAL_API_BASE_STORAGE_KEY, base);
      return base;
    }
  } catch {}

  const stored = storageGet(LOCAL_API_BASE_STORAGE_KEY);
  const sanitized = sanitizeStoredBackend(stored);
  if (sanitized && sanitized !== stored) {
    storageSet(LOCAL_API_BASE_STORAGE_KEY, sanitized);
  }
  if (sanitized) return sanitized;
  return isTauriDesktopLocation() ? DESKTOP_LOCAL_API_BASE : "";
}

function isTauriDesktopLocation() {
  try {
    if (typeof window === "undefined") return false;
    const { protocol, hostname } = window.location;
    return protocol === "tauri:" || hostname === "tauri.localhost" || hostname.endsWith(".tauri.localhost");
  } catch {
    return false;
  }
}

function isLocalBackendRoute(path: string) {
  return [
    "/api/device",
    "/api/apps",
    "/api/labos",
    "/api/system",
    "/api/hardware",
    "/api/mcu",
    "/api/files",
    "/api/network",
    "/api/settings",
    "/api/ota",
    "/api/console",
    "/api/preview",
    "/api/battery",
    "/api/audio",
    "/api/buttons",
    "/api/wifi-proxy",
    "/api/health",
    "/api/kitchen",
    "/api/local-agent",
  ].some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

function apiBaseFor(path: string) {
  if (isLocalBackendRoute(path) && localApiBase) return localApiBase;
  return getBase();
}

export function getApiUrl(path: string): string {
  return `${apiBaseFor(path)}${path}`;
}

export function getConnectionMode(): ConnectionMode {
  return connectionMode;
}

export function setConnectionMode(mode: ConnectionMode) {
  connectionMode = mode;
  storageSet("labos_mode", mode);
}

export function setWifiBase(glassesIp: string) {
  wifiBaseUrl = `http://${glassesIp}:8080`;
  storageSet("labos_wifi_base", wifiBaseUrl);
}

export function getWifiBase(): string {
  return wifiBaseUrl;
}

export function setApiToken(token: string) {
  apiToken = token;
  storageSet("labos_api_token", token);
}

export function setLocalBackendBase(base: string) {
  localApiBase = normalizeLocalBackendBase(base);
  if (localApiBase) {
    storageSet(LOCAL_API_BASE_STORAGE_KEY, localApiBase);
  } else {
    storageRemove(LOCAL_API_BASE_STORAGE_KEY);
  }
}

export function getLocalBackendBase(): string {
  return localApiBase;
}

export function getApiToken(): string {
  return apiToken;
}

export function getBase(): string {
  return connectionMode === "wifi" ? wifiBaseUrl : "";
}

export function mergeWifiAuth(headers: Record<string, string>): Record<string, string> {
  if (connectionMode === "wifi" && apiToken) {
    return { ...headers, "X-LabOS-Token": apiToken };
  }
  return headers;
}

function toHeaderRecord(headers?: HeadersInit): Record<string, string> {
  const record: Record<string, string> = {};
  if (!headers) return record;
  new Headers(headers).forEach((value, key) => {
    record[key] = value;
  });
  return record;
}

export function parseHumanSizeToMB(s: string | null | undefined): number {
  if (!s) return 0;
  const n = parseFloat(s);
  if (s.endsWith("G")) return n * 1024;
  if (s.endsWith("M")) return n;
  if (s.endsWith("K")) return n / 1024;
  return n;
}

export function withQuery(path: string, params?: Record<string, unknown>): string {
  if (!params) return path;
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `${path}?${qs}` : path;
}

export async function postFormJson<T>(path: string, form: FormData): Promise<T> {
  const res = await fetch(getApiUrl(path), {
    method: "POST",
    body: form,
    headers: mergeWifiAuth({}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data as T;
}

export async function request<T>(url: string, opts?: RequestInit): Promise<T> {
  const headers = mergeWifiAuth({
    "Content-Type": "application/json",
    ...toHeaderRecord(opts?.headers),
  });

  const method = (opts?.method || "GET").toUpperCase();
  let body: any;
  try {
    body = opts?.body ? JSON.parse(opts.body as string) : undefined;
  } catch {
    body = opts?.body;
  }

  const logId = logRequest(method, url, body);
  const t0 = performance.now();

  try {
    const res = await fetch(getApiUrl(url), { ...opts, headers });
    const rawText = await res.text();
    let data: any = {};
    if (rawText && rawText.trim().length > 0) {
      try {
        data = JSON.parse(rawText);
      } catch {
        data = { error: rawText.slice(0, 500) };
      }
    }
    const durationMs = Math.round(performance.now() - t0);
    logResponse(logId, res.status, data, durationMs);
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data as T;
  } catch (err: any) {
    const durationMs = Math.round(performance.now() - t0);
    logError(logId, err.message, durationMs);
    throw err;
  }
}

function jsonRequest<T>(method: "POST" | "PUT" | "DELETE", url: string, body?: unknown): Promise<T> {
  return request<T>(url, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

export function postJson<T>(url: string, body?: unknown): Promise<T> {
  return jsonRequest("POST", url, body);
}

export function putJson<T>(url: string, body?: unknown): Promise<T> {
  return jsonRequest("PUT", url, body);
}

export function deleteJson<T>(url: string, body?: unknown): Promise<T> {
  return jsonRequest("DELETE", url, body);
}

export async function fetchApiToken(): Promise<string> {
  const res = await fetch(`${wifiBaseUrl}/api/auth/token`);
  const data = await res.json();
  if (data.token) {
    setApiToken(data.token);
    return data.token;
  }
  throw new Error("No token in response");
}

export function getPreviewStreamUrl(): string {
  if (connectionMode === "wifi") {
    const tokenParam = apiToken ? `?token=${apiToken}` : "";
    return `${wifiBaseUrl}/api/preview/stream${tokenParam}`;
  }
  const tokenParam = apiToken ? `?token=${apiToken}` : "";
  return `${getApiUrl("/api/preview/stream")}${tokenParam}`;
}

export function getPreviewFrameUrl(): string {
  if (connectionMode === "wifi") {
    const tokenParam = apiToken ? `?token=${apiToken}` : "";
    return `${wifiBaseUrl}/api/preview/frame${tokenParam}`;
  }
  const tokenParam = apiToken ? `?token=${apiToken}` : "";
  return `${getApiUrl("/api/preview/frame")}${tokenParam}`;
}
