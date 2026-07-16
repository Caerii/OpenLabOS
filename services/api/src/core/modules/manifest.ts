/**
 * Module manifest — pure-data plugin contract.
 *
 * Domain modules (biotech, chemistry, materials, …) used to register
 * themselves through import-time side effects. That made them invisible to
 * static tooling and impossible to load at runtime. The manifest contract
 * fixes both: a module exports a single `ModuleManifest` value, and the
 * registry inspects it like any other configuration.
 *
 * A module contributes:
 *   • vocabulary (object/surface/tool/reagent ids it adds to the closed world)
 *   • criterion verifiers (functions that check structured success criteria
 *     against an observation, registered by `kind`)
 *   • prompt fragments (strings the inference service may interpolate)
 */
import type { ZodTypeAny } from "zod";

export interface VocabularyContribution {
  objects?: { id: `object:${string}`; label: string }[];
  surfaces?: { id: `surface:${string}`; label: string }[];
  tools?: { id: `tool:${string}`; label: string }[];
  reagents?: { id: `reagent:${string}`; label: string }[];
  actions?: { id: `action:${string}`; label: string }[];
}

export interface CriterionContribution {
  /** Discriminator used in the schema's `success_criteria[].kind` field. */
  kind: string;
  /** Zod schema validating the criterion payload. */
  schema: ZodTypeAny;
  /** Pure verifier — given the criterion and an observation, decide. */
  verify: (
    criterion: unknown,
    observation: { observed_objects: { object_id: string }[] },
  ) => { satisfied: boolean; evidence: string };
}

export interface PromptContribution {
  /** Slot id the inference service can interpolate this fragment into. */
  slot: string;
  text: string;
}

export interface ModuleManifest {
  /** Stable identifier, e.g. "biotech", "chemistry", "@yourlab/cryoEM". */
  id: string;
  version: string;
  /** One sentence — shown to operators in the module picker. */
  description: string;
  vocabulary?: VocabularyContribution;
  criteria?: CriterionContribution[];
  prompts?: PromptContribution[];
}

export function isModuleManifest(value: unknown): value is ModuleManifest {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as ModuleManifest).id === "string" &&
    typeof (value as ModuleManifest).version === "string"
  );
}
