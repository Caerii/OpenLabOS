export interface LiveCoachDemoScenario {
  id: string;
  title: string;
  category: "deviance" | "safety" | "recovery" | "success";
  prompt: string;
}

const VOICE_STYLE =
  "Speak only the final hands-free copilot voice feedback. Keep it to one or two short sentences. Do not narrate analysis.";

function voicePrompt(scenario: string) {
  return `${scenario}\n\n${VOICE_STYLE}`;
}

export const LIVE_COACH_DEMO_SCENARIOS: LiveCoachDemoScenario[] = [
  {
    id: "wrong-order-teabag-first",
    title: "Wrong order: tea bag before workspace ready",
    category: "deviance",
    prompt: voicePrompt(
      "Demo scenario: The technician is making tea but skipped the workspace setup. They put the tea bag near the mug before the mug is clearly placed on the counter. Identify the step deviance and say what should happen next.",
    ),
  },
  {
    id: "hot-water-without-mug",
    title: "Safety: hot water before mug stabilized",
    category: "safety",
    prompt: voicePrompt(
      "Demo scenario: The technician is about to pour hot water, but the mug is near the counter edge and not stable. Stop the action, explain the hazard, and give the safe correction.",
    ),
  },
  {
    id: "missing-spoon-stir",
    title: "Missing object: no spoon for stir step",
    category: "recovery",
    prompt: voicePrompt(
      "Demo scenario: The current protocol step is stirring, but no spoon is visible. Say the step is not ready, name the missing object, and suggest a simple recovery action.",
    ),
  },
  {
    id: "step-passed-place-mug",
    title: "Step passed: mug placement confirmed",
    category: "success",
    prompt: voicePrompt(
      "Demo scenario: The model verified that the mug is placed on the counter with high confidence. Give a short positive confirmation and preview the next action.",
    ),
  },
  {
    id: "deviance-milk-before-steep",
    title: "Wrong order: milk before steeping",
    category: "deviance",
    prompt: voicePrompt(
      "Demo scenario: The technician added milk before the tea bag has steeped. Explain the step deviance without being harsh, say whether the run should continue, and suggest the cleanest correction.",
    ),
  },
];

export function getLiveCoachDemoScenario(id: string) {
  return LIVE_COACH_DEMO_SCENARIOS.find((scenario) => scenario.id === id);
}
