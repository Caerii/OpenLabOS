import { spawnSync } from "node:child_process";

const port = process.env.OPENLABOS_PORT || "3847";
const publicBaseUrl = `http://127.0.0.1:${port}`;

function fail(message, detail = "") {
  console.error(`\n[compose:smoke] ${message}`);
  if (detail) console.error(detail.trim());
  process.exit(1);
}

async function fetchJson(url, expected, init = {}) {
  let response;
  try {
    response = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(5_000),
    });
  } catch (error) {
    fail(`Cannot reach ${url}. Run "pnpm compose:up" first.`, String(error));
  }
  const text = await response.text();
  if (!response.ok) fail(`${url} returned HTTP ${response.status}.`, text);

  let body;
  try {
    body = JSON.parse(text);
  } catch {
    fail(`${url} did not return JSON.`, text);
  }
  if (!expected(body)) fail(`${url} returned an unexpected response.`, text);
  return body;
}

function composeExec(service, code) {
  const result = spawnSync(
    "docker",
    ["compose", "exec", "-T", service, "python", "-c", code],
    { encoding: "utf8" },
  );
  if (result.status !== 0) {
    fail(
      `${service} failed its internal health probe.`,
      `${result.stdout}\n${result.stderr}`,
    );
  }
  return JSON.parse(result.stdout);
}

const api = await fetchJson(
  `${publicBaseUrl}/api/healthz`,
  (body) => body?.ok === true && body?.service === "@openlabos/api",
);
await fetchJson(`${publicBaseUrl}/api/readyz`, (body) => body?.ready === true);

const operatorResponse = await fetch(`${publicBaseUrl}/operate`, {
  signal: AbortSignal.timeout(5_000),
});
const operatorHtml = await operatorResponse.text();
if (
  !operatorResponse.ok
  || !operatorResponse.headers.get("content-type")?.includes("text/html")
  || !operatorHtml.includes('id="root"')
) {
  fail("The compiled operator web app was not served correctly.");
}

await fetchJson(
  `${publicBaseUrl}/api/kitchen/analyze/entity-segmentation/status?probe=1`,
  (body) =>
    body?.mode === "sidecar"
    && body?.configured === true
    && body?.health?.ok === true,
);

const judgment = await fetchJson(
  `${publicBaseUrl}/api/judgments`,
  (body) =>
    body?.source === "mock:deterministic"
    && body?.verdict === "indeterminate",
  {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      session_id: "00000000-0000-4000-8000-000000000001",
      provider: "mock",
      step: {
        step_id: "compose-smoke",
        title: "Verify Compose inference bridge",
        instruction: "Return a deterministic contract response.",
        expected_objects: [],
        success_criteria: [
          { kind: "integration", description: "API reaches inference" },
        ],
      },
    }),
  },
);

const inference = composeExec(
  "inference",
  "import json,urllib.request; print(json.dumps(json.load(urllib.request.urlopen('http://127.0.0.1:8001/v1/healthz', timeout=3))))",
);
if (inference?.ok !== true) fail("Inference reported unhealthy.");

const perception = composeExec(
  "perception",
  "import json,urllib.request; print(json.dumps(json.load(urllib.request.urlopen('http://127.0.0.1:8002/health', timeout=3))))",
);
if (perception?.ok !== true) fail("Perception reported unhealthy.");

console.log("[compose:smoke] All services are healthy.");
console.log(`  operator:   ${publicBaseUrl}/operate`);
console.log(`  api:        ${api.service}`);
console.log(`  inference:  ${inference.default_provider} (${judgment.source} bridge verified)`);
console.log(`  perception: ${perception.backend}`);
