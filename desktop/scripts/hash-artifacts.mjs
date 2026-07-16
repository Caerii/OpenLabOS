import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(__dirname, "..");
const bundleRoot = path.join(desktopRoot, "src-tauri", "target", "release", "bundle");
const outputPath = path.join(bundleRoot, "SHA256SUMS.txt");
const tauriConfigPath = path.join(desktopRoot, "src-tauri", "tauri.conf.json");
const artifactExtensions = new Set([
  ".msi",
  ".exe",
  ".dmg",
  ".AppImage",
  ".deb",
  ".rpm",
]);

async function pathExists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function collectArtifacts(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const artifacts = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      artifacts.push(...await collectArtifacts(fullPath));
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    if (artifactExtensions.has(path.extname(entry.name)) || entry.name.endsWith(".AppImage")) {
      artifacts.push(fullPath);
    }
  }

  return artifacts;
}

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

if (!await pathExists(bundleRoot)) {
  throw new Error(`Bundle directory missing: ${bundleRoot}`);
}

const tauriConfig = JSON.parse(await readFile(tauriConfigPath, "utf8"));
const productName = tauriConfig.productName;
if (!productName) {
  throw new Error(`Missing productName in ${tauriConfigPath}`);
}

const artifacts = (await collectArtifacts(bundleRoot))
  .filter((artifact) => path.basename(artifact).startsWith(productName))
  .sort((a, b) => a.localeCompare(b));
if (artifacts.length === 0) {
  throw new Error(`No ${productName} desktop artifact files found under ${bundleRoot}`);
}

const lines = [];
for (const artifact of artifacts) {
  const digest = await sha256File(artifact);
  const rel = path.relative(bundleRoot, artifact).split(path.sep).join("/");
  lines.push(`${digest}  ${rel}`);
}

await mkdir(bundleRoot, { recursive: true });
await writeFile(outputPath, `${lines.join("\n")}\n`, "utf8");

console.log(`Wrote ${lines.length} hashes to ${outputPath}`);
