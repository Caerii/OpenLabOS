import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type {
  KitchenRunAdherenceResult,
  KitchenRunSummary,
  LabOSFeatureExperience,
  LabOSFeatureFlags,
  LiveCoachHealth,
} from "../api";
import { glassesLiveCoachWsUrlForLocation } from "../api/liveCoachUrls";
import {
  buildAutoCoachCue,
  buildPrimaryAction,
  buildReadinessChecks,
  stageLabelFor,
} from "../components/kitchen/guided/model";
import {
  advancedLabOSFeaturesEnabled,
  defaultTabForFeatures,
  isTabVisibleForFeatures,
  navGroupsForFeatures,
} from "../navPaths";
import { voiceLabel } from "../components/kitchen/guided/statusLabels";

const noop = () => undefined;
const simpleFlags: LabOSFeatureFlags = {
  protocolMode: "manual",
  stepSegmentsEnabled: true,
  confirmStepValidationEnabled: false,
  asyncStepAnalysisEnabled: false,
  buttonConfirmEnabled: true,
  realtimeSupervisorEnabled: false,
  handsFreeEnabled: false,
  fullAnnotationEnabled: false,
};
const realtimeFlags: LabOSFeatureFlags = {
  ...simpleFlags,
  protocolMode: "post_step_async",
  confirmStepValidationEnabled: true,
  realtimeSupervisorEnabled: true,
  handsFreeEnabled: true,
};
const operatorSurfaces: LabOSFeatureExperience["surfaces"] = {
  operatorKitchen: true,
  operatorRunsLibrary: true,
  operatorCameraBasic: true,
  engineeringNavigation: false,
  engineeringDevTools: false,
  engineeringMaintenance: false,
  engineeringKitchenExpert: false,
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
};
const operatorExperience: LabOSFeatureExperience = {
  profile: "operator",
  mode: "operator",
  configuredProfile: "operator",
  configuredMode: "operator",
  enabledExperiments: ["post-step-validation", "realtime-supervisor"],
  surfaces: operatorSurfaces,
};
const experimentalExperience: LabOSFeatureExperience = {
  ...operatorExperience,
  profile: "engineering",
  mode: "engineering",
  configuredProfile: "engineering",
  configuredMode: "experimental",
  surfaces: {
    ...operatorSurfaces,
    engineeringNavigation: true,
    engineeringDevTools: true,
    engineeringMaintenance: true,
    engineeringKitchenExpert: true,
    engineeringKitchenInstrumentation: true,
    engineeringPreviewInstrument: true,
    engineeringPerfLab: true,
    engineeringEvidenceTechnical: true,
    engineeringLiveCoach: true,
    advancedNavigation: true,
    developerTools: true,
    maintenanceActions: true,
    kitchenAdvancedHeader: true,
    kitchenAdvancedBadges: true,
    kitchenExpertTabs: true,
    kitchenSandbox: true,
    advancedEvidencePanel: true,
    technicalEvidenceRefs: true,
    liveCoach: true,
  },
};

function voiceHealth(configured: boolean): LiveCoachHealth {
  return {
    ok: true,
    configured,
    model: configured ? "gemini-live-2.5-flash-preview-native-audio" : "static-demo",
    audioRoute: configured ? "browser-live" : "static-replay",
    output: configured ? "live-audio" : "preloaded-audio",
  };
}

function runSummary(overrides: Partial<KitchenRunSummary> = {}): KitchenRunSummary {
  return {
    id: "run-persona",
    protocolId: "kitchen-tea-v1",
    protocolName: "Make Tea",
    status: "running",
    currentStep: 1,
    totalSteps: 6,
    stepsCompleted: 0,
    elapsedMs: 0,
    ...overrides,
  };
}

function adherence(overrides: Partial<KitchenRunAdherenceResult["adherence"]> = {}, result: Partial<KitchenRunAdherenceResult> = {}) {
  return {
    success: true,
    plan: {} as KitchenRunAdherenceResult["plan"],
    selectedChecks: [],
    evidence: [],
    decision: {
      stepComplete: false,
      confidence: 0.5,
      action: "collect_short_chunk",
      summary: "synthetic persona state",
      supportingCheckIds: [],
      warnings: [],
      blockers: [],
    },
    adherence: {
      action: "confirming",
      state: "confirming",
      confidence: 0.5,
      shouldAdvance: false,
      shouldRecordVerification: false,
      reason: "synthetic persona state",
      spokenSummary: "I am checking this step.",
      stateMemory: {
        consecutivePasses: 0,
        consecutiveUncertain: 0,
        consecutiveDeviations: 0,
        lastAction: null,
        lastConfidence: 0.5,
        updatedAt: 123,
      },
      ...overrides,
    },
    verification: null,
    stepAdvanced: false,
    runCompleted: false,
    currentStep: { number: 1, instruction: "Place the mug on the counter." },
    ...result,
  } as KitchenRunAdherenceResult;
}

function primaryAction(overrides: Partial<Parameters<typeof buildPrimaryAction>[0]> = {}) {
  return buildPrimaryAction({
    completed: false,
    savedManifestRef: "",
    savingManifest: false,
    connected: true,
    labosReady: true,
    previewReady: true,
    recordingActive: true,
    voiceReady: true,
    isActive: false,
    run: null,
    shouldStartRun: true,
    shouldStartSupervisor: false,
    busy: "",
    protocolId: "kitchen-tea-v1",
    supervisor: null,
    featureFlags: simpleFlags,
    onSaveManifest: noop,
    onLaunchLabos: noop,
    onStartPreview: noop,
    onStartRun: noop,
    onStartSupervisor: noop,
    onConfirmStep: noop,
    ...overrides,
  });
}

function readinessChecks(overrides: Partial<Parameters<typeof buildReadinessChecks>[0]> = {}) {
  return buildReadinessChecks({
    connected: true,
    labosReady: true,
    labos: { packageName: "com.openlab.labos", isInstalled: true, isRunning: true } as any,
    previewReady: true,
    preview: { ok: true, fps: 2, frameBytes: 2048 } as any,
    recordingActive: false,
    recordingStatus: null,
    voiceReady: true,
    sidecarReal: true,
    voiceHealth: voiceHealth(true),
    segmentation: { mode: "sidecar", configured: true, authConfigured: false, health: { ok: true } },
    runpodGuard: { lifecycleConfigured: true, inferenceConfigured: true } as any,
    featureFlags: simpleFlags,
    busy: "",
    onLaunchLabos: noop,
    onStartPreview: noop,
    ...overrides,
  });
}

async function main() {
  const noKeyChecks = readinessChecks({
    voiceReady: false,
    sidecarReal: false,
    voiceHealth: voiceHealth(false),
    segmentation: { mode: "mock", configured: true, authConfigured: false },
    runpodGuard: { lifecycleConfigured: false, inferenceConfigured: false } as any,
  });
  const voiceCheck = noKeyChecks.find((check) => check.id === "voice");
  assert.equal(voiceCheck, undefined);
  assert.equal(voiceLabel(voiceHealth(false)), "static replay fallback");

  assert.equal(
    glassesLiveCoachWsUrlForLocation({
      protocol: "http:",
      hostname: "192.168.50.128",
      host: "192.168.50.128:5175",
      port: "5175",
    } as Location),
    "ws://192.168.50.128:5175/api/live-coach/ws",
  );

  assert.equal(
    glassesLiveCoachWsUrlForLocation({
      protocol: "https:",
      hostname: "labos.example",
      host: "labos.example",
      port: "",
    } as Location),
    "wss://labos.example/api/live-coach/ws",
  );

  const replaySafeStart = primaryAction({ voiceReady: false });
  assert.equal(replaySafeStart.label, "Start Protocol Run");
  assert.equal(replaySafeStart.disabled, false);

  const disconnected = primaryAction({ connected: false, shouldStartRun: false });
  assert.equal(disconnected.label, "Connect Glasses First");
  assert.equal(disconnected.disabled, true);

  const missingApp = primaryAction({ labosReady: false, shouldStartRun: false });
  assert.equal(missingApp.label, "Launch LabOS App");
  assert.equal(missingApp.disabled, undefined);

  const missingPreview = primaryAction({ previewReady: false, shouldStartRun: false });
  assert.equal(missingPreview.label, "Start Camera Preview");

  const startSupervisor = primaryAction({
    isActive: true,
    run: runSummary(),
    shouldStartRun: false,
    shouldStartSupervisor: true,
    featureFlags: realtimeFlags,
  });
  assert.equal(startSupervisor.label, "Start Realtime Supervisor");

  const confirmStep = primaryAction({
    isActive: true,
    run: runSummary(),
    shouldStartRun: false,
    shouldStartSupervisor: true,
  });
  assert.equal(confirmStep.label, "Confirm Step (or short-press)");

  const recordingNotReady = primaryAction({
    isActive: true,
    run: runSummary(),
    recordingActive: false,
    shouldStartRun: false,
  });
  assert.equal(recordingNotReady.label, "Recording Not Ready");
  assert.equal(recordingNotReady.disabled, true);

  const unsavedCompleted = primaryAction({
    completed: true,
    savedManifestRef: "",
  });
  assert.equal(unsavedCompleted.label, "Save Evidence Package");
  assert.equal(unsavedCompleted.disabled, undefined);

  const unsavedAborted = primaryAction({
    completed: true,
    savedManifestRef: "",
    run: runSummary({ status: "aborted", stepsCompleted: 1 }),
  });
  assert.equal(unsavedAborted.label, "Save Evidence Package");

  const completed = primaryAction({
    completed: true,
    savedManifestRef: "public/demo/session-manifest.json",
  });
  assert.equal(completed.label, "Start Another Run");
  assert.equal(completed.disabled, false);
  assert.doesNotMatch(completed.detail, /dashboard\/data\/public\/demo\/session-manifest\.json/);

  const advancedCompleted = primaryAction({
    completed: true,
    savedManifestRef: "public/demo/session-manifest.json",
    featureFlags: realtimeFlags,
  });
  assert.match(advancedCompleted.detail, /dashboard\/data\/public\/demo\/session-manifest\.json/);

  (globalThis as any).localStorage ??= {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
  };
  const { DesktopRunControl } = await import("../components/kitchen/guided/RunControl");
  const { FocusedRunModal } = await import("../components/kitchen/guided/FocusedRunModal");
  const { OperatorActionDock } = await import("../components/kitchen/guided/OperatorActionDock");
  const { DemoSideRail } = await import("../components/kitchen/guided/DemoChrome");
  const { autoStepAudioPlaybackKey, claimAutoStepAudioPlayback } = await import("../components/kitchen/guided/StepVoiceCue");
  const voiceStep = {
    number: 2,
    instruction: "Pour hot water into the mug.",
    status: "running",
    attemptId: "run-persona-step2-attempt1",
    attemptNumber: 1,
    elapsedMs: 0,
    verificationCount: 0,
    lastVerification: null,
    requiredObjects: ["mug", "kettle"],
  };
  const firstVoiceKey = autoStepAudioPlaybackKey("kitchen-tea-v1", voiceStep, "/demo/protocol-voice-assets/kitchen-tea-v1/step-2/output.wav");
  assert.equal(firstVoiceKey, "kitchen-tea-v1:run-persona-step2-attempt1:/demo/protocol-voice-assets/kitchen-tea-v1/step-2/output.wav");
  assert.equal(claimAutoStepAudioPlayback(firstVoiceKey, 1_000), true);
  assert.equal(claimAutoStepAudioPlayback(firstVoiceKey, 1_500), false);
  assert.equal(claimAutoStepAudioPlayback(firstVoiceKey, 70_000), true);

  const operatorSideRailMarkup = renderToStaticMarkup(createElement(DemoSideRail, {
    readyCount: 5,
    checkCount: 5,
    isActive: false,
    progress: 0,
    max: 5,
    run: null,
    supervisor: null,
    completed: false,
    featureFlags: realtimeFlags,
    featureExperience: operatorExperience,
    onOpenSandbox: noop,
  }));
  assert.doesNotMatch(operatorSideRailMarkup, /Sandbox/);
  assert.doesNotMatch(operatorSideRailMarkup, /Open Sandbox Tools/);

  const experimentalSideRailMarkup = renderToStaticMarkup(createElement(DemoSideRail, {
    readyCount: 5,
    checkCount: 5,
    isActive: false,
    progress: 0,
    max: 5,
    run: null,
    supervisor: null,
    completed: false,
    featureFlags: realtimeFlags,
    featureExperience: experimentalExperience,
    onOpenSandbox: noop,
  }));
  assert.match(experimentalSideRailMarkup, /Sandbox/);
  assert.match(experimentalSideRailMarkup, /Open Sandbox Tools/);

  const abortedDesktopMarkup = renderToStaticMarkup(createElement(DesktopRunControl, {
    protocolId: "kitchen-tea-v1",
    protocols: [{ id: "kitchen-tea-v1", name: "Make Tea" } as any],
    isActive: false,
    run: runSummary({ status: "aborted", stepsCompleted: 1 }),
    currentStep: null,
    primaryAction: primaryAction({
      completed: true,
      savedManifestRef: "kitchen/manifests/run-persona.json",
      run: runSummary({ status: "aborted", stepsCompleted: 1 }),
    }),
    savedManifestRef: "kitchen/manifests/run-persona.json",
    shouldStartRun: false,
    shouldStartSupervisor: false,
    busy: "",
    featureFlags: simpleFlags,
    onSelectProtocol: noop,
    onStartRun: noop,
    onStartSupervisor: noop,
    onConfirmStep: noop,
    secondaryActions: [],
    supervisor: null,
    savedRunNumber: 42,
  }));
  assert.match(abortedDesktopMarkup, /Evidence Package/);
  assert.match(abortedDesktopMarkup, /Start Another Run/);
  assert.match(abortedDesktopMarkup, /Review Run 42/);
  assert.doesNotMatch(abortedDesktopMarkup, /Start Protocol Run/);
  assert.doesNotMatch(abortedDesktopMarkup, /api\/kitchen\/session\/manifests/);

  const focusedRunMarkup = renderToStaticMarkup(createElement(FocusedRunModal, {
    open: true,
    onClose: noop,
    defaultProtocol: { id: "kitchen-tea-v1", name: "Make Tea" } as any,
    run: runSummary({ currentStep: 2, stepsCompleted: 1 }),
    currentStep: {
      number: 2,
      instruction: "Pour hot water into the mug.",
      requiredObjects: ["mug", "kettle"],
    } as any,
    primaryAction: primaryAction({
      isActive: true,
      run: runSummary({ currentStep: 2, stepsCompleted: 1 }),
      shouldStartRun: false,
    }),
    secondaryActions: [
      {
        key: "redo-previous-step",
        label: "Redo Previous Step",
        detail: "Move back one step.",
        variant: "secondary",
        onClick: noop,
      },
      {
        key: "stop-run",
        label: "Stop Run",
        detail: "Stop recording.",
        variant: "ghost",
        onClick: noop,
      },
    ],
    decision: null,
    recordingActive: true,
    buttonConfirmReady: true,
    connected: true,
    previewReady: true,
    frameCount: 12,
    fps: 2,
    savedManifestRef: "",
  }));
  assert.match(focusedRunMarkup, /Protocol Run/);
  assert.match(focusedRunMarkup, /Live glasses view/);
  assert.match(focusedRunMarkup, /Current instruction/);
  assert.ok(focusedRunMarkup.indexOf("Current instruction") < focusedRunMarkup.indexOf("Live glasses view"));
  assert.match(focusedRunMarkup, /Pour hot water into the mug/);
  assert.match(focusedRunMarkup, /Short-press the glasses camera button/);
  assert.match(focusedRunMarkup, /Redo Step/);

  const terminalFocusedMarkup = renderToStaticMarkup(createElement(FocusedRunModal, {
    open: true,
    onClose: noop,
    defaultProtocol: { id: "kitchen-tea-v1", name: "Make Tea" } as any,
    run: runSummary({ status: "completed", currentStep: 5, stepsCompleted: 5, totalSteps: 5 }),
    currentStep: {
      number: 5,
      instruction: "Place the mug on the tray.",
      requiredObjects: ["mug", "tray"],
    } as any,
    primaryAction: primaryAction({
      completed: true,
      savedManifestRef: "",
      run: runSummary({ status: "completed", stepsCompleted: 5, totalSteps: 5 }),
    }),
    secondaryActions: [],
    decision: null,
    recordingActive: false,
    buttonConfirmReady: true,
    connected: true,
    previewReady: true,
    frameCount: 12,
    fps: 2,
    savedManifestRef: "",
  }));
  assert.match(terminalFocusedMarkup, /Run complete/);
  assert.match(terminalFocusedMarkup, /Save the evidence package so this attempt appears in the run library/);
  assert.doesNotMatch(terminalFocusedMarkup, /Place the mug on the tray/);

  const terminalMobileMarkup = renderToStaticMarkup(createElement(OperatorActionDock, {
    stageLabel: "Review",
    primaryAction: primaryAction({
      completed: true,
      savedManifestRef: "kitchen/manifests/run-persona.json",
      run: runSummary({ status: "completed", stepsCompleted: 5, totalSteps: 5 }),
    }),
    secondaryActions: [],
    currentStep: null,
    recordingActive: false,
  }));
  assert.match(terminalMobileMarkup, /Start Another Run/);
  assert.doesNotMatch(terminalMobileMarkup, /Place the mug on the tray/);

  const simpleNavIds = navGroupsForFeatures(simpleFlags).flatMap((group) => group.items.map((item) => item.id));
  assert.deepEqual(simpleNavIds, ["kitchen", "preview", "files"]);
  const simpleNavLabels = navGroupsForFeatures(simpleFlags).flatMap((group) => group.items.map((item) => item.label));
  assert.ok(simpleNavLabels.includes("Runs"));
  assert.equal(advancedLabOSFeaturesEnabled(simpleFlags), false);
  assert.equal(defaultTabForFeatures(simpleFlags), "kitchen");
  assert.equal(isTabVisibleForFeatures("kitchen", simpleFlags), true);
  assert.equal(isTabVisibleForFeatures("dashboard", simpleFlags), false);
  assert.equal(isTabVisibleForFeatures("shell", simpleFlags), false);
  const advancedNavIds = navGroupsForFeatures(realtimeFlags).flatMap((group) => group.items.map((item) => item.id));
  assert.equal(defaultTabForFeatures(realtimeFlags), "dashboard");
  assert.ok(advancedNavIds.includes("dashboard"));
  assert.ok(advancedNavIds.includes("copilot"));
  assert.ok(advancedNavIds.includes("shell"));
  assert.equal(advancedLabOSFeaturesEnabled(realtimeFlags), true);
  assert.equal(isTabVisibleForFeatures("shell", realtimeFlags), true);
  assert.equal(advancedLabOSFeaturesEnabled(realtimeFlags, operatorExperience), false);
  assert.equal(defaultTabForFeatures(realtimeFlags, operatorExperience), "kitchen");
  assert.equal(isTabVisibleForFeatures("dashboard", realtimeFlags, operatorExperience), false);
  assert.equal(advancedLabOSFeaturesEnabled(simpleFlags, experimentalExperience), true);
  assert.equal(defaultTabForFeatures(simpleFlags, experimentalExperience), "dashboard");

  assert.equal(stageLabelFor({ completed: true, supervising: false, isActive: true, nextCheck: null }), "Review");
  assert.equal(stageLabelFor({ completed: false, supervising: true, isActive: true, nextCheck: null }), "Hands-free");
  assert.equal(stageLabelFor({ completed: false, supervising: false, isActive: false, nextCheck: noKeyChecks[0] }), "Setup");

  assert.deepEqual(
    buildAutoCoachCue({
      run: runSummary({ currentStep: 1, stepsCompleted: 0 }),
      currentStepNumber: 1,
      lastAdherence: null,
      supervisorRunning: true,
    }),
    { key: "welcome:run-persona", trigger: "run_started" },
  );

  assert.deepEqual(
    buildAutoCoachCue({
      run: runSummary({ currentStep: 2, stepsCompleted: 1 }),
      currentStepNumber: 2,
      lastAdherence: adherence({ action: "advance", state: "passed", confidence: 0.92 }, { stepAdvanced: true }),
      supervisorRunning: true,
    }),
    { key: "passed:run-persona:1:1", trigger: "step_passed", stepNumber: 1 },
  );

  assert.deepEqual(
    buildAutoCoachCue({
      run: runSummary({ currentStep: 3, stepsCompleted: 2 }),
      currentStepNumber: 3,
      lastAdherence: adherence({
        action: "possible_deviation",
        state: "recovering",
        confidence: 0.42,
        stateMemory: {
          consecutivePasses: 0,
          consecutiveUncertain: 0,
          consecutiveDeviations: 1,
          lastAction: "possible_deviation",
          lastConfidence: 0.42,
          updatedAt: 456,
        },
      }),
      supervisorRunning: true,
    }),
    { key: "deviation:run-persona:3:456", trigger: "possible_deviation", stepNumber: 3 },
  );

  assert.deepEqual(
    buildAutoCoachCue({
      run: runSummary({ currentStep: 4, stepsCompleted: 3 }),
      currentStepNumber: 4,
      lastAdherence: adherence({
        action: "collect_more_evidence",
        state: "confirming",
        stateMemory: {
          consecutivePasses: 0,
          consecutiveUncertain: 2,
          consecutiveDeviations: 0,
          lastAction: "collect_more_evidence",
          lastConfidence: 0.51,
          updatedAt: 789,
        },
      }),
      supervisorRunning: true,
    }),
    { key: "uncertain:run-persona:4:789", trigger: "low_confidence_or_occluded", stepNumber: 4 },
  );

  assert.deepEqual(
    buildAutoCoachCue({
      run: runSummary({ status: "completed", currentStep: 6, stepsCompleted: 6 }),
      currentStepNumber: 6,
      lastAdherence: null,
      supervisorRunning: false,
    }),
    { key: "complete:run-persona", trigger: "run_completed" },
  );

  assert.equal(
    buildAutoCoachCue({
      run: runSummary({ status: "paused" }),
      currentStepNumber: 1,
      lastAdherence: null,
      supervisorRunning: true,
    }),
    null,
  );

  console.log("[kitchen-guided-demo-ux] all checks passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
