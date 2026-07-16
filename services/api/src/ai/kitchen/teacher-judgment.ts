import type { ERAnalysisMode } from "./er-modes.js";
import { ActionIdSchema, IssueIdSchema, ObjectIdSchema } from "./judgment-schema.js";
import type { ProtocolStep } from "./protocols.js";

function formatEnumValues(values: readonly string[]) {
  return values.map((value) => JSON.stringify(value)).join("|");
}

function formatArrayValues(values: readonly string[]) {
  return values.map((value) => JSON.stringify(value)).join(",");
}

export function buildTeacherJudgmentMode({
  protocolId,
  stepNumber,
  stepId,
  step,
}: {
  protocolId: string;
  stepNumber: number;
  stepId: string;
  step: ProtocolStep;
}): ERAnalysisMode {
  const objectsSeen = formatArrayValues(ObjectIdSchema.options);
  const actionValues = formatEnumValues(ActionIdSchema.options);
  const issueValues = formatEnumValues(IssueIdSchema.options);

  return {
    id: "teacher-judgment",
    name: "Teacher Judgment (Closed World)",
    outputType: "json",
    thinkingBudget: 0,
    systemInstruction: "You are a strict JSON emitter. Output ONLY valid JSON (no markdown, no preface).",
    prompt:
      `You are judging whether a protocol step has been completed from a first-person POV image.\n\n` +
      `ProtocolId: ${protocolId}\n` +
      `StepNumber: ${stepNumber}\n` +
      `StepId: ${stepId}\n` +
      `Instruction: ${step.instruction}\n` +
      `SuccessCriteria: ${step.successCriteria}\n` +
      `RequiredObjects: ${(step.requiredObjects || []).join(", ")}\n\n` +
      `Your job is to output a JSON object with this exact schema:\n` +
      `{\n` +
      `  "step_id": "${stepId}",\n` +
      `  "objects_seen": [${objectsSeen}],\n` +
      `  "action_detected": ${actionValues}|null,\n` +
      `  "step_complete": true|false,\n` +
      `  "possible_issue": ${issueValues}|null,\n` +
      `  "confidence": 0.0-1.0,\n` +
      `  "reason": "short explanation"\n` +
      `}\n\n` +
      `Rules:\n` +
      `- Only use the listed enum values.\n` +
      `- If uncertain, set action_detected or possible_issue to null and lower confidence.\n` +
      `- Prefer precision over optimism.\n`,
  };
}
