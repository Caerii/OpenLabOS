import { expect, test } from "@playwright/test";

const workflowPreset = {
  id: "kitchen-demo",
  title: "Kitchen Demo",
  domain: "kitchen-protocol",
  defaultProtocolId: "kitchen-tea-v1",
  protocolAliases: ["video-extracted-tea"],
  supervisor: {
    minIntervalMs: 10000,
    intervalMs: 15000,
    sampleIntervalMs: 1000,
    maxChecks: 2,
    maxChecksLimit: 4,
    immediate: false,
  },
  fallbackStepPrefix: "workflow_step",
  voice: {
    contextLabel: "kitchen workflow",
    operatorRole: "operator",
    openingExample: "Starting the kitchen workflow.",
  },
};

const operatorFlags = {
  flags: {
    protocolMode: "manual",
    stepSegmentsEnabled: true,
    confirmStepValidationEnabled: false,
    asyncStepAnalysisEnabled: false,
    buttonConfirmEnabled: true,
    realtimeSupervisorEnabled: false,
    handsFreeEnabled: false,
    fullAnnotationEnabled: false,
  },
  effectiveFlags: {
    protocolMode: "manual",
    stepSegmentsEnabled: true,
    confirmStepValidationEnabled: false,
    asyncStepAnalysisEnabled: false,
    buttonConfirmEnabled: true,
    realtimeSupervisorEnabled: false,
    handsFreeEnabled: false,
    fullAnnotationEnabled: false,
  },
  experience: {
    profile: "operator",
    mode: "operator",
    configuredProfile: "operator",
    configuredMode: "operator",
    enabledExperiments: [],
    surfaces: {
      operatorKitchen: true,
      operatorRunsLibrary: true,
      operatorCameraBasic: true,
      engineeringNavigation: false,
      engineeringDevTools: false,
      engineeringMaintenance: false,
      engineeringKitchenInstrumentation: false,
      engineeringPreviewInstrument: false,
      engineeringPerfLab: false,
      engineeringEvidenceTechnical: false,
      engineeringLiveCoach: false,
      advancedNavigation: false,
      developerTools: false,
      maintenanceActions: false,
      kitchenAdvancedHeader: false,
      kitchenAdvancedBadges: false,
      kitchenExpertTabs: false,
      kitchenSandbox: false,
      advancedEvidencePanel: false,
      technicalEvidenceRefs: false,
      liveCoach: false,
    },
  },
};

const defaultApiPayloads: Record<string, unknown> = {
  "/api/device/status": { connected: false },
  "/api/kitchen/features": operatorFlags,
  "/api/kitchen/protocols": {
    protocols: [
      {
        id: "kitchen-tea-v1",
        name: "Make Tea",
        description: "Prepare a cup of tea with guided steps.",
        stepCount: 6,
        estimatedMinutes: 8,
        difficulty: "beginner",
        tags: ["demo"],
      },
    ],
  },
  "/api/kitchen/run/status": {
    active: false,
    run: null,
    currentStep: null,
    protocol: null,
    sensorBridge: { connected: false, imuActive: false },
  },
  "/api/kitchen/run/supervisor/status": { running: false, lastResult: null },
  "/api/kitchen/analyze/entity-segmentation/status": { mode: "mock", configured: true, authConfigured: false },
  "/api/kitchen/analyze/entity-segmentation/status?probe=1": { mode: "mock", configured: true, authConfigured: false },
  "/api/kitchen/operator/readiness": { summary: { glassesConnected: false, previewReady: false, recordingActive: false, labosReady: false } },
  "/api/kitchen/button-confirm/status": { ready: false },
  "/api/kitchen/session/manifests": { manifests: [] },
  "/api/kitchen/modes": { modes: [] },
  "/api/workflows/default": workflowPreset,
  "/api/preview/health": { ok: false, fps: 0, frameCount: 0, streaming: false },
  "/api/preview/recording/status": { ok: false, state: { active: false }, health: { ok: false, fps: 0, frameCount: 0, streaming: false } },
  "/api/labos/status": { isInstalled: false, isRunning: false },
  "/api/runpod/guard": { configured: false, inferenceConfigured: false, lifecycleConfigured: false, recommendations: [], safeActions: [] },
  "/api/live-coach/health": { ok: true, configured: false, model: "static-demo", audioRoute: "static-replay", output: "preloaded-audio" },
  "/api/buttons/mappings": { mappings: {} },
  "/api/readyz": {
    ready: true,
    checks: {
      inference: { ok: true },
      perception: { ok: true },
    },
  },
};

test.beforeEach(async ({ page }) => {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (!url.pathname.startsWith("/api/")) {
      await route.continue();
      return;
    }
    const key = `${url.pathname}${url.search}`;
    const body = defaultApiPayloads[key] ?? defaultApiPayloads[url.pathname] ?? {};
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
});

test("loads the guided kitchen console", async ({ page }) => {
  await page.goto("/operate/kitchen");

  await expect(page.getByText("Protocol console")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "Kitchen Demo" })).toBeVisible();
  await expect(page.getByText("Service Dependencies")).toBeVisible();
  await expect(page.getByLabel(/protocol/i)).toContainText("Make Tea");
});
