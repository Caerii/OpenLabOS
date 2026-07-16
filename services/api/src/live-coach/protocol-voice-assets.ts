import type { KitchenProtocol, ProtocolStep } from "../ai/kitchen/protocols.js";

export type ProtocolVoiceScenarioCategory =
  | "welcome"
  | "preflight"
  | "step_intro"
  | "success"
  | "uncertainty"
  | "recovery"
  | "deviance"
  | "safety"
  | "completion";

export interface ProtocolVoiceScenario {
  id: string;
  protocolId: string;
  title: string;
  category: ProtocolVoiceScenarioCategory;
  prompt: string;
  script: string;
  stepNumber?: number;
  trigger: string;
  mood: "welcoming" | "confirming" | "curious" | "careful" | "celebratory";
}

export interface ProtocolVoiceAssetPlan {
  protocolId: string;
  protocolName: string;
  generatedAt: string;
  scenarioCount: number;
  scenarios: ProtocolVoiceScenario[];
}

const VOICE_STYLE =
  "Speak only the final hands-free copilot voice feedback. Be warm, playful, and precise. Keep it to one or two short sentences. Do not narrate analysis.";

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function cleanSentence(value: string) {
  return value.replace(/\s+/g, " ").replace(/[.]\s*$/, "").trim();
}

function primaryObject(step: ProtocolStep) {
  return step.requiredObjects.find((item) => item.toLowerCase() !== "counter") || step.requiredObjects[0] || "the required item";
}

function nextStep(protocol: KitchenProtocol, step: ProtocolStep) {
  return protocol.steps.find((candidate) => candidate.number === step.number + 1);
}

function promptFor(scenario: string) {
  return `${scenario}\n\n${VOICE_STYLE}`;
}

function scenario(
  input: Omit<ProtocolVoiceScenario, "prompt"> & { promptScenario: string },
): ProtocolVoiceScenario {
  return {
    id: input.id,
    protocolId: input.protocolId,
    title: input.title,
    category: input.category,
    stepNumber: input.stepNumber,
    trigger: input.trigger,
    mood: input.mood,
    script: input.script,
    prompt: promptFor(input.promptScenario),
  };
}

export function generateProtocolVoicePlan(protocol: KitchenProtocol, now = new Date()): ProtocolVoiceAssetPlan {
  const scenarios: ProtocolVoiceScenario[] = [];
  const firstObjects = protocol.requiredInventory.slice(0, 4).map((item) => item.name).join(", ");

  scenarios.push(scenario({
    id: `${protocol.id}__welcome`,
    protocolId: protocol.id,
    title: "Welcome: start the protocol",
    category: "welcome",
    trigger: "run_started",
    mood: "welcoming",
    script: `Ready for ${protocol.name}? I will watch the workspace, keep us honest, and call out each step as we go.`,
    promptScenario: `Demo scenario: The user just started the protocol "${protocol.name}". Welcome them, explain that you will watch through the glasses, and make the first moment feel friendly.`,
  }));

  scenarios.push(scenario({
    id: `${protocol.id}__preflight-ready`,
    protocolId: protocol.id,
    title: "Preflight: workspace looks ready",
    category: "preflight",
    trigger: "workspace_ready",
    mood: "confirming",
    script: `Workspace looks ready. I can see the key materials${firstObjects ? ` like ${firstObjects}` : ""}, so we can begin.`,
    promptScenario: `Demo scenario: The workspace preflight for "${protocol.name}" passed. Confirm readiness and invite the user into step one.`,
  }));

  scenarios.push(scenario({
    id: `${protocol.id}__preflight-missing-object`,
    protocolId: protocol.id,
    title: "Preflight: something is missing",
    category: "recovery",
    trigger: "workspace_missing_required_object",
    mood: "curious",
    script: `Tiny setup check: I do not see every required item yet. Bring the missing object into view and I will keep going.`,
    promptScenario: `Demo scenario: The workspace preflight for "${protocol.name}" found a missing required object. Be warm, concise, and ask the user to bring it into view.`,
  }));

  for (const step of protocol.steps) {
    const stepSlug = slug(step.instruction || `step-${step.number}`);
    const object = primaryObject(step);
    const next = nextStep(protocol, step);
    const shortInstruction = cleanSentence(step.instruction);
    const shortCriteria = cleanSentence(step.successCriteria || step.instruction);

    scenarios.push(scenario({
      id: `${protocol.id}__step-${step.number}__intro-${stepSlug}`,
      protocolId: protocol.id,
      title: `Step ${step.number}: coach the next action`,
      category: "step_intro",
      stepNumber: step.number,
      trigger: "step_started",
      mood: "welcoming",
      script: `Step ${step.number}: ${shortInstruction}. I am watching for ${shortCriteria}.`,
      promptScenario: `Demo scenario: The current protocol is "${protocol.name}". The user is starting step ${step.number}: "${step.instruction}". Coach the next action in a welcoming way and mention what you are watching for.`,
    }));

    scenarios.push(scenario({
      id: `${protocol.id}__step-${step.number}__passed-${stepSlug}`,
      protocolId: protocol.id,
      title: `Step ${step.number}: passed`,
      category: "success",
      stepNumber: step.number,
      trigger: "step_passed",
      mood: "confirming",
      script: next
        ? `Confirmed, step ${step.number} passed. Next up: ${cleanSentence(next.instruction)}.`
        : `Confirmed, step ${step.number} passed. That completes the protocol.`,
      promptScenario: `Demo scenario: Step ${step.number} of "${protocol.name}" passed with high confidence. Confirm success, sound friendly, and preview the next action if one exists.`,
    }));

    scenarios.push(scenario({
      id: `${protocol.id}__step-${step.number}__uncertain-${stepSlug}`,
      protocolId: protocol.id,
      title: `Step ${step.number}: uncertain view`,
      category: "uncertainty",
      stepNumber: step.number,
      trigger: "low_confidence_or_occluded",
      mood: "curious",
      script: `I am not fully sure I saw step ${step.number} yet. Hold ${object} in view for one more second and I can confirm it.`,
      promptScenario: `Demo scenario: The model is uncertain whether step ${step.number} is complete because the view is occluded or low confidence. Ask for a better view without sounding robotic.`,
    }));

    scenarios.push(scenario({
      id: `${protocol.id}__step-${step.number}__missing-${slug(object)}`,
      protocolId: protocol.id,
      title: `Step ${step.number}: missing ${object}`,
      category: "recovery",
      stepNumber: step.number,
      trigger: "missing_required_object",
      mood: "curious",
      script: `Small snag: I do not see ${object} for this step. Bring it into the workspace and we are back on track.`,
      promptScenario: `Demo scenario: Step ${step.number} requires "${object}", but it is missing from the view. Give a friendly recovery instruction.`,
    }));

    scenarios.push(scenario({
      id: `${protocol.id}__step-${step.number}__possible-deviation-${stepSlug}`,
      protocolId: protocol.id,
      title: `Step ${step.number}: possible deviance`,
      category: "deviance",
      stepNumber: step.number,
      trigger: "possible_deviation",
      mood: "careful",
      script: `Possible mismatch: this does not quite look like ${shortInstruction}. Let us pause, reset the view, and try that step again.`,
      promptScenario: `Demo scenario: The user may be doing the wrong action for step ${step.number}: "${step.instruction}". Correct gently, avoid blame, and suggest the cleanest recovery.`,
    }));

    for (const hazard of step.hazardChecks || []) {
      scenarios.push(scenario({
        id: `${protocol.id}__step-${step.number}__safety-${slug(hazard)}`,
        protocolId: protocol.id,
        title: `Step ${step.number}: safety check`,
        category: "safety",
        stepNumber: step.number,
        trigger: "safety_warning",
        mood: "careful",
        script: `Pause for safety: ${cleanSentence(hazard)}. Stabilize the setup first, then continue when it looks safe.`,
        promptScenario: `Demo scenario: During step ${step.number} of "${protocol.name}", the system detected this safety concern: "${hazard}". Give a calm stop-and-correct warning.`,
      }));
    }
  }

  scenarios.push(scenario({
    id: `${protocol.id}__completion`,
    protocolId: protocol.id,
    title: "Completion: protocol finished",
    category: "completion",
    trigger: "run_completed",
    mood: "celebratory",
    script: `Protocol complete. I saved the run, the key checkpoints, and the useful training moments for review.`,
    promptScenario: `Demo scenario: The user completed "${protocol.name}". Give a friendly completion message and mention that the run was saved for review/training.`,
  }));

  return {
    protocolId: protocol.id,
    protocolName: protocol.name,
    generatedAt: now.toISOString(),
    scenarioCount: scenarios.length,
    scenarios,
  };
}

export function getProtocolVoiceScenario(protocol: KitchenProtocol, scenarioId: string): ProtocolVoiceScenario | undefined {
  return generateProtocolVoicePlan(protocol).scenarios.find((item) => item.id === scenarioId);
}
