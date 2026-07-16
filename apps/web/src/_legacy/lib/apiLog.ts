/**
 * Global API request logger.
 *
 * Captures every request through the `request()` helper so the DevPanel
 * can display a live feed of method, URL, status, timing, payloads, and responses.
 * Also generates SDK code snippets and CLI equivalents for each call.
 */

export interface ApiLogEntry {
  id: number;
  timestamp: number;
  method: string;
  url: string;
  requestBody?: any;
  status?: number;
  responseBody?: any;
  durationMs?: number;
  error?: string;
}

const MAX_ENTRIES = 100;
let entries: ApiLogEntry[] = [];
let nextId = 1;
let listeners: Array<() => void> = [];

/** Subscribe to log changes. Returns unsubscribe function. */
export function subscribeApiLog(fn: () => void): () => void {
  listeners.push(fn);
  return () => { listeners = listeners.filter(l => l !== fn); };
}

export function getApiLog(): ApiLogEntry[] {
  return entries;
}

export function clearApiLog() {
  entries = [];
  listeners.forEach(fn => fn());
}

/** Called by the request() helper to log an outgoing request. Returns entry ID. */
export function logRequest(method: string, url: string, body?: any): number {
  const id = nextId++;
  entries = [{ id, timestamp: Date.now(), method, url, requestBody: body }, ...entries].slice(0, MAX_ENTRIES);
  listeners.forEach(fn => fn());
  return id;
}

/** Called when a response comes back. */
export function logResponse(id: number, status: number, body: any, durationMs: number) {
  entries = entries.map(e => e.id === id ? { ...e, status, responseBody: body, durationMs } : e);
  listeners.forEach(fn => fn());
}

/** Called on error. */
export function logError(id: number, error: string, durationMs: number) {
  entries = entries.map(e => e.id === id ? { ...e, error, durationMs } : e);
  listeners.forEach(fn => fn());
}

/** Generate a curl command equivalent. */
export function toCurl(entry: ApiLogEntry): string {
  const parts = [`curl -s`];
  if (entry.method !== "GET") parts.push(`-X ${entry.method}`);
  parts.push(`'http://localhost:3847${entry.url}'`);
  parts.push(`-H 'Content-Type: application/json'`);
  if (entry.requestBody) {
    parts.push(`-d '${JSON.stringify(entry.requestBody)}'`);
  }
  return parts.join(" \\\n  ");
}

/** Generate TypeScript SDK snippet. */
export function toSdkSnippet(entry: ApiLogEntry): string {
  // Derive function name from URL pattern
  const segments = entry.url.replace(/^\/api\//, "").split("/").filter(Boolean);
  const fnName = segments.map((s, i) => i === 0 ? s : s[0].toUpperCase() + s.slice(1)).join("");

  const lines: string[] = [];
  lines.push(`import { labos } from "@labos/sdk";`);
  lines.push(``);

  if (entry.method === "GET") {
    lines.push(`const result = await labos.${fnName}();`);
  } else {
    const bodyStr = entry.requestBody ? JSON.stringify(entry.requestBody, null, 2) : "{}";
    lines.push(`const result = await labos.${fnName}(${bodyStr});`);
  }

  lines.push(`console.log(result);`);
  return lines.join("\n");
}

/** Generate CLI equivalent. */
export function toCliCommand(entry: ApiLogEntry): string {
  const path = entry.url.replace(/^\/api\//, "");
  if (entry.method === "GET") {
    return `labos ${path.replace(/\//g, " ")}`;
  }
  const args = entry.requestBody
    ? Object.entries(entry.requestBody).map(([k, v]) => `--${k} ${JSON.stringify(v)}`).join(" ")
    : "";
  return `labos ${path.replace(/\//g, " ")} ${args}`.trim();
}
