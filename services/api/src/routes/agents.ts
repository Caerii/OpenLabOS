import { Router } from "express";
import {
  LABOS_AGENT_ROLES,
  LABOS_COSCIENTIST_GAPS,
  LABOS_TOOL_OCEAN,
  appendCoscientistRunEvent,
  buildCoscientistPlan,
  createCoscientistRun,
  getCoscientistRun,
  listCoscientistRuns,
  summarizeGaps,
  type CoscientistRunEvent,
  type CoscientistPlanRequest,
} from "../ai/agents/index.js";
import { asyncRoute, badRequest, notFound } from "../lib/http.js";

const router = Router();

router.get("/architecture", (_req, res) => {
  res.json({
    name: "LabOS Co-Scientist Agent Architecture",
    scope: {
      includedNow: [
        "Manager/Planner role contract",
        "Perception/VLM role contract",
        "Protocol and Critic role contracts",
        "Tool Ocean registry over existing LabOS capabilities",
        "Gap analysis against paper-style LabOS",
      ],
      explicitlyDeferred: [
        "XR HUD rendering",
        "3D/4D reconstruction",
        "Robotics/cobot handoff",
        "Autonomous generated-code execution",
      ],
    },
    roles: LABOS_AGENT_ROLES,
    tools: LABOS_TOOL_OCEAN,
    gaps: summarizeGaps(),
  });
});

router.get("/tools", (_req, res) => {
  res.json({ tools: LABOS_TOOL_OCEAN });
});

router.get("/gaps", (_req, res) => {
  res.json({ gaps: LABOS_COSCIENTIST_GAPS, byPriority: summarizeGaps() });
});

router.post("/plan", asyncRoute(async (req, res) => {
  const body = req.body as CoscientistPlanRequest;
  if (!body?.objective || typeof body.objective !== "string") {
    badRequest("objective is required");
  }
  res.json(buildCoscientistPlan(body));
}));

router.get("/runs", asyncRoute(async (req, res) => {
  const limit = typeof req.query.limit === "string" ? Number(req.query.limit) : 20;
  res.json({ runs: await listCoscientistRuns(Number.isFinite(limit) ? limit : 20) });
}));

router.post("/runs", asyncRoute(async (req, res) => {
  const body = req.body as CoscientistPlanRequest;
  if (!body?.objective || typeof body.objective !== "string") {
    badRequest("objective is required");
  }
  res.json({ success: true, run: await createCoscientistRun(body) });
}));

router.get("/runs/:id", asyncRoute(async (req, res) => {
  try {
    res.json({ run: await getCoscientistRun(req.params.id) });
  } catch (error: any) {
    if (error?.code === "ENOENT") notFound(`Co-scientist run "${req.params.id}" not found`);
    throw error;
  }
}));

router.post("/runs/:id/events", asyncRoute(async (req, res) => {
  const body = req.body as Partial<CoscientistRunEvent>;
  if (!body?.type || typeof body.type !== "string") badRequest("type is required");
  try {
    res.json({
      success: true,
      run: await appendCoscientistRunEvent(req.params.id, {
        type: body.type as CoscientistRunEvent["type"],
        stageId: typeof body.stageId === "string" ? body.stageId : undefined,
        agentId: body.agentId,
        message: typeof body.message === "string" ? body.message : undefined,
        evidenceRefs: Array.isArray(body.evidenceRefs)
          ? body.evidenceRefs.filter((value): value is string => typeof value === "string")
          : undefined,
        payload: body.payload && typeof body.payload === "object" ? body.payload : undefined,
      }),
    });
  } catch (error: any) {
    if (error?.code === "ENOENT") notFound(`Co-scientist run "${req.params.id}" not found`);
    throw error;
  }
}));

export default router;
