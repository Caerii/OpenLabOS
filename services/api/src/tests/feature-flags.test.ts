import assert from "node:assert/strict";
import {
  deriveLabOSFeatureExperience,
  getLabOSFeatureConfig,
  getLabOSFeatureFlags,
  parseExperienceProfileConfig,
  parseFeatureBool,
} from "../config/features.js";

function main() {
  assert.equal(parseFeatureBool(undefined, true), true);
  assert.equal(parseFeatureBool("", false), false);
  assert.equal(parseFeatureBool("true", false), true);
  assert.equal(parseFeatureBool("0", true), false);
  assert.equal(parseFeatureBool("unexpected", true), true);

  const defaults = getLabOSFeatureFlags({});
  assert.deepEqual(defaults, {
    protocolMode: "manual",
    stepSegmentsEnabled: true,
    captureStepChunksEnabled: false,
    confirmStepValidationEnabled: false,
    asyncStepAnalysisEnabled: false,
    buttonConfirmEnabled: true,
    realtimeSupervisorEnabled: false,
    handsFreeEnabled: false,
    fullAnnotationEnabled: false,
    liveVqaEnabled: false,
    postRunVqaEnabled: false,
    rollingEvidenceEnabled: false,
    adaptivePreviewEnabled: false,
    previewDuringRecordingDefault: false,
  });

  const enabled = getLabOSFeatureFlags({
    LABOS_PROTOCOL_MODE: "post_step_async",
    LABOS_STEP_SEGMENTS_ENABLED: "false",
    LABOS_CAPTURE_STEP_CHUNKS_ENABLED: "true",
    LABOS_CONFIRM_STEP_VALIDATION_ENABLED: "true",
    LABOS_ASYNC_STEP_ANALYSIS_ENABLED: "true",
    LABOS_BUTTON_CONFIRM_ENABLED: "false",
    LABOS_REALTIME_SUPERVISOR_ENABLED: "yes",
    LABOS_HANDS_FREE_ENABLED: "1",
    LABOS_FULL_ANNOTATION_ENABLED: "on",
    LABOS_LIVE_VQA_ENABLED: "true",
    LABOS_POST_RUN_VQA_ENABLED: "true",
    LABOS_ROLLING_EVIDENCE_ENABLED: "true",
    LABOS_ADAPTIVE_PREVIEW_ENABLED: "true",
    LABOS_PREVIEW_DURING_RECORDING_DEFAULT: "true",
  });

  assert.equal(getLabOSFeatureFlags({ LABOS_PROTOCOL_MODE: "invalid" }).protocolMode, "manual");

  assert.equal(parseExperienceProfileConfig({ LABOS_EXPERIENCE_MODE: "experimental" }), "engineering");
  assert.equal(parseExperienceProfileConfig({ LABOS_EXPERIENCE_PROFILE: "engineering" }), "engineering");

  const defaultExperience = deriveLabOSFeatureExperience(defaults);
  assert.equal(defaultExperience.profile, "operator");
  assert.equal(defaultExperience.mode, "operator");
  assert.deepEqual(defaultExperience.enabledExperiments, []);
  assert.equal(defaultExperience.surfaces.engineeringNavigation, false);
  assert.equal(defaultExperience.surfaces.operatorKitchen, true);

  const enabledExperience = deriveLabOSFeatureExperience(enabled, "engineering");
  assert.equal(enabledExperience.profile, "engineering");
  assert.ok(enabledExperience.enabledExperiments.includes("post-step-validation"));
  assert.equal(enabledExperience.surfaces.engineeringNavigation, true);
  assert.equal(enabledExperience.surfaces.engineeringKitchenExpert, true);
  assert.equal(enabledExperience.surfaces.engineeringPerfLab, true);

  const operatorConfigWithBackendExperiments = getLabOSFeatureConfig({
    LABOS_CAPTURE_STEP_CHUNKS_ENABLED: "true",
    LABOS_CONFIRM_STEP_VALIDATION_ENABLED: "true",
    LABOS_ASYNC_STEP_ANALYSIS_ENABLED: "true",
    LABOS_REALTIME_SUPERVISOR_ENABLED: "true",
    LABOS_LIVE_VQA_ENABLED: "true",
    LABOS_POST_RUN_VQA_ENABLED: "true",
    LABOS_ROLLING_EVIDENCE_ENABLED: "true",
    LABOS_ADAPTIVE_PREVIEW_ENABLED: "true",
    LABOS_PREVIEW_DURING_RECORDING_DEFAULT: "true",
  });
  assert.equal(operatorConfigWithBackendExperiments.experience.profile, "operator");
  assert.equal(operatorConfigWithBackendExperiments.effectiveFlags.realtimeSupervisorEnabled, false);
  assert.equal(operatorConfigWithBackendExperiments.effectiveFlags.adaptivePreviewEnabled, false);

  const autoConfig = getLabOSFeatureConfig({
    LABOS_EXPERIENCE_MODE: "auto",
    LABOS_REALTIME_SUPERVISOR_ENABLED: "true",
  });
  assert.equal(autoConfig.experience.profile, "operator");
  assert.equal(autoConfig.effectiveFlags.realtimeSupervisorEnabled, false);

  const autoEngineeringConfig = getLabOSFeatureConfig({
    LABOS_EXPERIENCE_MODE: "auto",
    LABOS_ALLOW_ENGINEERING_AUTO: "true",
    LABOS_REALTIME_SUPERVISOR_ENABLED: "true",
  });
  assert.equal(autoEngineeringConfig.experience.profile, "engineering");
  assert.equal(autoEngineeringConfig.effectiveFlags.realtimeSupervisorEnabled, true);

  const explicitConfig = getLabOSFeatureConfig({ LABOS_EXPERIENCE_PROFILE: "engineering" });
  assert.equal(explicitConfig.experience.profile, "engineering");
  assert.equal(explicitConfig.experience.surfaces.engineeringNavigation, true);

  const perfLabOnly = getLabOSFeatureConfig({
    LABOS_EXPERIENCE_PROFILE: "engineering",
    LABOS_SURFACE_PERF_LAB: "true",
    LABOS_ADAPTIVE_PREVIEW_ENABLED: "false",
  });
  assert.equal(perfLabOnly.experience.surfaces.engineeringPerfLab, true);

  console.log("[feature-flags] all checks passed");
}

main();
