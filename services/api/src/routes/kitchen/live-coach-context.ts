/**
 * Live-coach prompt context for Kitchen routes.
 *
 * Route handlers call these helpers when the deterministic protocol state needs
 * to be translated into concise Gemini Live voice context. Keeping this module
 * separate prevents generic route utilities from owning voice UX policy.
 */

import { protocolTracker } from "../../ai/kitchen/index.js";
import type { AdherencePolicyDecision, MultiscaleDecision } from "../../ai/kitchen/index.js";
import type { KitchenProtocol } from "../../ai/kitchen/protocols.js";
import { workflowPresetForProtocol } from "../../ai/workflows/index.js";
import { getKitchenRouteDeps } from "./deps.js";

type CurrentStep = NonNullable<ReturnType<typeof protocolTracker.getCurrentStep>>;
type ProtocolStep = KitchenProtocol["steps"][number];

function stepObjects(step: ProtocolStep) {
  return (step.requiredObjects || []).join(", ") || "(none)";
}

function inventoryList(protocol: KitchenProtocol) {
  return protocol.requiredInventory.map((item) => item.name).join(", ");
}

export async function sendLiveCoachSetupContext(
  run: { protocolId: string; protocolName?: string },
  protocol: KitchenProtocol,
) {
  try {
    getKitchenRouteDeps().liveCoachSetActiveProtocol(run.protocolId);
    const workflow = workflowPresetForProtocol(run.protocolId);
    const firstStep = protocol.steps[0];
    const msg =
      `${workflow.voice.contextLabel} setup briefing:\n` +
      `- Protocol: ${run.protocolName || protocol.name}\n` +
      `- Required setup objects: ${inventoryList(protocol)}\n` +
      `- First step after setup: ${firstStep?.instruction || "(none)"}\n` +
      `Speak a warm, concise welcome through the glasses. Ask the ${workflow.voice.operatorRole} to place the required objects in view and keep the glasses pointed at the workspace. If they ask "what do I do next?", answer from the current step and live video context. Do not judge the first step yet. End by asking them to say or tap when ready to begin.`;
    await getKitchenRouteDeps().liveCoachSendText(msg);
  } catch {}
}

export async function sendLiveCoachVerificationContext(
  run: { protocolId: string },
  currentStep: CurrentStep,
  verification: { confidence?: number; success: boolean; reasoning?: string },
) {
  try {
    getKitchenRouteDeps().liveCoachSetActiveProtocol(run.protocolId);
    const workflow = workflowPresetForProtocol(run.protocolId);
    const confPct = Math.round((verification.confidence || 0) * 100);
    const msg =
      `${workflow.voice.contextLabel} context update:\n` +
      `- Protocol: ${run.protocolId}\n` +
      `- Step ${currentStep.step.number}: ${currentStep.step.instruction}\n` +
      `- Success criteria: ${currentStep.step.successCriteria}\n` +
      `- Required objects: ${stepObjects(currentStep.step)}\n` +
      `- Verification: ${verification.success ? "PASS" : "FAIL"} (${confPct}% confidence)\n` +
      `- Reason: ${String(verification.reasoning || "").slice(0, 280)}\n` +
      `Respond with concise guidance for the ${workflow.voice.operatorRole}. If FAIL, suggest the most likely missing correction. If PASS, briefly confirm and suggest the next step.`;
    await getKitchenRouteDeps().liveCoachSendText(msg);
  } catch {}
}

export async function sendLiveCoachAdherenceContext(
  run: { protocolId: string; protocolName?: string },
  currentStep: CurrentStep,
  adherence: AdherencePolicyDecision,
  decision?: MultiscaleDecision,
  spatialContextText?: string,
) {
  try {
    getKitchenRouteDeps().liveCoachSetActiveProtocol(run.protocolId);
    const workflow = workflowPresetForProtocol(run.protocolId);
    const confPct = Math.round((adherence.confidence || 0) * 100);
    const msg =
      `${workflow.voice.contextLabel} adherence tick:\n` +
      `- Protocol: ${run.protocolName || run.protocolId}\n` +
      `- Step ${currentStep.step.number}: ${currentStep.step.instruction}\n` +
      `- Success criteria: ${currentStep.step.successCriteria}\n` +
      `- Deterministic state: ${adherence.state}\n` +
      `- Action: ${adherence.action} (${confPct}% confidence)\n` +
      `- Reason: ${adherence.reason.slice(0, 360)}\n` +
      `- Voice cue to express: ${adherence.spokenSummary}\n` +
      `- Multiscale summary: ${(decision?.summary || "").slice(0, 260)}\n` +
      (spatialContextText ? `- Grounded spatial context:\n${spatialContextText}\n` : "") +
      `Respond as a concise hands-free co-pilot. Be specific, calm, and forgiving. Use grounded directional wording such as "on your right" only when the spatial context supports it. If action is advance, give only a short confirmation because the next step instruction will follow. Do not claim completion unless the deterministic action is advance.`;
    await getKitchenRouteDeps().liveCoachSendText(msg);
  } catch {}
}

export async function sendLiveCoachStepContext(
  run: { protocolId: string; protocolName?: string },
  currentStep: CurrentStep,
  phase: "start" | "advance" | "resume" = "start",
) {
  try {
    getKitchenRouteDeps().liveCoachSetActiveProtocol(run.protocolId);
    const workflow = workflowPresetForProtocol(run.protocolId);
    const phaseLine =
      phase === "advance"
        ? "The prior step is complete. Briefly confirm success, then coach the next step."
        : phase === "resume"
          ? "The run has resumed. Re-orient the technician and restate the current step."
          : "The run is active. Introduce the current step and what to watch for.";

    const msg =
      `${workflow.voice.contextLabel} step context:\n` +
      `- Protocol: ${run.protocolName || run.protocolId}\n` +
      `- Step ${currentStep.step.number}: ${currentStep.step.instruction}\n` +
      `- Success criteria: ${currentStep.step.successCriteria}\n` +
      `- Required objects: ${stepObjects(currentStep.step)}\n` +
      `- Hazards: ${(currentStep.step.hazardChecks || []).join(", ") || "(none)"}\n` +
      `${phaseLine}`;
    await getKitchenRouteDeps().liveCoachSendText(msg);
  } catch {}
}

export async function sendLiveCoachHandsFreeStartContext(
  run: { protocolId: string; protocolName?: string },
  protocol: KitchenProtocol,
  currentStep: CurrentStep | null,
  inventoryContextText?: string | null,
) {
  try {
    getKitchenRouteDeps().liveCoachSetActiveProtocol(run.protocolId);
    await getKitchenRouteDeps().liveCoachSendText(
      buildLiveCoachHandsFreeStartText(run, protocol, currentStep, inventoryContextText),
    );
  } catch {}
}

export function buildLiveCoachHandsFreeStartText(
  run: { protocolId: string; protocolName?: string },
  protocol: KitchenProtocol,
  currentStep: CurrentStep | null,
  inventoryContextText?: string | null,
) {
  const workflow = workflowPresetForProtocol(run.protocolId);
  const step = currentStep?.step || protocol.steps[0];
  const stepNumber = currentStep?.step.number || step?.number || 1;
  const stepInstruction = step?.instruction || "Look at the workspace and confirm the required setup objects are visible.";
  const successCriteria = step?.successCriteria || "The operator is oriented to the first actionable protocol step.";

  return (
    `${workflow.voice.contextLabel} hands-free step guide started:\n` +
    `- Protocol: ${run.protocolName || protocol.name}\n` +
    `- Required setup objects: ${inventoryList(protocol)}\n` +
    (inventoryContextText
      ? `- Inventory preflight from current camera frame:\n${inventoryContextText}\n`
      : "- Inventory preflight from current camera frame: unavailable; ask the operator to look at the workspace so you can confirm objects.\n") +
    `- Current step ${stepNumber}: ${stepInstruction}\n` +
    `- Success criteria: ${successCriteria}\n` +
    `- Required objects for this step: ${step ? stepObjects(step) : "(none)"}\n` +
    `Speak immediately through the glasses in a warm, useful voice. First confirm which inventory objects you can see and what still needs to be brought into view. Then say you will guide them step by step and give the exact current action. Tell them they can ask "what do I do next?" at any time. Do not ask them to tap or wait; the run is already active and the realtime supervisor is watching. If the live view is unclear, ask them to look at the workspace and name the required objects.`
  );
}

export async function sendLiveCoachSupervisorStartContext(
  run: { protocolId: string; protocolName?: string },
  currentStep: CurrentStep,
) {
  try {
    getKitchenRouteDeps().liveCoachSetActiveProtocol(run.protocolId);
    const workflow = workflowPresetForProtocol(run.protocolId);
    const msg =
      `${workflow.voice.contextLabel} realtime supervisor started:\n` +
      `- Protocol: ${run.protocolName || run.protocolId}\n` +
      `- Current step ${currentStep.step.number}: ${currentStep.step.instruction}\n` +
      `- Success criteria: ${currentStep.step.successCriteria}\n` +
      `- Required objects: ${stepObjects(currentStep.step)}\n` +
      `Speak one concise step-guidance message. If the operator asks "what do I do next?", guide them to this current step using the live video if it is clear. If the operator is still arranging the workspace, help them set up instead of judging deviation. Example tone: "${workflow.voice.openingExample}"`;
    await getKitchenRouteDeps().liveCoachSendText(msg);
  } catch {}
}

export async function sendLiveCoachRunCompleteContext(run: { protocolId: string; protocolName?: string }) {
  try {
    const workflow = workflowPresetForProtocol(run.protocolId);
    await getKitchenRouteDeps().liveCoachSendText(
      `${workflow.voice.contextLabel} run complete:\n` +
      `- Protocol: ${run.protocolName || run.protocolId}\n` +
      `Briefly confirm completion and tell the ${workflow.voice.operatorRole} the workflow is finished.`,
    );
  } catch {}
}
