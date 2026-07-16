export interface WorkflowSupervisorDefaults {
  minIntervalMs: number;
  intervalMs: number;
  sampleIntervalMs: number;
  maxChecks: number;
  maxChecksLimit: number;
  immediate: boolean;
}

export interface LabOSWorkflowPreset {
  id: string;
  title: string;
  domain: string;
  defaultProtocolId: string;
  protocolAliases?: string[];
  supervisor: WorkflowSupervisorDefaults;
  closedWorldStepIds?: Record<string, Record<number, string>>;
  fallbackStepPrefix?: string;
  voice: {
    contextLabel: string;
    operatorRole: string;
    openingExample: string;
  };
}

export const KITCHEN_DEMO_WORKFLOW_PRESET: LabOSWorkflowPreset = {
  id: "kitchen-demo",
  title: "Kitchen Demo",
  domain: "kitchen",
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
  closedWorldStepIds: {
    "kitchen-tea-v1": {
      1: "setup-tea-workspace",
      2: "place-mug-on-counter",
      3: "pour-water-into-mug",
      4: "add-tea-bag",
      5: "stir-with-spoon",
      6: "place-mug-on-tray",
    },
    "video-extracted-tea": {
      1: "place-mug-on-counter",
      2: "pour-water-into-mug",
      3: "add-tea-bag",
      4: "stir-with-spoon",
      5: "place-mug-on-tray",
    },
    "kitchen-ramen-v1": {
      1: "place-pot-on-stove",
      2: "fill-pot-with-water",
      3: "turn-on-heat",
      4: "add-noodles",
      5: "add-seasoning",
      6: "pour-into-bowl",
    },
  },
  fallbackStepPrefix: "step",
  voice: {
    contextLabel: "LabOS workflow",
    operatorRole: "technician",
    openingExample:
      "So, trying to make a cup of tea? First, let's make sure the mug, hot water, tea bag, spoon, tray, and counter space are all visible.",
  },
};

const WORKFLOW_PRESETS = [KITCHEN_DEMO_WORKFLOW_PRESET] as const;

export function listWorkflowPresets(): readonly LabOSWorkflowPreset[] {
  return WORKFLOW_PRESETS;
}

export function defaultWorkflowPreset(): LabOSWorkflowPreset {
  return KITCHEN_DEMO_WORKFLOW_PRESET;
}

export function workflowPresetForProtocol(protocolId?: string): LabOSWorkflowPreset {
  if (!protocolId) return defaultWorkflowPreset();
  return (
    WORKFLOW_PRESETS.find((preset) =>
      preset.defaultProtocolId === protocolId ||
      preset.protocolAliases?.includes(protocolId) ||
      Object.keys(preset.closedWorldStepIds || {}).includes(protocolId)
    ) || defaultWorkflowPreset()
  );
}

export function closedWorldStepIdForProtocol(protocolId: string, stepNumber: number) {
  const preset = workflowPresetForProtocol(protocolId);
  const stepIds = preset.closedWorldStepIds?.[protocolId];
  return stepIds?.[stepNumber] || `${preset.fallbackStepPrefix || "step"}-${stepNumber}`;
}
