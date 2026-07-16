/**
 * Protocol context for the hands-free Live Coach.
 *
 * This module converts structured protocol definitions into compact facts the
 * realtime voice model can use, and provides deterministic command matching
 * for operator phrases such as "switch to the toast protocol".
 */

import {
  listProtocols,
  getProtocol,
  type KitchenProtocol,
} from "../ai/kitchen/protocols.js";
import {
  protocolInventoryNames,
  summarizeProtocol,
} from "../ai/kitchen/protocol-domain.js";

export interface LiveCoachProtocolStepBrief {
  number: number;
  instruction: string;
  successCriteria: string;
  requiredObjects: string[];
  hazardChecks: string[];
}

export interface LiveCoachProtocolContext {
  id: string;
  name: string;
  description: string;
  difficulty: KitchenProtocol["difficulty"];
  estimatedMinutes: number;
  stepCount: number;
  tags: string[];
  inventory: string[];
  firstStep: LiveCoachProtocolStepBrief | null;
  steps: LiveCoachProtocolStepBrief[];
}

export interface ProtocolSwitchMatch {
  protocol: KitchenProtocol;
  alias: string;
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compactProtocolId(id: string) {
  return id
    .replace(/^kitchen-/, "")
    .replace(/-v\d+$/, "");
}

function aliasesForProtocol(protocol: KitchenProtocol): string[] {
  const aliases = new Set<string>([
    protocol.id,
    protocol.name,
    compactProtocolId(protocol.id),
    ...protocol.tags,
  ]);
  const name = normalize(protocol.name);
  if (name.startsWith("make ")) aliases.add(name.replace(/^make\s+/, ""));
  if (name.includes("cup of tea")) aliases.add("tea");
  if (name.includes("toast")) aliases.add("toast");
  if (name.includes("sandwich")) aliases.add("sandwich");
  if (name.includes("eggs")) aliases.add("eggs");
  return [...aliases].map(normalize).filter(Boolean);
}

function hasSwitchIntent(normalizedText: string) {
  return /\b(switch|change|set|select|load|use|start|begin|make)\b/.test(normalizedText)
    || /\b(protocol|workflow|recipe|task|run)\b/.test(normalizedText);
}

export function findProtocolSwitchCommand(
  utterance: string,
  protocols: KitchenProtocol[] = listProtocols(),
): ProtocolSwitchMatch | null {
  const text = normalize(utterance);
  if (!text || !hasSwitchIntent(text)) return null;

  const candidates = protocols.flatMap((protocol) =>
    aliasesForProtocol(protocol).map((alias) => ({ protocol, alias })),
  ).sort((a, b) => b.alias.length - a.alias.length);

  for (const candidate of candidates) {
    if (candidate.alias.length < 3) continue;
    if (text.includes(candidate.alias)) return candidate;
  }
  return null;
}

function stepBrief(step: KitchenProtocol["steps"][number]): LiveCoachProtocolStepBrief {
  return {
    number: step.number,
    instruction: step.instruction,
    successCriteria: step.successCriteria,
    requiredObjects: [...(step.requiredObjects || [])],
    hazardChecks: [...(step.hazardChecks || [])],
  };
}

export function protocolContextFromProtocol(protocol: KitchenProtocol): LiveCoachProtocolContext {
  const summary = summarizeProtocol(protocol);
  const steps = protocol.steps.map(stepBrief);
  return {
    ...summary,
    inventory: protocolInventoryNames(protocol),
    firstStep: steps[0] || null,
    steps,
  };
}

export function protocolContextById(protocolId: string): LiveCoachProtocolContext | null {
  const protocol = getProtocol(protocolId);
  return protocol ? protocolContextFromProtocol(protocol) : null;
}

export function formatProtocolContextForVoice(context: LiveCoachProtocolContext) {
  const firstStep = context.firstStep
    ? `Step ${context.firstStep.number}: ${context.firstStep.instruction}`
    : "No steps are defined.";
  const hazards = context.steps.flatMap((step) => step.hazardChecks).slice(0, 5);
  return [
    `Active protocol: ${context.name} (${context.id}).`,
    `Scientific/procedural context: this is a structured protocol-adherence run with reference steps, success criteria, required objects, hazard checks, realtime visual evidence, and deterministic LabOS state updates.`,
    `Estimated duration: ${context.estimatedMinutes} minutes across ${context.stepCount} steps.`,
    `Required inventory: ${context.inventory.join(", ") || "(none)"}.`,
    `First action: ${firstStep}.`,
    `Safety context: ${hazards.length ? hazards.join("; ") : "no explicit hazards in the protocol"}.`,
  ].join("\n");
}
