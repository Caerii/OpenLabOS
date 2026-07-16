/**
 * Device smoke harness.
 *
 * Usage:
 *   pnpm --filter @openlabos/device-android smoke <ip> [--port 8080] [--token TOK]
 *
 * Exercises every endpoint the on-device dashboard server exposes,
 * reporting PASS / FAIL / SKIP per capability. The harness never modifies
 * persistent state without an explicit --write flag.
 */
import { AndroidDeviceAdapter } from "./adapter.js";
import { DeviceClient } from "./client.js";

interface Args {
  ip?: string;
  port: number;
  token?: string;
  write: boolean;
  timeoutMs: number;
}

function parseArgs(argv: string[]): Args {
  const out: Args = { port: 8080, write: false, timeoutMs: 8000 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === undefined) continue;
    if (a === "--port") out.port = Number(argv[++i]);
    else if (a === "--token") out.token = argv[++i];
    else if (a === "--write") out.write = true;
    else if (a === "--timeout") out.timeoutMs = Number(argv[++i]);
    else if (!a.startsWith("--") && !out.ip) out.ip = a;
  }
  return out;
}

interface Result {
  name: string;
  status: "PASS" | "FAIL" | "SKIP";
  detail?: string;
}

async function run(name: string, fn: () => Promise<unknown>): Promise<Result> {
  try {
    const v = await fn();
    return {
      name,
      status: "PASS",
      detail: typeof v === "object" ? truncate(JSON.stringify(v)) : String(v ?? ""),
    };
  } catch (err) {
    return {
      name,
      status: "FAIL",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

function truncate(s: string, n = 120): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.ip) {
    console.error("usage: smoke <ip> [--port 8080] [--token TOK] [--write]");
    process.exit(2);
  }
  const baseUrl = `http://${args.ip}:${args.port}`;
  console.log(`# OpenLabOS device smoke against ${baseUrl}`);
  console.log(`# write mode: ${args.write ? "ON" : "off"}`);

  const client = new DeviceClient({ baseUrl, token: args.token, timeoutMs: args.timeoutMs });
  const adapter = new AndroidDeviceAdapter({
    baseUrl,
    token: args.token,
    timeoutMs: args.timeoutMs,
  });

  const results: Result[] = [];

  // Health + auth
  results.push(await run("health", () => client.health()));
  results.push(await run("auth.token", () => client.authToken()));
  results.push(await run("status", () => client.status()));
  results.push(await run("system.info", () => client.systemInfo()));

  // Battery + wifi (read-only)
  results.push(await run("battery.summary", () => client.batterySummary()));
  results.push(await run("battery.history", () => client.batteryHistory()));
  results.push(await run("wifi.status", () => client.wifiStatus()));

  // MCU read
  results.push(await run("mcu.status", () => client.mcuStatus()));

  // Settings read
  results.push(await run("settings.get", () => client.getSettings()));

  // Dev tools (read-only)
  results.push(
    await run("dev.shell echo", () =>
      client.devShell({ command: "echo openlabos" }),
    ),
  );
  results.push(await run("dev.props", () => client.devProps()));
  results.push(await run("dev.packages", () => client.devListPackages()));
  results.push(
    await run("dev.files /sdcard", () => client.devListFiles("/sdcard")),
  );
  results.push(await run("dev.crashes", () => client.devCrashes()));

  // Preview health (cheap)
  results.push(await run("preview.health", () => client.previewHealth()));

  // Live coach (read)
  results.push(
    await run("live-coach.audio.status", () => client.liveCoachAudioStatus()),
  );

  // Adapter contract
  results.push(
    await run("adapter.capabilities", async () => adapter.capabilities()),
  );
  results.push(await run("adapter.health", () => adapter.health()));

  // Camera write tests, gated
  if (args.write) {
    results.push(await run("camera.start", () => client.cameraStart()));
    results.push(await run("camera.photo", () => client.takePhoto()));
    results.push(await run("camera.stop", () => client.cameraStop()));
    results.push(await run("wifi.scan", () => client.wifiScan()));
  } else {
    results.push({ name: "camera.start", status: "SKIP", detail: "rerun with --write" });
    results.push({ name: "camera.photo", status: "SKIP", detail: "rerun with --write" });
    results.push({ name: "camera.stop", status: "SKIP", detail: "rerun with --write" });
    results.push({ name: "wifi.scan", status: "SKIP", detail: "rerun with --write" });
  }

  console.log();
  for (const r of results) {
    const tag = r.status === "PASS" ? "✓" : r.status === "FAIL" ? "✗" : "·";
    console.log(`${tag} ${r.status.padEnd(4)} ${r.name.padEnd(28)} ${r.detail ?? ""}`);
  }
  const failed = results.filter((r) => r.status === "FAIL").length;
  const passed = results.filter((r) => r.status === "PASS").length;
  const skipped = results.filter((r) => r.status === "SKIP").length;
  console.log();
  console.log(`# ${passed} pass  ${failed} fail  ${skipped} skip`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
