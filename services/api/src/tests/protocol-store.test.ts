import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { createProtocolStore } from "../ai/kitchen/protocol-store.js";
import type { KitchenProtocol } from "../ai/kitchen/protocol-types.js";

function protocol(id: string, difficulty: KitchenProtocol["difficulty"]): KitchenProtocol {
  return {
    id,
    name: id,
    description: `${id} description`,
    difficulty,
    estimatedMinutes: 1,
    tags: [],
    requiredInventory: [],
    workspaceVerificationPrompt: "Verify workspace.",
    steps: [
      {
        number: 1,
        instruction: "Do the step.",
        successCriteria: "The step is done.",
        verificationPrompt: "Return success.",
        requiredObjects: [],
      },
    ],
  };
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "labos-protocol-store-"));

try {
  const builtin = protocol("builtin", "beginner");
  const store = createProtocolStore([builtin], tmpDir);
  const user = protocol("user", "advanced");

  assert.equal(store.deleteProtocol("builtin"), false, "built-in protocols cannot be deleted");
  const savedPath = store.saveProtocol(user);
  assert.equal(path.basename(savedPath), "user.json");
  assert.equal(fs.existsSync(savedPath), true);

  const loaded = store.loadUserProtocols();
  assert.equal(loaded.length, 1);
  assert.equal(store.getProtocol("builtin")?.id, "builtin");
  assert.equal(store.getProtocol("user")?.id, "user");

  assert.deepEqual(store.listProtocols().map((item) => item.id), ["builtin", "user"]);
  assert.equal(store.deleteProtocol("user"), true);
  assert.equal(store.getProtocol("user"), undefined);
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
