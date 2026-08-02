import type { KitchenProtocolSummary, LabOSWorkflowPreset } from "../../../api";

export const KITCHEN_DEMO_FALLBACK_PRESET: LabOSWorkflowPreset = {
  id: "kitchen-demo",
  title: "Guided Kitchen Run",
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
    openingExample: "The kitchen run is ready. Ask what comes next, and I will guide you through the current step.",
  },
};

export function protocolIdForPreset(
  protocols: Pick<KitchenProtocolSummary, "id">[],
  preset: LabOSWorkflowPreset,
  preferredProtocolId = ""
) {
  if (preferredProtocolId) return preferredProtocolId;
  const aliases = new Set([preset.defaultProtocolId, ...(preset.protocolAliases || [])]);
  return protocols.find((protocol) => aliases.has(protocol.id))?.id || protocols[0]?.id || "";
}

export function supervisorStartOptions(preset: LabOSWorkflowPreset) {
  return {
    intervalMs: preset.supervisor.intervalMs,
    maxChecks: preset.supervisor.maxChecks,
    immediate: preset.supervisor.immediate,
  };
}
