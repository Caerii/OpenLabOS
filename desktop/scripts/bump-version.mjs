import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(desktopRoot, "..");
const version = process.argv[2];
const semverPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

if (!version || !semverPattern.test(version)) {
  console.error("Usage: pnpm -C desktop bump-version <semver>");
  console.error("Example: pnpm -C desktop bump-version 0.2.0");
  process.exit(1);
}

async function updateJson(filePath) {
  const parsed = JSON.parse(await readFile(filePath, "utf8"));
  parsed.version = version;
  await writeFile(filePath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
}

async function updateCargoToml(filePath) {
  const source = await readFile(filePath, "utf8");
  const packageVersionPattern = /(^\[package\][\s\S]*?^version\s*=\s*")[^"]+(")/m;
  if (!packageVersionPattern.test(source)) {
    throw new Error(`Could not find package version in ${filePath}`);
  }
  const updated = source.replace(
    packageVersionPattern,
    `$1${version}$2`,
  );
  await writeFile(filePath, updated, "utf8");
}

await updateJson(path.join(desktopRoot, "package.json"));
await updateJson(path.join(desktopRoot, "src-tauri", "tauri.conf.json"));
await updateCargoToml(path.join(desktopRoot, "src-tauri", "Cargo.toml"));

console.log(`Desktop version set to ${version}`);
console.log(`Review and commit updated files before tagging desktop-v${version}.`);
