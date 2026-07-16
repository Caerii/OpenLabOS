import * as esbuild from "esbuild";
import { cp, mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(desktopRoot, "..");
const webRoot = path.join(repoRoot, "apps", "web");
const apiRoot = path.join(repoRoot, "services", "api");
const resourcesRoot = path.join(desktopRoot, "src-tauri", "resources");
const apiOutDir = path.join(resourcesRoot, "openlabos-api");
const clientOutDir = path.join(resourcesRoot, "client");
const nodeOutDir = path.join(resourcesRoot, "node");
const apiOutFile = path.join(apiOutDir, "index.mjs");

async function mustExist(filePath, label) {
  try {
    await stat(filePath);
  } catch {
    throw new Error(`${label} does not exist: ${filePath}`);
  }
}

async function copyNodeRuntime() {
  const nodeName = process.platform === "win32" ? "node.exe" : "node";
  const nodeOut = path.join(nodeOutDir, nodeName);
  await mkdir(nodeOutDir, { recursive: true });
  await cp(process.execPath, nodeOut);
  return nodeOut;
}

await rm(apiOutDir, { recursive: true, force: true });
await rm(clientOutDir, { recursive: true, force: true });
await mkdir(apiOutDir, { recursive: true });
await mkdir(clientOutDir, { recursive: true });

await mustExist(path.join(webRoot, "dist", "index.html"), "OpenLabOS web build");

await esbuild.build({
  entryPoints: [path.join(apiRoot, "src", "index.ts")],
  outfile: apiOutFile,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  sourcemap: false,
  legalComments: "none",
  logLevel: "info",
  banner: {
    js: [
      "import { createRequire as __labosCreateRequire } from 'module';",
      "const require = __labosCreateRequire(import.meta.url);",
    ].join("\n"),
  },
});

await cp(path.join(webRoot, "dist"), clientOutDir, { recursive: true });
const nodeOut = await copyNodeRuntime();

console.log(JSON.stringify({
  api: apiOutFile,
  client: clientOutDir,
  node: nodeOut,
}, null, 2));
