import assert from "node:assert/strict";
import path from "node:path";
import {
  isSafeKitchenFrameRef,
  kitchenArtifactUrl,
  normalizeKitchenArtifactRef,
  resolveKitchenArtifactRef,
} from "../ai/kitchen/artifact-refs.js";
import { getKitchenDataPaths } from "../ai/kitchen/run-store.js";

function main() {
  const normalized = normalizeKitchenArtifactRef("kitchen\\frames\\a.jpg");
  assert.equal(normalized.ref, "kitchen/frames/a.jpg");
  assert.equal(normalized.kind, "frame");
  assert.equal(isSafeKitchenFrameRef("kitchen/frames/a.jpg"), true);
  assert.equal(isSafeKitchenFrameRef("kitchen/chunks/a.mp4"), false);

  const resolved = resolveKitchenArtifactRef("kitchen/native-videos/run-1/a.mp4", {
    allowedKinds: ["native_video"],
  });
  assert.equal(resolved.kind, "native_video");
  assert.equal(resolved.localPath.startsWith(path.resolve(getKitchenDataPaths().dataDir)), true);

  assert.equal(
    kitchenArtifactUrl("kitchen/frames/a.jpg", { download: true }),
    "/api/kitchen/session/artifact?ref=kitchen%2Fframes%2Fa.jpg&download=1",
  );
  assert.throws(() => normalizeKitchenArtifactRef("../outside.jpg"), /Kitchen artifact ref/);
  assert.throws(() => normalizeKitchenArtifactRef("kitchen/manifests/run.json"), /Kitchen artifact ref/);
  assert.throws(() => resolveKitchenArtifactRef("kitchen/frames/../../outside.jpg"), /Kitchen artifact ref/);

  console.log("[kitchen-artifact-refs] all checks passed");
}

main();
