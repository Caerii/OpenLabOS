import fs from "node:fs/promises";
import path from "node:path";
import { buildCoscientistPlan } from "./orchestrator.js";
import type {
  CoscientistPlanRequest,
  CoscientistRun,
  CoscientistRunEvent,
  CoscientistRunEventType,
  CoscientistRunStage,
  LabosAgentRoleId,
} from "./types.js";

function agentRunsRoot() {
  return path.resolve(process.env.LABOS_AGENT_RUNS_DIR || path.join(process.cwd(), "data", "agents"));
}

function runsDir() {
  return path.join(agentRunsRoot(), "runs");
}

function runPath(id: string) {
  if (!/^[a-zA-Z0-9_.-]+$/.test(id)) throw new Error("Invalid run id");
  return path.join(runsDir(), `${id}.json`);
}

function newId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function ensureStore() {
  await fs.mkdir(runsDir(), { recursive: true });
}

async function writeRun(run: CoscientistRun) {
  await ensureStore();
  await fs.writeFile(runPath(run.id), `${JSON.stringify(run, null, 2)}\n`, "utf-8");
}

function startFirstStage(stages: CoscientistRunStage[], now: number) {
  const first = stages[0];
  if (!first) return undefined;
  first.status = "in_progress";
  first.startedAt = now;
  return first.id;
}

function event(input: {
  type: CoscientistRunEventType;
  stageId?: string;
  agentId?: LabosAgentRoleId;
  message?: string;
  evidenceRefs?: string[];
  payload?: Record<string, unknown>;
}): CoscientistRunEvent {
  return {
    id: newId("evt"),
    timestamp: Date.now(),
    ...input,
  };
}

export async function createCoscientistRun(request: CoscientistPlanRequest): Promise<CoscientistRun> {
  if (!request.objective?.trim()) throw new Error("objective is required");
  const now = Date.now();
  const plan = buildCoscientistPlan(request);
  const stages: CoscientistRunStage[] = plan.stages.map((stage) => ({
    ...stage,
    status: "pending",
    evidenceRefs: [],
    notes: [],
  }));
  const currentStageId = startFirstStage(stages, now);
  const events: CoscientistRunEvent[] = [
    event({
      type: "run_created",
      agentId: "manager",
      message: `Created co-scientist run for: ${request.objective}`,
      payload: { mode: plan.mode, protocolId: plan.protocolId },
    }),
  ];
  if (currentStageId) {
    events.push(event({
      type: "stage_started",
      stageId: currentStageId,
      agentId: stages[0].ownerAgent,
      message: `Started stage: ${stages[0].title}`,
    }));
  }

  const run: CoscientistRun = {
    id: newId("run"),
    createdAt: now,
    updatedAt: now,
    status: "active",
    request,
    plan,
    currentStageId,
    stages,
    events,
  };
  await writeRun(run);
  return run;
}

export async function getCoscientistRun(id: string) {
  const raw = await fs.readFile(runPath(id), "utf-8");
  return JSON.parse(raw) as CoscientistRun;
}

export async function listCoscientistRuns(limit = 20) {
  await ensureStore();
  const files = await fs.readdir(runsDir()).catch(() => []);
  const runs: CoscientistRun[] = [];
  for (const file of files.filter((name) => name.endsWith(".json"))) {
    try {
      runs.push(JSON.parse(await fs.readFile(path.join(runsDir(), file), "utf-8")) as CoscientistRun);
    } catch {
      // Ignore malformed run records; individual get still surfaces errors.
    }
  }
  return runs
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, Math.max(1, limit));
}

function findStage(run: CoscientistRun, stageId?: string) {
  return stageId ? run.stages.find((stage) => stage.id === stageId) : undefined;
}

function advanceAfterCompletedStage(run: CoscientistRun, stageId: string, now: number) {
  const current = findStage(run, stageId);
  if (!current) throw new Error(`Stage "${stageId}" not found`);
  current.status = "completed";
  current.completedAt = now;

  const next = run.stages.find((stage) => stage.status === "pending");
  if (next) {
    next.status = "in_progress";
    next.startedAt = now;
    run.currentStageId = next.id;
    return next;
  }
  run.currentStageId = undefined;
  run.status = "completed";
  return undefined;
}

export async function appendCoscientistRunEvent(
  runId: string,
  input: Omit<CoscientistRunEvent, "id" | "timestamp">,
) {
  const run = await getCoscientistRun(runId);
  if (run.status === "completed" || run.status === "aborted") {
    throw new Error(`Run is ${run.status}`);
  }

  const now = Date.now();
  const nextEvent = event(input);
  const stage = findStage(run, input.stageId);
  if (input.evidenceRefs?.length && stage) {
    stage.evidenceRefs = [...new Set([...stage.evidenceRefs, ...input.evidenceRefs])];
  }
  if (input.type === "note" && input.message && stage) {
    stage.notes.push(input.message);
  }
  if (input.type === "evidence_linked" && !input.evidenceRefs?.length) {
    throw new Error("evidence_linked events require evidenceRefs");
  }
  if (input.type === "stage_completed") {
    if (!input.stageId) throw new Error("stage_completed requires stageId");
    const next = advanceAfterCompletedStage(run, input.stageId, now);
    run.events.push(nextEvent);
    if (next) {
      run.events.push(event({
        type: "stage_started",
        stageId: next.id,
        agentId: next.ownerAgent,
        message: `Started stage: ${next.title}`,
      }));
    }
  } else if (input.type === "stage_blocked") {
    if (!stage) throw new Error("stage_blocked requires a valid stageId");
    stage.status = "blocked";
    stage.blockedAt = now;
    run.status = "blocked";
    run.events.push(nextEvent);
  } else if (input.type === "stage_skipped") {
    if (!stage) throw new Error("stage_skipped requires a valid stageId");
    stage.status = "skipped";
    stage.completedAt = now;
    run.events.push(nextEvent);
  } else if (input.type === "run_aborted") {
    run.status = "aborted";
    run.currentStageId = undefined;
    run.events.push(nextEvent);
  } else {
    run.events.push(nextEvent);
  }

  run.updatedAt = now;
  await writeRun(run);
  return run;
}

export async function resetCoscientistRunStoreForTests() {
  await fs.rm(agentRunsRoot(), { recursive: true, force: true });
}
