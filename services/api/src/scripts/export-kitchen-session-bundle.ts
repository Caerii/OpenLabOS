import fs from "node:fs/promises";
import path from "node:path";
import { replayFixtureFromSessionManifest, type KitchenSessionManifest } from "../ai/kitchen/index.js";

function arg(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function dataRoot() {
  return path.resolve(process.cwd(), "data");
}

function safeDataPath(ref: string) {
  const root = dataRoot();
  const resolved = path.resolve(root, ref);
  const relative = path.relative(root, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Ref escapes dashboard data root: ${ref}`);
  }
  return resolved;
}

async function copyRef(ref: string, outRoot: string) {
  const src = safeDataPath(ref);
  const dst = path.join(outRoot, "media", ref);
  await fs.mkdir(path.dirname(dst), { recursive: true });
  await fs.copyFile(src, dst);
  return path.relative(outRoot, dst).replace(/\\/g, "/");
}

async function copyIfExists(ref: string | undefined, outRoot: string) {
  if (!ref) return null;
  try {
    return await copyRef(ref, outRoot);
  } catch (error: any) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function main() {
  const manifestPath = arg("--manifest");
  const out = arg("--out");
  if (!manifestPath || !out) {
    throw new Error("Usage: tsx src/server/scripts/export-kitchen-session-bundle.ts --manifest <manifest.json> --out <bundle-dir>");
  }

  const manifestFile = path.resolve(manifestPath);
  const outRoot = path.resolve(out);
  const manifest = JSON.parse(await fs.readFile(manifestFile, "utf-8")) as KitchenSessionManifest;
  const replay = replayFixtureFromSessionManifest(manifest, {
    fixtureId: `${manifest.run.id}-replay`,
    manifestRef: path.relative(process.cwd(), manifestFile).replace(/\\/g, "/"),
  });

  await fs.mkdir(outRoot, { recursive: true });
  await fs.writeFile(path.join(outRoot, "session-manifest.json"), JSON.stringify(manifest, null, 2), "utf-8");
  await fs.writeFile(path.join(outRoot, "replay-fixture.json"), JSON.stringify(replay, null, 2), "utf-8");

  const copiedFrames: string[] = [];
  for (const frame of manifest.frames) {
    const copied = await copyIfExists(frame.frameRef, outRoot);
    if (copied) copiedFrames.push(copied);
  }

  const copiedChunks: string[] = [];
  for (const chunk of manifest.chunks) {
    const copiedChunk = await copyIfExists(chunk.chunkRef, outRoot);
    if (copiedChunk) copiedChunks.push(copiedChunk);
    const copiedIndex = await copyIfExists(chunk.indexRef, outRoot);
    if (copiedIndex) copiedChunks.push(copiedIndex);
  }

  const bundleIndex = {
    schemaVersion: "labos.kitchen.session-bundle.v1",
    generatedAt: new Date().toISOString(),
    runId: manifest.run.id,
    protocolId: manifest.run.protocolId,
    manifest: "session-manifest.json",
    replayFixture: "replay-fixture.json",
    mediaRoot: "media",
    counts: {
      frames: copiedFrames.length,
      chunkArtifacts: copiedChunks.length,
      replayTicks: replay.ticks.length,
    },
    copiedFrames,
    copiedChunks,
  };
  await fs.writeFile(path.join(outRoot, "bundle-index.json"), JSON.stringify(bundleIndex, null, 2), "utf-8");

  console.log(`Wrote ${outRoot}`);
  console.log(`Frames: ${copiedFrames.length}`);
  console.log(`Chunk artifacts: ${copiedChunks.length}`);
  console.log(`Replay ticks: ${replay.ticks.length}`);
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
