import assert from "node:assert/strict";
import express from "express";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import agentsRoutes from "../routes/agents.js";
import {
  buildCoscientistPlan,
  LABOS_AGENT_ROLES,
  LABOS_TOOL_OCEAN,
  resetCoscientistRunStoreForTests,
  summarizeGaps,
} from "../ai/agents/index.js";

async function startServer() {
  const app = express();
  app.use(express.json());
  app.use("/api/agents", agentsRoutes);
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const started = app.listen(0, "127.0.0.1", () => resolve(started));
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No server address");
  return {
    baseUrl: `http://127.0.0.1:${(address as AddressInfo).port}/api/agents`,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    }),
  };
}

async function getJson<T>(baseUrl: string, path: string) {
  const res = await fetch(`${baseUrl}${path}`);
  const text = await res.text();
  assert.equal(res.ok, true, `${path} failed: ${res.status} ${text}`);
  return JSON.parse(text) as T;
}

async function postJson<T>(baseUrl: string, path: string, body: unknown) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  assert.equal(res.ok, true, `${path} failed: ${res.status} ${text}`);
  return JSON.parse(text) as T;
}

async function main() {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "labos-agent-runs-"));
  process.env.LABOS_AGENT_RUNS_DIR = tmp;
  await resetCoscientistRunStoreForTests();

  assert.ok(LABOS_AGENT_ROLES.some((role) => role.id === "manager"));
  assert.ok(LABOS_AGENT_ROLES.some((role) => role.id === "perception"));
  assert.ok(LABOS_AGENT_ROLES.some((role) => role.id === "critic"));
  assert.ok(LABOS_TOOL_OCEAN.some((tool) => tool.id === "physical.multiscale-validation"));
  assert.ok(summarizeGaps().p0.some((gap) => gap.id === "realtime-vlm-loop"));

  const plan = buildCoscientistPlan({
    objective: "Run the kitchen tea protocol through glasses with validation",
    protocolId: "kitchen-tea-v1",
  });
  assert.equal(plan.mode, "physical_protocol");
  assert.ok(plan.stages.some((stage) => stage.ownerAgent === "perception"));
  assert.ok(plan.stages.some((stage) => stage.requiredTools.includes("physical.multiscale-validation")));
  assert.ok(plan.missingCapabilities.includes("realtime-vlm-loop"));

  const server = await startServer();
  try {
    const architecture = await getJson<{ roles: unknown[]; tools: unknown[] }>(server.baseUrl, "/architecture");
    assert.equal(architecture.roles.length >= 7, true);
    assert.equal(architecture.tools.length >= 6, true);

    const routePlan = await postJson<{ mode: string; stages: unknown[] }>(server.baseUrl, "/plan", {
      objective: "Export glasses data and evaluate Qwen VLM",
      mode: "training_eval",
    });
    assert.equal(routePlan.mode, "training_eval");
    assert.equal(routePlan.stages.length >= 3, true);

    const created = await postJson<{
      success: boolean;
      run: { id: string; status: string; currentStageId: string; stages: Array<{ id: string; status: string }> };
    }>(server.baseUrl, "/runs", {
      objective: "Run tea protocol with glasses and critic-gated validation",
      protocolId: "kitchen-tea-v1",
    });
    assert.equal(created.success, true);
    assert.equal(created.run.status, "active");
    assert.equal(created.run.stages[0].status, "in_progress");

    const completed = await postJson<{
      run: { status: string; currentStageId: string; stages: Array<{ id: string; status: string; evidenceRefs: string[] }> };
    }>(server.baseUrl, `/runs/${created.run.id}/events`, {
      type: "stage_completed",
      stageId: created.run.currentStageId,
      agentId: "critic",
      message: "Protocol scope accepted",
      evidenceRefs: ["protocol:kitchen-tea-v1"],
    });
    assert.equal(completed.run.status, "active");
    assert.equal(completed.run.stages[0].status, "completed");
    assert.equal(completed.run.stages[0].evidenceRefs.includes("protocol:kitchen-tea-v1"), true);
    assert.equal(completed.run.stages[1].status, "in_progress");

    const listed = await getJson<{ runs: Array<{ id: string }> }>(server.baseUrl, "/runs");
    assert.equal(listed.runs.some((run) => run.id === created.run.id), true);
  } finally {
    await server.close();
    await resetCoscientistRunStoreForTests();
    delete process.env.LABOS_AGENT_RUNS_DIR;
  }

  console.log("[labos-agents] all checks passed");
}

void main();
