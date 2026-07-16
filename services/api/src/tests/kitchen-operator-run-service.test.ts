import assert from "node:assert/strict";
import { getLabOSFeatureFlags, type LabOSFeatureFlags } from "../config/features.js";
import { KitchenOperatorRunService, operatorConfirmStepOptions } from "../ai/kitchen/application/operator-run-service.js";
import type { OperatorReadiness } from "../ai/kitchen/application/operator-readiness.js";

function readiness(): OperatorReadiness {
  return {
    generatedAt: Date.now(),
    ready: true,
    checks: [],
    blockers: [],
    summary: {
      glassesConnected: true,
      labosReady: true,
      previewReady: true,
      recordingActive: true,
      buttonConfirmReady: true,
      operatorMode: "manual",
    },
  };
}

function flags(overrides: Partial<LabOSFeatureFlags> = {}) {
  return {
    ...getLabOSFeatureFlags({
      LABOS_STEP_SEGMENTS_ENABLED: "true",
      LABOS_BUTTON_CONFIRM_ENABLED: "true",
      LABOS_CONFIRM_STEP_VALIDATION_ENABLED: "false",
      LABOS_PROTOCOL_MODE: "manual",
    }),
    ...overrides,
  };
}

function serviceHarness(
  featureFlags: LabOSFeatureFlags = flags(),
  opts: {
    confirmRunStatus?: string;
    completeRunStatus?: string;
    buttonLifecycle?: boolean;
  } = {},
) {
  const calls: string[] = [];
  let confirmOptions: Record<string, unknown> | null = null;
  const service = new KitchenOperatorRunService({
    featureFlags: () => featureFlags,
    configureButtonConfirmForRun: opts.buttonLifecycle
      ? async () => {
          calls.push("configureButtonConfirmForRun");
          return {};
        }
      : undefined,
    restoreButtonConfirmAfterRun: opts.buttonLifecycle
      ? async () => {
          calls.push("restoreButtonConfirmAfterRun");
          return {};
        }
      : undefined,
    ensureButtonConfirmBridge: async () => {
      calls.push("ensureButtonConfirmBridge");
      return { connected: true };
    },
    getOperatorReadiness: async () => {
      calls.push("getOperatorReadiness");
      return readiness();
    },
    getCurrentRunId: () => "run-current",
    runService: {
      beginRun: async () => {
        calls.push("beginRun");
        return { success: true, run: { id: "run-1" }, recording: { ok: true } } as any;
      },
      confirmStep: async (body) => {
        calls.push("confirmStep");
        confirmOptions = body || {};
        return {
          success: true,
          segment: { id: "segment-1" },
          validation: null,
          run: { id: "run-1", status: opts.confirmRunStatus || "running" },
          currentStep: { number: 1, instruction: "Pour water" },
        } as any;
      },
      completeStep: async () => {
        calls.push("completeStep");
        return { success: true, run: { id: "run-1", status: opts.completeRunStatus || "running" } };
      },
      abortRun: async () => {
        calls.push("abortRun");
        return { success: true, cleanup: { savedManifest: true } };
      },
    },
    saveKitchenSessionManifest: async (runId) => {
      calls.push(`saveKitchenSessionManifest:${runId}`);
      return { manifestRef: `manifest-${runId}`, manifest: { run: { id: runId } } };
    },
  });
  return { service, calls, confirmOptions: () => confirmOptions };
}

async function main() {
  const confirmDefaults = operatorConfirmStepOptions(flags({ confirmStepValidationEnabled: true }), { notes: ["ok"] });
  assert.equal(confirmDefaults.requireNativeRecording, true);
  assert.equal(confirmDefaults.captureFrame, true);
  assert.equal(confirmDefaults.captureChunk, false);
  assert.equal(confirmDefaults.stopRecordingForSegment, true);
  assert.equal(confirmDefaults.validate, true);
  assert.deepEqual(confirmDefaults.notes, ["ok"]);

  const chunkDefaults = operatorConfirmStepOptions(flags({ captureStepChunksEnabled: true }));
  assert.equal(chunkDefaults.captureChunk, true);

  {
    const { service, calls } = serviceHarness();
    const result = await service.beginRun({ protocolId: "kitchen-tea-v1" });
    assert.equal(result.success, true);
    assert.equal((result.result.run as any).id, "run-1");
    assert.deepEqual(calls, ["ensureButtonConfirmBridge", "beginRun", "getOperatorReadiness"]);
  }

  {
    const { service, calls } = serviceHarness(flags(), { buttonLifecycle: true });
    await service.beginRun({ protocolId: "kitchen-tea-v1" });
    assert.deepEqual(calls, [
      "configureButtonConfirmForRun",
      "ensureButtonConfirmBridge",
      "beginRun",
      "getOperatorReadiness",
    ]);
  }

  {
    const { service, calls, confirmOptions } = serviceHarness(flags({ protocolMode: "manual" }));
    const result = await service.confirmCurrentStep({ notes: ["operator confirmed"] });
    assert.equal(result.result.completedManually, true);
    assert.equal(confirmOptions()?.stopRecordingForSegment, true);
    assert.equal(confirmOptions()?.validate, false);
    assert.deepEqual(calls, ["confirmStep", "completeStep", "getOperatorReadiness"]);
  }

  {
    const { service, calls } = serviceHarness(flags({ protocolMode: "manual" }), {
      completeRunStatus: "completed",
      buttonLifecycle: true,
    });
    await service.confirmCurrentStep();
    assert.deepEqual(calls, [
      "confirmStep",
      "completeStep",
      "restoreButtonConfirmAfterRun",
      "getOperatorReadiness",
    ]);
  }

  {
    const { service, calls } = serviceHarness(flags({ protocolMode: "post_step_async", confirmStepValidationEnabled: true }));
    await service.confirmCurrentStep();
    assert.deepEqual(calls, ["confirmStep", "getOperatorReadiness"]);
  }

  {
    const { service, calls } = serviceHarness(flags(), { buttonLifecycle: true });
    const result = await service.saveEvidencePackage();
    assert.equal(result.result.manifestRef, "manifest-run-current");
    assert.deepEqual(calls, [
      "saveKitchenSessionManifest:run-current",
      "restoreButtonConfirmAfterRun",
      "getOperatorReadiness",
    ]);
  }

  console.log("[kitchen-operator-run-service] all checks passed");
}

await main();
