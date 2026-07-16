/**
 * Teacher/student judgment helpers for Kitchen route handlers.
 */

import { validateTeacherJudgmentResult } from "../../ai/kitchen/verification.js";

export function validateJudgmentWithState(parsed: any, stepId: string) {
  try {
    const judgment = validateTeacherJudgmentResult(parsed, stepId);
    return { validSchema: true, judgment } as const;
  } catch (error: any) {
    return {
      validSchema: false,
      judgment: null,
      validationError: error?.message || "schema validation failed",
    } as const;
  }
}

export function buildJudgmentAgreement(teacher: any, student: any) {
  if (!teacher || !student) return null;

  const teacherObjects = new Set((teacher.objects_seen || []).map((value: string) => value.toLowerCase()));
  const studentObjects = new Set((student.objects_seen || []).map((value: string) => value.toLowerCase()));
  const sharedObjects = [...teacherObjects].filter((value) => studentObjects.has(value));

  return {
    sameCompletion: teacher.step_complete === student.step_complete,
    sameAction: teacher.action_detected === student.action_detected,
    sameIssue: teacher.possible_issue === student.possible_issue,
    confidenceGap: Math.abs((teacher.confidence || 0) - (student.confidence || 0)),
    sharedObjects,
    teacherOnlyObjects: [...teacherObjects].filter((value) => !studentObjects.has(value)),
    studentOnlyObjects: [...studentObjects].filter((value) => !teacherObjects.has(value)),
  };
}

