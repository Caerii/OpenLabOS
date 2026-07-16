import assert from "node:assert/strict";

import { getProtocol } from "../ai/kitchen/protocols.js";
import { buildLiveCoachHandsFreeStartText } from "../routes/kitchen/live-coach-context.js";

const protocol = getProtocol("kitchen-tea-v1");
assert.ok(protocol);

const text = buildLiveCoachHandsFreeStartText(
  { protocolId: "kitchen-tea-v1", protocolName: "Make a cup of tea" },
  protocol,
  null,
);

assert.match(text, /hands-free step guide started/i);
assert.match(text, /Protocol: Make a cup of tea/);
assert.match(text, /Current step 1:/);
assert.match(text, /what do I do next/i);
assert.doesNotMatch(text, /undefined|null/i);

console.log("[live-coach-start-context] all checks passed");
