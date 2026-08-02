import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const port = process.env.OPENLABOS_PORT || "3847";
const publicBaseUrl = `http://127.0.0.1:${port}`;
const __dirname = dirname(fileURLToPath(import.meta.url));
const protocolPath = join(__dirname, "..", "examples", "protocols", "kitchen-tea.protocol.json");

function fail(message, detail = "") {
  console.error(`\n[compose:protocol-run] ${message}`);
  if (detail) console.error(detail.trim());
  process.exit(1);
}

async function fetchJson(url, init = {}, expected) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });
  const text = await response.text();
  if (!response.ok) fail(`${url} returned HTTP ${response.status}.`, text);
  const body = JSON.parse(text);
  if (expected && !expected(body)) fail(`${url} unexpected response`, text);
  return body;
}

const protocol = JSON.parse(readFileSync(protocolPath, "utf8"));

const session = await fetchJson(
  `${publicBaseUrl}/api/sessions`,
  {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      protocol_id: protocol.protocol_id,
      protocol_version: protocol.protocol_version,
      device_adapter_id: "compose-mock",
      tags: ["compose-e2e"],
    }),
  },
  (b) => typeof b.session_id === "string",
);

const sid = session.session_id;
const iso = () => new Date().toISOString();

for (const step of protocol.steps) {
  await fetchJson(`${publicBaseUrl}/api/sessions/${sid}/events`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind: "step_started", at: iso(), step_id: step.step_id }),
  });
  await fetchJson(`${publicBaseUrl}/api/judgments`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      session_id: sid,
      provider: "mock",
      step: {
        step_id: step.step_id,
        title: step.title,
        instruction: step.instruction,
        expected_objects: step.expected_objects ?? [],
        success_criteria: step.success_criteria ?? [],
      },
    }),
  });
  await fetchJson(`${publicBaseUrl}/api/sessions/${sid}/events`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      kind: "step_completed",
      at: iso(),
      step_id: step.step_id,
      succeeded: true,
    }),
  });
}

const finalized = await fetchJson(
  `${publicBaseUrl}/api/sessions/${sid}/finalize`,
  {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status: "completed" }),
  },
  (b) => b.status === "completed",
);

const manifestCheck = await fetch(
  `${publicBaseUrl}/api/runs/${sid}/timeline`,
  { signal: AbortSignal.timeout(5_000) },
);
if (!manifestCheck.ok) fail("Could not read run timeline after finalize.");

console.log("[compose:protocol-run] Protocol run completed.");
console.log(`  session_id: ${sid}`);
console.log(`  status:     ${finalized.status}`);
console.log(`  steps:      ${protocol.steps.length}`);
