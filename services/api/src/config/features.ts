export type LabOSProtocolMode = "manual" | "post_step_async" | "realtime_gated";

/** Resolved or configured experience profile. */
export type LabOSExperienceProfile = "operator" | "engineering";

/** Env-configured profile selector (includes auto). */
export type LabOSExperienceProfileConfig = LabOSExperienceProfile | "auto";

/** @deprecated Use LabOSExperienceProfile — kept for API compatibility. */
export type LabOSExperienceMode = LabOSExperienceProfileConfig | "experimental";

export interface LabOSFeatureFlags {
  protocolMode: LabOSProtocolMode;
  stepSegmentsEnabled: boolean;
  captureStepChunksEnabled: boolean;
  confirmStepValidationEnabled: boolean;
  asyncStepAnalysisEnabled: boolean;
  buttonConfirmEnabled: boolean;
  realtimeSupervisorEnabled: boolean;
  handsFreeEnabled: boolean;
  fullAnnotationEnabled: boolean;
  liveVqaEnabled: boolean;
  postRunVqaEnabled: boolean;
  rollingEvidenceEnabled: boolean;
  adaptivePreviewEnabled: boolean;
  previewDuringRecordingDefault: boolean;
}

export interface LabOSSurfaceFlags {
  operatorKitchen: boolean;
  operatorRunsLibrary: boolean;
  operatorCameraBasic: boolean;
  engineeringNavigation: boolean;
  engineeringDevTools: boolean;
  engineeringMaintenance: boolean;
  engineeringKitchenExpert: boolean;
  engineeringKitchenInstrumentation: boolean;
  engineeringPreviewInstrument: boolean;
  engineeringPerfLab: boolean;
  engineeringEvidenceTechnical: boolean;
  engineeringLiveCoach: boolean;
}

/** Legacy surface keys — derived from LabOSSurfaceFlags for backward compatibility. */
export interface LabOSLegacySurfaces {
  advancedNavigation: boolean;
  developerTools: boolean;
  maintenanceActions: boolean;
  kitchenAdvancedHeader: boolean;
  kitchenAdvancedBadges: boolean;
  kitchenExpertTabs: boolean;
  kitchenSandbox: boolean;
  advancedEvidencePanel: boolean;
  technicalEvidenceRefs: boolean;
  liveCoach: boolean;
}

export type LabOSFeatureSurfaces = LabOSSurfaceFlags & LabOSLegacySurfaces;

export interface LabOSFeatureExperience {
  /** Resolved profile after auto rules. */
  profile: LabOSExperienceProfile;
  /** @deprecated Use `profile` — `experimental` maps to `engineering`. */
  mode: LabOSExperienceProfile;
  configuredProfile: LabOSExperienceProfileConfig;
  /** @deprecated Use `configuredProfile` — `experimental` maps to `engineering`. */
  configuredMode: LabOSExperienceProfileConfig | "experimental";
  enabledExperiments: string[];
  surfaces: LabOSFeatureSurfaces;
}

export interface LabOSSurfaceOverrides {
  perfLab?: boolean;
  devTools?: boolean;
  maintenance?: boolean;
  previewInstrument?: boolean;
  kitchenInstrumentation?: boolean;
}

export function parseFeatureBool(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined || value.trim() === "") return defaultValue;
  switch (value.trim().toLowerCase()) {
    case "1":
    case "true":
    case "yes":
    case "on":
      return true;
    case "0":
    case "false":
    case "no":
    case "off":
      return false;
    default:
      return defaultValue;
  }
}

function parseProtocolMode(value: string | undefined): LabOSProtocolMode {
  switch ((value || "").trim().toLowerCase()) {
    case "post_step_async":
    case "realtime_gated":
    case "manual":
      return value!.trim().toLowerCase() as LabOSProtocolMode;
    default:
      return "manual";
  }
}

export function parseExperienceProfileConfig(
  env: NodeJS.ProcessEnv = process.env,
): LabOSExperienceProfileConfig {
  const raw = (env.LABOS_EXPERIENCE_PROFILE || env.LABOS_EXPERIENCE_MODE || "operator").trim().toLowerCase();
  switch (raw) {
    case "engineering":
    case "experimental":
      return "engineering";
    case "auto":
      return "auto";
    case "operator":
    default:
      return "operator";
  }
}

/** @deprecated Use parseExperienceProfileConfig */
export function parseExperienceMode(value: string | undefined): LabOSExperienceProfileConfig {
  switch ((value || "").trim().toLowerCase()) {
    case "engineering":
    case "experimental":
      return "engineering";
    case "auto":
      return "auto";
    case "operator":
    default:
      return "operator";
  }
}

export function getLabOSFeatureFlags(env: NodeJS.ProcessEnv = process.env): LabOSFeatureFlags {
  return {
    protocolMode: parseProtocolMode(env.LABOS_PROTOCOL_MODE),
    stepSegmentsEnabled: parseFeatureBool(env.LABOS_STEP_SEGMENTS_ENABLED, true),
    captureStepChunksEnabled: parseFeatureBool(env.LABOS_CAPTURE_STEP_CHUNKS_ENABLED, false),
    confirmStepValidationEnabled: parseFeatureBool(env.LABOS_CONFIRM_STEP_VALIDATION_ENABLED, false),
    asyncStepAnalysisEnabled: parseFeatureBool(env.LABOS_ASYNC_STEP_ANALYSIS_ENABLED, false),
    buttonConfirmEnabled: parseFeatureBool(env.LABOS_BUTTON_CONFIRM_ENABLED, true),
    realtimeSupervisorEnabled: parseFeatureBool(env.LABOS_REALTIME_SUPERVISOR_ENABLED, false),
    handsFreeEnabled: parseFeatureBool(env.LABOS_HANDS_FREE_ENABLED, false),
    fullAnnotationEnabled: parseFeatureBool(env.LABOS_FULL_ANNOTATION_ENABLED, false),
    liveVqaEnabled: parseFeatureBool(env.LABOS_LIVE_VQA_ENABLED, false),
    postRunVqaEnabled: parseFeatureBool(env.LABOS_POST_RUN_VQA_ENABLED, false),
    rollingEvidenceEnabled: parseFeatureBool(env.LABOS_ROLLING_EVIDENCE_ENABLED, false),
    adaptivePreviewEnabled: parseFeatureBool(env.LABOS_ADAPTIVE_PREVIEW_ENABLED, false),
    previewDuringRecordingDefault: parseFeatureBool(env.LABOS_PREVIEW_DURING_RECORDING_DEFAULT, false),
  };
}

export function listEnabledExperiments(flags: LabOSFeatureFlags): string[] {
  return [
    flags.confirmStepValidationEnabled ? "post-step-validation" : null,
    flags.captureStepChunksEnabled ? "step-video-chunks" : null,
    flags.asyncStepAnalysisEnabled ? "async-step-analysis" : null,
    flags.realtimeSupervisorEnabled ? "realtime-supervisor" : null,
    flags.handsFreeEnabled && flags.realtimeSupervisorEnabled ? "hands-free-supervision" : null,
    flags.fullAnnotationEnabled ? "full-annotation" : null,
    flags.liveVqaEnabled ? "live-vqa" : null,
    flags.postRunVqaEnabled ? "post-run-vqa" : null,
    flags.rollingEvidenceEnabled ? "rolling-native-evidence" : null,
    flags.adaptivePreviewEnabled ? "adaptive-preview" : null,
    flags.protocolMode !== "manual" ? `protocol-mode:${flags.protocolMode}` : null,
  ].filter((value): value is string => !!value);
}

function parseSurfaceOverrides(env: NodeJS.ProcessEnv): LabOSSurfaceOverrides {
  return {
    perfLab: env.LABOS_SURFACE_PERF_LAB !== undefined
      ? parseFeatureBool(env.LABOS_SURFACE_PERF_LAB, false)
      : undefined,
    devTools: env.LABOS_SURFACE_DEV_TOOLS !== undefined
      ? parseFeatureBool(env.LABOS_SURFACE_DEV_TOOLS, true)
      : undefined,
    maintenance: env.LABOS_SURFACE_MAINTENANCE !== undefined
      ? parseFeatureBool(env.LABOS_SURFACE_MAINTENANCE, true)
      : undefined,
    previewInstrument: env.LABOS_SURFACE_PREVIEW_INSTRUMENT !== undefined
      ? parseFeatureBool(env.LABOS_SURFACE_PREVIEW_INSTRUMENT, true)
      : undefined,
    kitchenInstrumentation: env.LABOS_SURFACE_KITCHEN_INSTRUMENTATION !== undefined
      ? parseFeatureBool(env.LABOS_SURFACE_KITCHEN_INSTRUMENTATION, true)
      : undefined,
  };
}

function resolveExperienceProfile(
  flags: LabOSFeatureFlags,
  configuredProfile: LabOSExperienceProfileConfig,
  env: NodeJS.ProcessEnv = process.env,
): LabOSExperienceProfile {
  if (configuredProfile === "engineering") return "engineering";
  if (configuredProfile === "operator") return "operator";

  const experiments = listEnabledExperiments(flags);
  const allowEngineeringAuto = parseFeatureBool(env.LABOS_ALLOW_ENGINEERING_AUTO, false);
  if (allowEngineeringAuto && experiments.length > 0) return "engineering";
  return "operator";
}

function advancedEvidenceEnabled(flags: LabOSFeatureFlags): boolean {
  return (
    flags.confirmStepValidationEnabled ||
    flags.asyncStepAnalysisEnabled ||
    flags.realtimeSupervisorEnabled ||
    flags.fullAnnotationEnabled ||
    flags.liveVqaEnabled ||
    flags.postRunVqaEnabled ||
    flags.rollingEvidenceEnabled ||
    flags.adaptivePreviewEnabled
  );
}

export function deriveLabOSSurfaces(
  flags: LabOSFeatureFlags,
  profile: LabOSExperienceProfile,
  overrides: LabOSSurfaceOverrides = {},
): LabOSSurfaceFlags {
  const engineering = profile === "engineering";
  const evidence = engineering && advancedEvidenceEnabled(flags);
  const perfLab =
    overrides.perfLab ??
    (engineering &&
      (flags.adaptivePreviewEnabled || parseFeatureBool(process.env.LABOS_SURFACE_PERF_LAB, false)));

  const core: LabOSSurfaceFlags = {
    operatorKitchen: true,
    operatorRunsLibrary: true,
    operatorCameraBasic: true,
    engineeringNavigation: engineering,
    engineeringDevTools: engineering && (overrides.devTools ?? true),
    engineeringMaintenance: engineering && (overrides.maintenance ?? true),
    engineeringKitchenExpert: engineering && evidence,
    engineeringKitchenInstrumentation: engineering && (overrides.kitchenInstrumentation ?? true),
    engineeringPreviewInstrument: engineering && (overrides.previewInstrument ?? true),
    engineeringPerfLab: perfLab,
    engineeringEvidenceTechnical: evidence,
    engineeringLiveCoach: engineering && flags.handsFreeEnabled && flags.realtimeSupervisorEnabled,
  };

  return core;
}

export function withLegacySurfaces(
  surfaces: LabOSSurfaceFlags,
  flags?: LabOSFeatureFlags,
): LabOSFeatureSurfaces {
  return {
    ...surfaces,
    advancedNavigation: surfaces.engineeringNavigation,
    developerTools: surfaces.engineeringDevTools,
    maintenanceActions: surfaces.engineeringMaintenance,
    kitchenAdvancedHeader: surfaces.engineeringKitchenExpert,
    kitchenAdvancedBadges:
      surfaces.engineeringKitchenExpert &&
      !!flags &&
      (flags.confirmStepValidationEnabled ||
        flags.realtimeSupervisorEnabled ||
        flags.handsFreeEnabled),
    kitchenExpertTabs: surfaces.engineeringKitchenExpert,
    kitchenSandbox: surfaces.engineeringKitchenExpert,
    advancedEvidencePanel: surfaces.engineeringEvidenceTechnical,
    technicalEvidenceRefs: surfaces.engineeringEvidenceTechnical,
    liveCoach: surfaces.engineeringLiveCoach,
  };
}

export function deriveLabOSFeatureExperience(
  flags: LabOSFeatureFlags,
  configuredProfile: LabOSExperienceProfileConfig = "operator",
  env: NodeJS.ProcessEnv = process.env,
): LabOSFeatureExperience {
  const profile = resolveExperienceProfile(flags, configuredProfile, env);
  const enabledExperiments = listEnabledExperiments(flags);
  const surfaces = withLegacySurfaces(
    deriveLabOSSurfaces(flags, profile, parseSurfaceOverrides(env)),
    flags,
  );

  const legacyConfiguredMode =
    configuredProfile === "engineering" ? "experimental" : configuredProfile;

  return {
    profile,
    mode: profile,
    configuredProfile,
    configuredMode: legacyConfiguredMode as LabOSFeatureExperience["configuredMode"],
    enabledExperiments,
    surfaces,
  };
}

export function effectiveFeatureFlagsForExperience(
  flags: LabOSFeatureFlags,
  experience: LabOSFeatureExperience,
): LabOSFeatureFlags {
  if (experience.profile === "engineering") return flags;
  return {
    ...flags,
    protocolMode: "manual",
    captureStepChunksEnabled: false,
    confirmStepValidationEnabled: false,
    asyncStepAnalysisEnabled: false,
    realtimeSupervisorEnabled: false,
    handsFreeEnabled: false,
    fullAnnotationEnabled: false,
    liveVqaEnabled: false,
    postRunVqaEnabled: false,
    rollingEvidenceEnabled: false,
    adaptivePreviewEnabled: false,
    previewDuringRecordingDefault: false,
  };
}

export function getLabOSFeatureConfig(env: NodeJS.ProcessEnv = process.env) {
  const flags = getLabOSFeatureFlags(env);
  const configuredProfile = parseExperienceProfileConfig(env);
  const experience = deriveLabOSFeatureExperience(flags, configuredProfile, env);
  return {
    flags,
    effectiveFlags: effectiveFeatureFlagsForExperience(flags, experience),
    experience,
  };
}

export function isEngineeringProfile(experience: LabOSFeatureExperience): boolean {
  return experience.profile === "engineering";
}
