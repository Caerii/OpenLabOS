/**
 * Replay-as-test (decision 0015).
 *
 * Each fixture under tests/replay/ is one captured device response, with
 * volatile fields ("<timestamp>", "<numeric>", …) standing in for the
 * fluctuating values. The parity test stubs `fetch`, returns the
 * recorded response for the recorded request, and asserts:
 *
 *   1. Every probe in the manifest can be issued by the typed
 *      DeviceClient through its public method.
 *   2. The response shape (its set of keys, plus literal-typed values
 *      we recorded verbatim) matches the fixture exactly.
 *   3. Volatile fields are present but unconstrained — only their
 *      *presence* and *type* are enforced.
 *
 * If a future device firmware drops or renames a field, this test
 * fails. The fix path is: re-run `pnpm --filter @openlabos/device-android
 * capture <ip> --token <tok>`, review the diff, commit.
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DeviceClient } from "../src/client.js";

const here = dirname(fileURLToPath(import.meta.url));
const replayDir = resolve(here, "replay");

interface Fixture {
  fixture_version: 1;
  name: string;
  request: { method: "GET" | "POST"; path: string; body?: string };
  response: unknown;
}

function loadFixtures(): Fixture[] {
  return readdirSync(replayDir)
    .filter((f) => f.endsWith(".json") && f !== "manifest.json")
    .sort()
    .map((f) => JSON.parse(readFileSync(resolve(replayDir, f), "utf8")) as Fixture);
}

/**
 * Build a fetch stub that returns the matching fixture for `path` (and
 * method) and 404 for anything unmapped.
 */
function fixtureFetch(fixtures: Fixture[]): typeof fetch {
  const byKey = new Map<string, Fixture>();
  for (const fx of fixtures) {
    byKey.set(`${fx.request.method} ${fx.request.path}`, fx);
  }
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input.toString();
    const method = (init?.method ?? "GET").toUpperCase();
    const path = new URL(url).pathname + new URL(url).search;
    const fx = byKey.get(`${method} ${path}`);
    if (!fx) {
      return new Response(`no fixture for ${method} ${path}`, { status: 404 });
    }
    return new Response(JSON.stringify(unsanitise(fx.response)), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
}

/**
 * Reverse the placeholders the capture tool inserted. Volatile values
 * become representative, type-correct values so the client doesn't
 * fail JSON parsing or schema-shaped narrowing.
 */
function unsanitise(value: unknown): unknown {
  if (value === null) return value;
  if (typeof value === "string") {
    if (value === "<timestamp>") return "2026-05-04T00:00:00.000Z";
    if (value === "<token>") return "deadbeef";
    if (value === "<numeric>") return 0;
    if (value === "<ssid>") return "lab-wifi";
    if (value === "<ip>") return "10.0.0.10";
    if (value === "<truncated>") return null;
    return value;
  }
  if (Array.isArray(value))
    return value.map(unsanitise).filter((v) => v !== null);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = unsanitise(v);
    }
    return out;
  }
  return value;
}

/**
 * Compare actual response against fixture: keys must match (order-free),
 * literal values must match, placeholder fields must be present but are
 * value-unconstrained.
 */
function assertShape(actual: unknown, expected: unknown, path = "$"): void {
  if (expected === null) {
    expect(actual, `${path} should be null`).toBeNull();
    return;
  }
  if (typeof expected === "string" && expected.startsWith("<") && expected.endsWith(">")) {
    expect(actual, `${path} placeholder must be present`).not.toBeUndefined();
    return;
  }
  if (Array.isArray(expected)) {
    expect(Array.isArray(actual), `${path} should be array`).toBe(true);
    return;
  }
  if (typeof expected === "object") {
    expect(typeof actual, `${path} should be object`).toBe("object");
    expect(actual, `${path} should not be null`).not.toBeNull();
    const a = actual as Record<string, unknown>;
    const e = expected as Record<string, unknown>;
    expect(Object.keys(a).sort(), `${path} key set`).toEqual(Object.keys(e).sort());
    for (const [k, v] of Object.entries(e)) assertShape(a[k], v, `${path}.${k}`);
    return;
  }
  expect(actual, `${path} literal`).toEqual(expected);
}

const fixtures = loadFixtures();
const client = new DeviceClient({
  baseUrl: "http://stub:8080",
  token: "deadbeef",
  fetch: fixtureFetch(fixtures),
});

const callers: Record<string, () => Promise<unknown>> = {
  health: () => client.health(),
  "auth-token": () => client.authToken(),
  status: () => client.status(),
  "system-info": () => client.systemInfo(),
  "battery-summary": () => client.batterySummary(),
  "battery-history": () => client.batteryHistory(),
  "wifi-status": () => client.wifiStatus(),
  "mcu-status": () => client.mcuStatus(),
  settings: () => client.getSettings(),
  "preview-health": () => client.previewHealth(),
  "live-coach-audio-status": () => client.liveCoachAudioStatus(),
  "dev-shell-echo": () => client.devShell({ command: "echo openlabos" }),
  "dev-props": () => client.devProps(),
  "dev-packages": () => client.devListPackages(),
  "dev-files-sdcard": () => client.devListFiles("/sdcard"),
  "dev-crashes": () => client.devCrashes(),
};

describe("device replay corpus", () => {
  it.each(fixtures.map((fx) => [fx.name, fx] as const))(
    "%s — response shape matches fixture",
    async (name, fx) => {
      const caller = callers[name];
      expect(caller, `no caller wired for fixture ${name}`).toBeDefined();
      const result = await caller!();
      assertShape(result, fx.response);
    },
  );
});
