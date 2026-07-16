import assert from "node:assert/strict";

import { getProtocol, listProtocols } from "../ai/kitchen/protocols.js";
import { validateProtocolShape } from "../ai/kitchen/protocol-domain.js";

const expectedRichRecipes = [
  "kitchen-ramen-v1",
  "kitchen-pasta-v1",
  "kitchen-stir-fry-v1",
  "kitchen-pancakes-v1",
  "kitchen-salad-v1",
  "kitchen-cookies-v1",
];

const protocols = listProtocols();
const ids = new Set(protocols.map((protocol) => protocol.id));

for (const id of expectedRichRecipes) {
  assert.equal(ids.has(id), true, `${id} should be registered in the built-in protocol catalog`);
}

assert.ok(protocols.length >= 11, "catalog should be broader than the original demo protocol set");

const allTags = new Set(protocols.flatMap((protocol) => protocol.tags));
for (const tag of ["baking", "cold-prep", "stovetop", "breakfast", "high-heat", "hot-liquid"]) {
  assert.equal(allTags.has(tag), true, `catalog should include the ${tag} recipe mode`);
}

for (const id of expectedRichRecipes) {
  const protocol = getProtocol(id);
  assert.ok(protocol, `${id} should resolve through getProtocol`);

  const validation = validateProtocolShape(protocol);
  assert.equal(validation.ok, true, `${id} should satisfy the protocol shape contract`);

  assert.ok(protocol.steps.length >= 6, `${id} should be detailed enough for guided execution`);
  assert.ok(protocol.requiredInventory.length >= 6, `${id} should declare a useful setup inventory`);
  assert.ok(protocol.workspaceVerificationPrompt.includes("MISSING: <item>"), `${id} should support setup gap labeling`);

  const stepsWithStructuredVerification = protocol.steps.filter((step) => step.verificationPrompt.includes('"success"'));
  assert.equal(
    stepsWithStructuredVerification.length,
    protocol.steps.length,
    `${id} should use structured JSON verification on every step`,
  );

  const stepsWithSafety = protocol.steps.filter((step) => (step.hazardChecks?.length ?? 0) > 0);
  assert.ok(stepsWithSafety.length >= 2, `${id} should include safety checks where the task can fail physically`);
}

const stirFry = getProtocol("kitchen-stir-fry-v1");
assert.ok(stirFry);
assert.equal(stirFry.difficulty, "advanced");
assert.ok(stirFry.steps.some((step) => step.instruction.toLowerCase().includes("mise en place")));

const salad = getProtocol("kitchen-salad-v1");
assert.ok(salad);
assert.equal(salad.requiredInventory.some((item) => item.category === "appliance"), false);

console.log("[kitchen-protocol-catalog] all checks passed");
