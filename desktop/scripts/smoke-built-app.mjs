import { spawn, spawnSync } from "node:child_process";
import { stat } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(__dirname, "..");
const targetRoot = path.join(desktopRoot, "src-tauri", "target", "release");
const port = Number(process.env.OPENLABOS_DESKTOP_SMOKE_PORT || process.env.LABOS_DESKTOP_SMOKE_PORT || 3847);

const candidates = process.platform === "win32"
  ? [path.join(targetRoot, "openlabos-desktop.exe")]
  : process.platform === "darwin"
    ? [
        path.join(targetRoot, "bundle", "macos", "OpenLabOS.app", "Contents", "MacOS", "OpenLabOS"),
        path.join(targetRoot, "openlabos-desktop"),
      ]
    : [path.join(targetRoot, "openlabos-desktop")];

async function firstExisting(paths) {
  for (const filePath of paths) {
    try {
      await stat(filePath);
      return filePath;
    } catch {}
  }
  return null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fetchHealth() {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://127.0.0.1:${port}/api/health`, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}: ${body}`));
          return;
        }
        resolve(JSON.parse(body));
      });
    });
    req.setTimeout(2_000, () => {
      req.destroy(new Error("health request timed out"));
    });
    req.on("error", reject);
  });
}

const appPath = await firstExisting(candidates);
if (!appPath) {
  throw new Error(`Built desktop executable not found. Checked:\n${candidates.join("\n")}`);
}

const child = spawn(appPath, [], {
  cwd: path.dirname(appPath),
  env: process.env,
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});
let stdout = "";
let stderr = "";
child.stdout?.on("data", (chunk) => {
  stdout += chunk.toString();
});
child.stderr?.on("data", (chunk) => {
  stderr += chunk.toString();
});

try {
  let health = null;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    await sleep(250);
    try {
      health = await fetchHealth();
      break;
    } catch {}
    if (child.exitCode !== null) {
      throw new Error(`Desktop app exited early with code ${child.exitCode}`);
    }
  }
  if (!health?.ok) {
    throw new Error([
      `Desktop app did not expose /api/health on port ${port}`,
      stdout.trim() ? `stdout:\n${stdout.trim()}` : null,
      stderr.trim() ? `stderr:\n${stderr.trim()}` : null,
    ].filter(Boolean).join("\n\n"));
  }
  console.log(JSON.stringify({
    ok: true,
    app: appPath,
    health,
  }, null, 2));
} finally {
  if (process.platform === "win32" && child.pid) {
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    child.kill();
  }
}
