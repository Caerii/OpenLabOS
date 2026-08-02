#!/usr/bin/env node
/**
 * Migrate legacy kitchen manifests/events into ADR 0014 session layout.
 */
import fs from "node:fs";
import path from "node:path";

const dataDir = process.env.OPENLABOS_DATA_DIR
  ? path.resolve(process.env.OPENLABOS_DATA_DIR)
  : path.resolve("services/api/data");

const kitchenDir = path.join(dataDir, "kitchen");
const sessionsDir = path.join(dataDir, "sessions");

function migrateManifest(filePath) {
  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const sessionId = raw.session_id || raw.runId || path.basename(filePath, ".json");
  const target = path.join(sessionsDir, sessionId);
  fs.mkdirSync(target, { recursive: true });
  fs.writeFileSync(path.join(target, "manifest.json"), `${JSON.stringify(raw, null, 2)}\n`);
  console.log(`migrated ${filePath} -> ${target}`);
}

const manifestsDir = path.join(kitchenDir, "manifests");
if (!fs.existsSync(manifestsDir)) {
  console.log("No kitchen manifests to migrate.");
  process.exit(0);
}

for (const file of fs.readdirSync(manifestsDir)) {
  if (!file.endsWith(".json") || file.startsWith("test-")) continue;
  migrateManifest(path.join(manifestsDir, file));
}
