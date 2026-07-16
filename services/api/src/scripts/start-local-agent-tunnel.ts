import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { dashboardApiPort } from "../runtime-config.js";

const port = dashboardApiPort();
const operatorUrl = process.env.OPENLABOS_OPERATOR_URL || `http://localhost:${process.env.OPENLABOS_CLIENT_PORT || "5174"}/operate`;
const localBackend = `http://localhost:${port}`;
const repoRoot = findRepoRoot(process.cwd());
const workspaceCloudflared = path.join(repoRoot, ".tmp", "tools", "cloudflared.exe");

function findRepoRoot(start: string) {
  let current = path.resolve(start);
  while (true) {
    if (existsSync(path.join(current, "pnpm-workspace.yaml"))) return current;
    const parent = path.dirname(current);
    if (parent === current) return path.resolve(start, "..", "..");
    current = parent;
  }
}

function operatorWithBackend(tunnelUrl: string) {
  const url = new URL(operatorUrl);
  url.searchParams.set("localBackend", tunnelUrl);
  return url.toString();
}

function printReady(tunnelUrl: string) {
  console.log("\n[OpenLabOS] HTTPS local-agent tunnel is ready.");
  console.log(`[OpenLabOS] Local backend: ${localBackend}`);
  console.log(`[OpenLabOS] Tunnel backend: ${tunnelUrl}`);
  console.log(`[OpenLabOS] Open operator: ${operatorWithBackend(tunnelUrl)}`);
}

function startProcess(command: string, args: string[], parseTunnel: (text: string) => string | null) {
  const child = spawn(command, args, {
    stdio: ["ignore", "pipe", "pipe"],
    shell: true,
    windowsHide: true,
  });

  let printed = false;
  const maybePrintTunnel = (chunk: Buffer, write: (text: string) => void) => {
    const text = chunk.toString();
    write(text);
    const tunnelUrl = parseTunnel(text);
    if (!printed && tunnelUrl) {
      printed = true;
      printReady(tunnelUrl);
    }
  };

  child.stdout?.on("data", (chunk: Buffer) => maybePrintTunnel(chunk, process.stdout.write.bind(process.stdout)));
  child.stderr?.on("data", (chunk: Buffer) => {
    maybePrintTunnel(chunk, process.stderr.write.bind(process.stderr));
    const text = chunk.toString();
    if (/authtoken|authentication|login/i.test(text)) {
      console.error("\n[OpenLabOS] ngrok needs setup first. Run: ngrok config add-authtoken <token>");
    }
  });

  child.on("error", (error) => {
    console.error(`[OpenLabOS] Failed to start tunnel: ${error.message}`);
    console.error("[OpenLabOS] Use the local operator while tunnel setup is unavailable: http://localhost:5174/operate");
    process.exitCode = 1;
  });

  child.on("exit", (code) => {
    if (code && code !== 0) process.exitCode = code;
  });
}

function startCloudflared(command: string) {
  startProcess(
    command,
    ["tunnel", "--url", localBackend],
    (text) => text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/)?.[0] || null,
  );
}

function startNgrok() {
  startProcess(
    "ngrok",
    ["http", localBackend],
    (text) => {
      const match = text.match(/url=(https:\/\/[^\s]+)/) || text.match(/(https:\/\/[a-zA-Z0-9.-]+\.ngrok[^\s]*)/);
      return match?.[1]?.replace(/["']/g, "") || null;
    },
  );
}

console.log("[OpenLabOS] Starting HTTPS tunnel for the local agent.");
console.log(`[OpenLabOS] Make sure the local agent is running at ${localBackend}`);
if (existsSync(workspaceCloudflared)) {
  startCloudflared(workspaceCloudflared);
} else if (process.env.OPENLABOS_TUNNEL_PROVIDER === "ngrok") {
  startNgrok();
} else {
  startCloudflared("cloudflared");
}
