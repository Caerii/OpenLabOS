/**
 * Protocol contracts for Kitchen-style physical workflows.
 *
 * These interfaces are independent of storage, routing, and UI. A protocol is
 * pure data: ordered steps, required objects, safety checks, and verification
 * prompts that agents can evaluate against camera evidence.
 */

/** A single step in a physical workflow protocol. */
export interface ProtocolStep {
  /** Step number (1-indexed). */
  number: number;
  /** Human-readable instruction shown to the operator. */
  instruction: string;
  /** What perception should verify to confirm this step is done. */
  successCriteria: string;
  /** Model prompt used for success detection. */
  verificationPrompt: string;
  /** Objects that should be visible or available for this step. */
  requiredObjects: string[];
  /** Optional spatial hint for guidance and validation. */
  spatialHint?: string;
  /** Safety checks to run during this step. */
  hazardChecks?: string[];
  /** Expected duration in seconds for timing guidance. */
  expectedDurationSec?: number;
  /** Instruments or displays to read during this step. */
  instrumentReads?: string[];
}

/** A complete protocol definition for a physical workflow. */
export interface KitchenProtocol {
  /** Stable protocol identifier. */
  id: string;
  /** Human-readable name. */
  name: string;
  /** Short explanation of the protocol's purpose. */
  description: string;
  /** Difficulty level used for ordering and UX hints. */
  difficulty: "beginner" | "intermediate" | "advanced";
  /** Estimated total time in minutes. */
  estimatedMinutes: number;
  /** Ordered list of executable steps. */
  steps: ProtocolStep[];
  /** Full inventory required before starting. */
  requiredInventory: { name: string; category: "ingredient" | "tool" | "appliance" }[];
  /** Prompt used for initial workspace verification. */
  workspaceVerificationPrompt: string;
  /** Tags for discovery and grouping. */
  tags: string[];
}

