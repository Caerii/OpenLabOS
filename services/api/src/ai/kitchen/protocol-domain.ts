/**
 * Pure protocol-domain helpers.
 *
 * Use this module when code needs to inspect, validate, summarize, or navigate
 * a protocol object. It deliberately has no filesystem, HTTP, model, or React
 * dependencies, so the abstract protocol shape stays easy to manipulate.
 */

import type { KitchenProtocol, ProtocolStep } from "./protocol-types.js";

export interface KitchenProtocolSummary {
  id: string;
  name: string;
  description: string;
  difficulty: KitchenProtocol["difficulty"];
  estimatedMinutes: number;
  stepCount: number;
  tags: string[];
}

export interface ProtocolShapeIssue {
  path: string;
  message: string;
}

export type ProtocolShapeResult =
  | { ok: true; protocol: KitchenProtocol }
  | { ok: false; issues: ProtocolShapeIssue[] };

const DIFFICULTY_ORDER: Record<KitchenProtocol["difficulty"], number> = {
  beginner: 0,
  intermediate: 1,
  advanced: 2,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasString(value: Record<string, unknown>, key: string) {
  return typeof value[key] === "string" && String(value[key]).trim().length > 0;
}

function hasStringArray(value: Record<string, unknown>, key: string) {
  return Array.isArray(value[key]) && (value[key] as unknown[]).every((item) => typeof item === "string");
}

export function summarizeProtocol(protocol: KitchenProtocol): KitchenProtocolSummary {
  return {
    id: protocol.id,
    name: protocol.name,
    description: protocol.description,
    difficulty: protocol.difficulty,
    estimatedMinutes: protocol.estimatedMinutes,
    stepCount: protocol.steps.length,
    tags: [...protocol.tags],
  };
}

export function sortProtocolsForDisplay(protocols: KitchenProtocol[]): KitchenProtocol[] {
  return [...protocols].sort((a, b) => DIFFICULTY_ORDER[a.difficulty] - DIFFICULTY_ORDER[b.difficulty]);
}

export function protocolStepByNumber(protocol: KitchenProtocol, stepNumber: number): ProtocolStep | undefined {
  return protocol.steps.find((candidate) => candidate.number === stepNumber);
}

export function protocolInventoryNames(protocol: KitchenProtocol): string[] {
  return protocol.requiredInventory.map((item) => item.name);
}

export function validateProtocolShape(value: unknown): ProtocolShapeResult {
  const issues: ProtocolShapeIssue[] = [];

  if (!isRecord(value)) {
    return { ok: false, issues: [{ path: "$", message: "Protocol must be an object." }] };
  }

  for (const key of ["id", "name", "description", "workspaceVerificationPrompt"] as const) {
    if (!hasString(value, key)) {
      issues.push({ path: key, message: `${key} must be a non-empty string.` });
    }
  }

  if (!["beginner", "intermediate", "advanced"].includes(String(value.difficulty))) {
    issues.push({ path: "difficulty", message: "difficulty must be beginner, intermediate, or advanced." });
  }

  if (typeof value.estimatedMinutes !== "number" || !Number.isFinite(value.estimatedMinutes)) {
    issues.push({ path: "estimatedMinutes", message: "estimatedMinutes must be a finite number." });
  }

  if (!hasStringArray(value, "tags")) {
    issues.push({ path: "tags", message: "tags must be an array of strings." });
  }

  if (!Array.isArray(value.requiredInventory)) {
    issues.push({ path: "requiredInventory", message: "requiredInventory must be an array." });
  } else {
    value.requiredInventory.forEach((item, index) => {
      if (!isRecord(item) || !hasString(item, "name")) {
        issues.push({ path: `requiredInventory.${index}`, message: "inventory item must include a name." });
      }
      if (!isRecord(item) || !["ingredient", "tool", "appliance"].includes(String(item.category))) {
        issues.push({ path: `requiredInventory.${index}.category`, message: "category must be ingredient, tool, or appliance." });
      }
    });
  }

  if (!Array.isArray(value.steps) || value.steps.length === 0) {
    issues.push({ path: "steps", message: "steps must contain at least one step." });
  } else {
    value.steps.forEach((step, index) => {
      if (!isRecord(step)) {
        issues.push({ path: `steps.${index}`, message: "step must be an object." });
        return;
      }
      if (typeof step.number !== "number" || !Number.isInteger(step.number) || step.number < 1) {
        issues.push({ path: `steps.${index}.number`, message: "step number must be a positive integer." });
      }
      for (const key of ["instruction", "successCriteria", "verificationPrompt"] as const) {
        if (!hasString(step, key)) {
          issues.push({ path: `steps.${index}.${key}`, message: `${key} must be a non-empty string.` });
        }
      }
      if (!hasStringArray(step, "requiredObjects")) {
        issues.push({ path: `steps.${index}.requiredObjects`, message: "requiredObjects must be an array of strings." });
      }
    });
  }

  return issues.length ? { ok: false, issues } : { ok: true, protocol: value as unknown as KitchenProtocol };
}
