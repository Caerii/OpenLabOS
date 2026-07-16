import assert from "node:assert/strict";
import { buildOperatorReadiness } from "../ai/kitchen/application/operator-readiness.js";
import { getLabOSFeatureFlags } from "../config/features.js";

function check(readiness: ReturnType<typeof buildOperatorReadiness>, id: string) {
  const found = readiness.checks.find((item) => item.id === id);
  assert.ok(found, `expected ${id} readiness check`);
  return found;
}

function main() {
  const flags = getLabOSFeatureFlags({
    LABOS_BUTTON_CONFIRM_ENABLED: "true",
    LABOS_STEP_SEGMENTS_ENABLED: "true",
    LABOS_CONFIRM_STEP_VALIDATION_ENABLED: "false",
    LABOS_REALTIME_SUPERVISOR_ENABLED: "false",
  });

  const ready = buildOperatorReadiness({
    connected: true,
    labosInstalled: true,
    labosRunning: true,
    previewReachable: true,
    previewFrameBytes: 1234,
    previewFps: 12.5,
    buttonConfirmEnabled: true,
    buttonMapped: true,
    buttonStreamConnected: true,
    featureFlags: flags,
  });
  assert.equal(ready.ready, true);
  assert.equal(ready.summary.buttonConfirmReady, true);
  assert.equal(check(ready, "recording").state, "ready");

  const blocked = buildOperatorReadiness({
    connected: true,
    labosInstalled: true,
    labosRunning: true,
    previewReachable: true,
    buttonConfirmEnabled: true,
    buttonMapped: true,
    buttonStreamConnected: false,
    buttonMappingValue: "protocol_confirm_step",
    featureFlags: flags,
  });
  assert.equal(blocked.ready, false);
  assert.equal(blocked.summary.buttonConfirmReady, false);
  assert.equal(check(blocked, "button-confirm").recoveryAction, "reconnect_button");

  const unmapped = buildOperatorReadiness({
    connected: true,
    labosInstalled: true,
    labosRunning: true,
    previewReachable: true,
    buttonConfirmEnabled: true,
    buttonMapped: false,
    buttonStreamConnected: true,
    buttonMappingValue: "take_photo",
    featureFlags: flags,
  });
  assert.equal(unmapped.ready, true);
  assert.equal(unmapped.summary.buttonConfirmReady, true);
  assert.equal(check(unmapped, "button-confirm").state, "ready");
  assert.match(check(unmapped, "button-confirm").detail, /Start Protocol will arm camera short-press/);

  const noButton = buildOperatorReadiness({
    connected: true,
    labosInstalled: true,
    labosRunning: true,
    previewReachable: true,
    buttonConfirmEnabled: false,
    featureFlags: { ...flags, buttonConfirmEnabled: false },
  });
  assert.equal(noButton.checks.some((item) => item.id === "button-confirm"), false);
  assert.equal(noButton.summary.buttonConfirmReady, true);

  console.log("[kitchen-operator-readiness] all checks passed");
}

main();
