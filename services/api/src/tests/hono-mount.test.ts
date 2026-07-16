import assert from "node:assert/strict";
import { shouldDelegateToHono } from "../hono/mount-on-express.js";

function main() {
  assert.equal(shouldDelegateToHono("/api/healthz"), true);
  assert.equal(shouldDelegateToHono("/api/readyz"), true);

  assert.equal(shouldDelegateToHono("/api/sessions"), true);
  assert.equal(shouldDelegateToHono("/api/sessions/abc/events"), true);
  assert.equal(shouldDelegateToHono("/api/adapters"), true);
  assert.equal(shouldDelegateToHono("/api/judgments"), true);

  assert.equal(shouldDelegateToHono("/api/device/api/preview/frame"), true);
  assert.equal(shouldDelegateToHono("/api/device/status"), false);
  assert.equal(shouldDelegateToHono("/api/device/connect"), false);

  assert.equal(shouldDelegateToHono("/api/health"), false);
  assert.equal(shouldDelegateToHono("/api/kitchen/run/status"), false);

  console.log("[hono-mount] all checks passed");
}

main();
