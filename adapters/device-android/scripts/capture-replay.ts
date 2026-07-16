/**
 * Capture-replay tool.
 *
 * Runs every read-only endpoint of the live device and writes responses
 * to tests/replay/<endpoint>.json. The committed fixtures become the
 * regression baseline: any future firmware drift that changes a response
 * shape fails the parity test in tests/replay.test.ts.
 *
 * Usage:
 *   tsx scripts/capture-replay.ts <ip> --token <TOK> [--port 8080]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DeviceClient } from "../src/client.js";

const here = dirname(fileURLToPath(import.meta.url));
const replayDir = resolve(here, "..", "tests", "replay");

interface Args {
  ip?: string;
  port: number;
  token?: string;
}

function parseArgs(argv: string[]): Args {
  const out: Args = { port: 8080 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === undefined) continue;
    if (a === "--port") out.port = Number(argv[++i]);
    else if (a === "--token") out.token = argv[++i];
    else if (!a.startsWith("--") && !out.ip) out.ip = a;
  }
  return out;
}

interface ProbeSpec {
  name: string;
  request: { method: "GET" | "POST"; path: string; body?: string };
  capture: () => Promise<unknown>;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.ip) {
    console.error("usage: capture-replay <ip> --token TOK");
    process.exit(2);
  }
  const baseUrl = `http://${args.ip}:${args.port}`;
  const client = new DeviceClient({ baseUrl, token: args.token });

  const probes: ProbeSpec[] = [
    { name: "health", request: { method: "GET", path: "/health" }, capture: () => client.health() },
    { name: "auth-token", request: { method: "GET", path: "/api/auth/token" }, capture: () => client.authToken() },
    { name: "status", request: { method: "GET", path: "/api/status" }, capture: () => client.status() },
    { name: "system-info", request: { method: "GET", path: "/api/system/info" }, capture: () => client.systemInfo() },
    { name: "battery-summary", request: { method: "GET", path: "/api/battery/summary" }, capture: () => client.batterySummary() },
    { name: "battery-history", request: { method: "GET", path: "/api/battery/history" }, capture: () => client.batteryHistory() },
    { name: "wifi-status", request: { method: "GET", path: "/api/wifi/status" }, capture: () => client.wifiStatus() },
    { name: "mcu-status", request: { method: "GET", path: "/api/mcu/status" }, capture: () => client.mcuStatus() },
    { name: "settings", request: { method: "GET", path: "/api/settings" }, capture: () => client.getSettings() },
    { name: "preview-health", request: { method: "GET", path: "/api/preview/health" }, capture: () => client.previewHealth() },
    { name: "live-coach-audio-status", request: { method: "GET", path: "/api/live-coach/audio/status" }, capture: () => client.liveCoachAudioStatus() },
    { name: "dev-shell-echo", request: { method: "POST", path: "/api/dev/shell", body: '{"command":"echo openlabos"}' }, capture: () => client.devShell({ command: "echo openlabos" }) },
    { name: "dev-props", request: { method: "GET", path: "/api/dev/props" }, capture: () => client.devProps() },
    { name: "dev-packages", request: { method: "GET", path: "/api/dev/packages" }, capture: () => client.devListPackages() },
    { name: "dev-files-sdcard", request: { method: "GET", path: "/api/dev/files?path=%2Fsdcard" }, capture: () => client.devListFiles("/sdcard") },
    { name: "dev-crashes", request: { method: "GET", path: "/api/dev/crashes" }, capture: () => client.devCrashes() },
  ];

  mkdirSync(replayDir, { recursive: true });

  const manifest: Array<{
    name: string;
    request: ProbeSpec["request"];
    response_keys: string[];
    response_type: string;
  }> = [];

  for (const p of probes) {
    try {
      const response = await p.capture();
      const sanitised = sanitise(response);
      const file = resolve(replayDir, `${p.name}.json`);
      writeFileSync(
        file,
        JSON.stringify(
          { fixture_version: 1, name: p.name, request: p.request, response: sanitised },
          null,
          2,
        ) + "\n",
        "utf8",
      );
      const keys =
        sanitised && typeof sanitised === "object" && !Array.isArray(sanitised)
          ? Object.keys(sanitised as object).sort()
          : [];
      manifest.push({
        name: p.name,
        request: p.request,
        response_keys: keys,
        response_type: Array.isArray(sanitised) ? "array" : typeof sanitised,
      });
      console.log(`✓ ${p.name.padEnd(28)} → ${file}`);
    } catch (err) {
      console.error(`✗ ${p.name}: ${(err as Error).message}`);
    }
  }

  writeFileSync(
    resolve(replayDir, "manifest.json"),
    JSON.stringify(
      {
        manifest_version: 1,
        captured_at: new Date().toISOString(),
        captured_against: baseUrl,
        probes: manifest,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(`\n✓ wrote ${manifest.length} fixtures + manifest.json`);
}

/**
 * Strip volatile fields so fixtures are reproducible across runs:
 *   - timestamps and UUIDs become "<timestamp>" / "<uuid>"
 *   - tokens become "<token>"
 *   - large lists are truncated to a representative head
 */
function sanitise(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    if (value.length > 8) return [...value.slice(0, 8).map(sanitise), "<truncated>"];
    return value.map(sanitise);
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (/timestamp|_at$|^at$|uptimeMs|uptime_ms/i.test(k)) {
      out[k] = "<timestamp>";
    } else if (/token/i.test(k)) {
      out[k] = "<token>";
    } else if (/percent|voltage/i.test(k) && typeof v === "number") {
      out[k] = "<numeric>";
    } else if (/rssi|fps|frameCount|frequency|link_speed|logSizeBytes/i.test(k) && typeof v === "number") {
      out[k] = "<numeric>";
    } else if (/^ssid$/i.test(k)) {
      out[k] = "<ssid>";
    } else if (/^ip$/i.test(k)) {
      out[k] = "<ip>";
    } else if (/^stdout$|^command$/.test(k)) {
      out[k] = typeof v === "string" ? v : "<string>";
    } else {
      out[k] = sanitise(v);
    }
  }
  return out;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
