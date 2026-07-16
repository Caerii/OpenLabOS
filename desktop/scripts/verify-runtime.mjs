import { spawn } from "node:child_process";
import { stat } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(__dirname, "..");
const resourcesRoot = path.join(desktopRoot, "src-tauri", "resources");
const nodeName = process.platform === "win32" ? "node.exe" : "node";
const nodePath = path.join(resourcesRoot, "node", nodeName);
const apiPath = path.join(resourcesRoot, "openlabos-api", "index.mjs");
const clientIndex = path.join(resourcesRoot, "client", "index.html");
const port = Number(process.env.OPENLABOS_DESKTOP_VERIFY_PORT || process.env.LABOS_DESKTOP_VERIFY_PORT || 3897);

async function mustExist(filePath, label) {
  try {
    await stat(filePath);
  } catch {
    throw new Error(`${label} missing: ${filePath}`);
  }
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

await mustExist(nodePath, "bundled Node runtime");
await mustExist(apiPath, "bundled OpenLabOS API");
await mustExist(clientIndex, "bundled OpenLabOS client");

const child = spawn(nodePath, [apiPath], {
  cwd: path.dirname(apiPath),
  env: {
    ...process.env,
    OPENLABOS_API_HOST: "127.0.0.1",
    OPENLABOS_API_PORT: String(port),
    LABOS_DASHBOARD_API_HOST: "127.0.0.1",
    LABOS_DASHBOARD_API_PORT: String(port),
  },
  stdio: "ignore",
  windowsHide: true,
});

try {
  let health = null;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await sleep(250);
    try {
      health = await fetchHealth();
      break;
    } catch {}
  }
  if (!health?.ok) {
    throw new Error("bundled runtime did not answer /api/health");
  }
  console.log(JSON.stringify({
    ok: true,
    health,
    node: nodePath,
    api: apiPath,
    client: clientIndex,
  }, null, 2));
} finally {
  child.kill();
}
