import assert from "node:assert/strict";
import path from "node:path";
import { HttpError } from "../lib/http.js";
import { getKitchenDataPaths } from "../ai/kitchen/run-store.js";
import { resolveKitchenArtifactPath } from "../routes/kitchen/session-routes.js";

function assertBadRef(ref: string) {
  assert.throws(
    () => resolveKitchenArtifactPath(ref),
    (error) => error instanceof HttpError && error.status === 400,
  );
}

function main() {
  const dataRoot = path.resolve(getKitchenDataPaths().dataDir);
  const framePath = resolveKitchenArtifactPath("kitchen/frames/step-1.jpg");
  assert.equal(framePath.startsWith(`${dataRoot}${path.sep}`), true);

  assertBadRef("../frames/step-1.jpg");
  assertBadRef("kitchen/manifests/run.json");
  assertBadRef("kitchen/native-videos/../../outside.mp4");
  assertBadRef("/kitchen/frames/step-1.jpg");

  console.log("[kitchen-session-artifacts] all checks passed");
}

main();
