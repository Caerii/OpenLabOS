import type { LabOSFeatureExperience, LabOSFeatureFlags, LabOSFeatureSurfaces } from "../api";

export const DEFAULT_LABOS_FEATURE_FLAGS = {
  protocolMode: "manual",
  stepSegmentsEnabled: true,
  confirmStepValidationEnabled: false,
  captureStepChunksEnabled: false,
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
} satisfies LabOSFeatureFlags;

export interface LabOSFeatureCapabilities {
  simpleManualRun: boolean;
  stepSegments: boolean;
  postStepValidation: boolean;
  asyncStepAnalysis: boolean;
  buttonConfirm: boolean;
  realtimeSupervisor: boolean;
  handsFree: boolean;
  fullAnnotation: boolean;
  liveVqa: boolean;
  postRunVqa: boolean;
  rollingEvidence: boolean;
  adaptivePreview: boolean;
  advancedEvidence: boolean;
}

export interface LabOSExperiencePolicy {
  profile: "operator" | "engineering";
  /** @deprecated Use `profile` */
  mode: "operator" | "engineering";
  label: string;
  configuredProfile: LabOSFeatureExperience["configuredProfile"];
  /** @deprecated Use `configuredProfile` */
  configuredMode: LabOSFeatureExperience["configuredMode"];
  enabledExperiments: string[];
  capabilities: LabOSFeatureCapabilities;
  surfaces: LabOSFeatureSurfaces;
}

export function featureFlagsOrDefault(featureFlags: LabOSFeatureFlags | null | undefined): LabOSFeatureFlags {
  return featureFlags || DEFAULT_LABOS_FEATURE_FLAGS;
}

export function deriveFeatureCapabilities(featureFlags: LabOSFeatureFlags | null | undefined): LabOSFeatureCapabilities {
  const flags = featureFlagsOrDefault(featureFlags);
  const realtimeSupervisor = flags.realtimeSupervisorEnabled === true;
  const postStepValidation = flags.confirmStepValidationEnabled === true;
  const asyncStepAnalysis = flags.asyncStepAnalysisEnabled === true;
  const buttonConfirm = flags.buttonConfirmEnabled !== false;
  const handsFree = flags.handsFreeEnabled === true && realtimeSupervisor;
  const fullAnnotation = flags.fullAnnotationEnabled === true;
  const liveVqa = flags.liveVqaEnabled === true;
  const postRunVqa = flags.postRunVqaEnabled === true;
  const rollingEvidence = flags.rollingEvidenceEnabled === true;
  const adaptivePreview = flags.adaptivePreviewEnabled === true;
  return {
    simpleManualRun: flags.protocolMode === "manual" && flags.stepSegmentsEnabled !== false && !realtimeSupervisor,
    stepSegments: flags.stepSegmentsEnabled !== false,
    postStepValidation,
    asyncStepAnalysis,
    buttonConfirm,
    realtimeSupervisor,
    handsFree,
    fullAnnotation,
    liveVqa,
    postRunVqa,
    rollingEvidence,
    adaptivePreview,
    advancedEvidence:
      postStepValidation ||
      asyncStepAnalysis ||
      realtimeSupervisor ||
      fullAnnotation ||
      liveVqa ||
      postRunVqa ||
      rollingEvidence ||
      adaptivePreview,
  };
}

function defaultOperatorSurfaces(): LabOSFeatureSurfaces {
  return {
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
}

function resolveProfile(
  featureFlags: LabOSFeatureFlags | null | undefined,
  serverExperience?: LabOSFeatureExperience | null,
): "operator" | "engineering" {
  if (serverExperience?.profile) return serverExperience.profile;
  if (serverExperience?.mode === "engineering" || serverExperience?.mode === "experimental") {
    return "engineering";
  }
  const capabilities = deriveFeatureCapabilities(featureFlags);
  const locallyExperimental =
    capabilities.advancedEvidence ||
    capabilities.handsFree ||
    featureFlagsOrDefault(featureFlags).protocolMode !== "manual";
  return locallyExperimental ? "engineering" : "operator";
}

export function deriveLabOSExperience(
  featureFlags: LabOSFeatureFlags | null | undefined,
  serverExperience?: LabOSFeatureExperience | null,
): LabOSExperiencePolicy {
  const capabilities = deriveFeatureCapabilities(featureFlags);
  const profile = resolveProfile(featureFlags, serverExperience);
  const configuredProfile = serverExperience?.configuredProfile ?? serverExperience?.configuredMode ?? "operator";
  const enabledExperiments = serverExperience?.enabledExperiments ?? [];

  const surfaces: LabOSFeatureSurfaces = serverExperience?.surfaces
    ? { ...defaultOperatorSurfaces(), ...serverExperience.surfaces }
    : profile === "engineering"
      ? {
          ...defaultOperatorSurfaces(),
          engineeringNavigation: true,
          engineeringDevTools: true,
          engineeringMaintenance: true,
          engineeringKitchenExpert: capabilities.advancedEvidence,
          engineeringKitchenInstrumentation: true,
          engineeringPreviewInstrument: true,
          engineeringPerfLab: capabilities.adaptivePreview,
          engineeringEvidenceTechnical: capabilities.advancedEvidence,
          engineeringLiveCoach: capabilities.handsFree,
          advancedNavigation: true,
          developerTools: true,
          maintenanceActions: true,
          kitchenAdvancedHeader: capabilities.advancedEvidence,
          kitchenAdvancedBadges:
            capabilities.postStepValidation || capabilities.realtimeSupervisor || capabilities.handsFree,
          kitchenExpertTabs: capabilities.advancedEvidence,
          kitchenSandbox: capabilities.advancedEvidence,
          advancedEvidencePanel: capabilities.advancedEvidence,
          technicalEvidenceRefs: capabilities.advancedEvidence,
          liveCoach: capabilities.handsFree,
        }
      : defaultOperatorSurfaces();

  return {
    profile,
    mode: profile,
    label: profile === "engineering" ? "engineering mode" : "operator mode",
    configuredProfile: configuredProfile === "experimental" ? "engineering" : configuredProfile,
    configuredMode: serverExperience?.configuredMode ?? configuredProfile,
    enabledExperiments,
    capabilities,
    surfaces,
  };
}

export function advancedLabOSFeaturesEnabled(
  featureFlags?: LabOSFeatureFlags | null,
  serverExperience?: LabOSFeatureExperience | null,
): boolean {
  return deriveLabOSExperience(featureFlags, serverExperience).profile === "engineering";
}

export function isEngineeringExperience(
  featureFlags?: LabOSFeatureFlags | null,
  serverExperience?: LabOSFeatureExperience | null,
): boolean {
  return advancedLabOSFeaturesEnabled(featureFlags, serverExperience);
}

export function isOperatorExperience(
  featureFlags?: LabOSFeatureFlags | null,
  serverExperience?: LabOSFeatureExperience | null,
): boolean {
  return !isEngineeringExperience(featureFlags, serverExperience);
}
