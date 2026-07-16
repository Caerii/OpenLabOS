import assert from "node:assert/strict";

import {
  protocolInventoryNames,
  protocolStepByNumber,
  sortProtocolsForDisplay,
  summarizeProtocol,
  validateProtocolShape,
} from "../ai/kitchen/protocol-domain.js";
import type { KitchenProtocol } from "../ai/kitchen/protocol-types.js";

function protocol(id: string, difficulty: KitchenProtocol["difficulty"]): KitchenProtocol {
  return {
    id,
    name: id,
    description: `${id} description`,
    difficulty,
    estimatedMinutes: 3,
    tags: ["demo"],
    requiredInventory: [{ name: "mug", category: "tool" }],
    workspaceVerificationPrompt: "Verify workspace.",
    steps: [
      {
        number: 1,
        instruction: "Place the mug.",
        successCriteria: "Mug is placed.",
        verificationPrompt: "Return JSON.",
        requiredObjects: ["mug"],
      },
    ],
  };
}

const beginner = protocol("beginner", "beginner");
const advanced = protocol("advanced", "advanced");

assert.deepEqual(summarizeProtocol(beginner), {
  id: "beginner",
  name: "beginner",
  description: "beginner description",
  difficulty: "beginner",
  estimatedMinutes: 3,
  stepCount: 1,
  tags: ["demo"],
});

assert.equal(protocolStepByNumber(beginner, 1)?.instruction, "Place the mug.");
assert.equal(protocolStepByNumber(beginner, 9), undefined);
assert.deepEqual(protocolInventoryNames(beginner), ["mug"]);
assert.deepEqual(sortProtocolsForDisplay([advanced, beginner]).map((item) => item.id), ["beginner", "advanced"]);

const valid = validateProtocolShape(beginner);
assert.equal(valid.ok, true);

const invalid = validateProtocolShape({ id: "bad", steps: [] });
assert.equal(invalid.ok, false);
if (!invalid.ok) {
  assert.ok(invalid.issues.some((issue) => issue.path === "steps"));
  assert.ok(invalid.issues.some((issue) => issue.path === "name"));
}

