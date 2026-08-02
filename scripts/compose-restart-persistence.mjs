import { spawnSync } from "node:child_process";

const port = process.env.OPENLABOS_PORT || "3847";
const base = `http://127.0.0.1:${port}`;

function fail(msg, detail = "") {
  console.error(`\n[compose:restart-persistence] ${msg}`);
  if (detail) console.error(detail);
  process.exit(1);
}

const created = await fetch(`${base}/api/sessions`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    protocol_id: "kitchen-tea",
    protocol_version: "1.0.0",
    device_adapter_id: "restart-test",
    tags: ["restart-persistence"],
  }),
  signal: AbortSignal.timeout(5_000),
});
if (!created.ok) fail("Could not create session", await created.text());
const session = await created.json();
const sid = session.session_id;

await fetch(`${base}/api/sessions/${sid}/events`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    kind: "operator_note",
    at: new Date().toISOString(),
    text: "persist-me",
  }),
});

const restart = spawnSync("docker", ["compose", "restart", "api"], { encoding: "utf8" });
if (restart.status !== 0) fail("docker compose restart api failed", restart.stderr);

await new Promise((r) => setTimeout(r, 5_000));

const viewRes = await fetch(`${base}/api/sessions/${sid}`, { signal: AbortSignal.timeout(10_000) });
if (!viewRes.ok) fail("Session missing after restart", await viewRes.text());
const view = await viewRes.json();
if (view.counts.operatorNotes !== 1) {
  fail("Session events did not survive restart", JSON.stringify(view));
}

console.log("[compose:restart-persistence] Session survived API restart.");
console.log(`  session_id: ${sid}`);
