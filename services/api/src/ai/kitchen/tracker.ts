/**
 * Kitchen Protocol Progression Tracker — State machine for recipe runs.
 *
 * Tracks:
 * - Which recipe is active
 * - Current step number and progression history
 * - Step verification results (ER success checks)
 * - Timing per step and overall run duration
 * - Captured frame references for before/after comparison
 *
 * The tracker is designed to work with the ER analysis modes:
 * - Before each step: captures a "before" frame reference
 * - During each step: runs continuous analysis (safety, hand tracking)
 * - After each step: runs success verification to decide if step is complete
 */

import { type KitchenProtocol, type ProtocolStep, getProtocol } from "./protocols.js";

/** Minimum ER confidence (0–1) required to auto-advance after a passing `success` (matches verify-step API `stepAdvanced`). */
export const KITCHEN_VERIFY_ADVANCE_MIN_CONFIDENCE = 0.6;

// ── Types ───────────────────────────────────────────────

export type StepStatus = "pending" | "active" | "verifying" | "completed" | "failed" | "skipped";
export type RunStatus = "idle" | "setup" | "running" | "paused" | "completed" | "aborted";

/** Result of a step verification attempt */
export interface VerificationResult {
  timestamp: number;
  success: boolean;
  confidence: number;
  reasoning: string;
  rawResponse: any;
  /** Frame buffer reference at verification time */
  frameRef?: string;
}

/** State of a single step within a run */
export interface StepState {
  step: ProtocolStep;
  status: StepStatus;
  /** Current human redo attempt for this step. Starts at 1 and increments when a completed step is reopened. */
  attemptNumber: number;
  /** Stable join key for current evidence captured for this step attempt. */
  attemptId: string;
  /** Previous attempt superseded by the current redo attempt, when applicable. */
  supersedesAttemptId?: string;
  startedAt?: number;
  completedAt?: number;
  /** Elapsed time in ms while step was active */
  elapsedMs: number;
  /** All verification attempts (may retry) */
  verifications: VerificationResult[];
  /** The "before" frame captured when step became active */
  beforeFrameRef?: string;
  /** Notes or errors during this step */
  notes: string[];
}

/** A complete protocol run */
export interface ProtocolRun {
  /** Unique run ID */
  id: string;
  /** Protocol being run */
  protocolId: string;
  protocolName: string;
  /** Run state */
  status: RunStatus;
  /** When the run was created */
  createdAt: number;
  /** When the run actually started (after workspace verification) */
  startedAt?: number;
  /** When the run ended (completed, aborted, or all steps done) */
  endedAt?: number;
  /** Current step index (0-based) */
  currentStepIndex: number;
  /** State for each step */
  steps: StepState[];
  /** Workspace verification result (before starting) */
  workspaceCheck?: {
    passed: boolean;
    missingItems: string[];
    detectedItems: string[];
    timestamp: number;
  };
  /** Overall metrics */
  metrics: {
    stepsCompleted: number;
    stepsFailed: number;
    stepsSkipped: number;
    totalVerificationAttempts: number;
    avgConfidence: number;
    totalElapsedMs: number;
  };
}

/** Serializable run summary (for API responses) */
export interface RunSummary {
  id: string;
  protocolId: string;
  protocolName: string;
  status: RunStatus;
  currentStep: number;
  totalSteps: number;
  stepsCompleted: number;
  startedAt?: number;
  endedAt?: number;
  elapsedMs: number;
}

export interface StepAttemptRef {
  stepNumber: number;
  attemptNumber: number;
  attemptId: string;
  supersedesAttemptId?: string;
}

export interface UndoStepResult {
  changed: boolean;
  fromStepNumber?: number;
  toStepNumber?: number;
  attempt?: StepAttemptRef;
}

export function stepAttemptId(runId: string, stepNumber: number, attemptNumber: number): string {
  return `${runId}-step${stepNumber}-attempt${attemptNumber}`;
}

// ── Protocol Tracker ────────────────────────────────────

/**
 * Manages the lifecycle of kitchen protocol runs.
 * One run can be active at a time per tracker instance.
 */
export class ProtocolTracker {
  private currentRun: ProtocolRun | null = null;
  private runHistory: ProtocolRun[] = [];

  private rememberRun(run: ProtocolRun) {
    if (!this.runHistory.some((candidate) => candidate.id === run.id)) {
      this.runHistory.push(run);
    }
  }

  // ── Run Lifecycle ───────────────────────────────

  /** Start a new protocol run. Returns the run ID. */
  startRun(protocolId: string): ProtocolRun {
    const protocol = getProtocol(protocolId);
    if (!protocol) {
      throw new Error(`Protocol "${protocolId}" not found`);
    }

    // Abort any existing live run. Terminal runs stay reviewable until a new
    // run replaces them, so manifests can be saved after completion/abort.
    if (this.currentRun && this.currentRun.status === "running") {
      this.abortRun("New run started");
    }

    const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const run: ProtocolRun = {
      id: runId,
      protocolId: protocol.id,
      protocolName: protocol.name,
      status: "setup",
      createdAt: Date.now(),
      currentStepIndex: 0,
      steps: protocol.steps.map((step) => ({
        step,
        status: "pending",
        attemptNumber: 1,
        attemptId: stepAttemptId(runId, step.number, 1),
        elapsedMs: 0,
        verifications: [],
        notes: [],
      })),
      metrics: {
        stepsCompleted: 0,
        stepsFailed: 0,
        stepsSkipped: 0,
        totalVerificationAttempts: 0,
        avgConfidence: 0,
        totalElapsedMs: 0,
      },
    };

    this.currentRun = run;
    return run;
  }

  /** Mark workspace verification as done. Transitions from "setup" to "running". */
  completeWorkspaceCheck(result: {
    passed: boolean;
    missingItems: string[];
    detectedItems: string[];
  }): void {
    if (!this.currentRun) throw new Error("No active run");
    if (this.currentRun.status !== "setup") throw new Error("Run not in setup phase");

    this.currentRun.workspaceCheck = {
      ...result,
      timestamp: Date.now(),
    };

    if (result.passed) {
      this.currentRun.status = "running";
      this.currentRun.startedAt = Date.now();
      // Activate the first step
      this.currentRun.steps[0].status = "active";
      this.currentRun.steps[0].startedAt = Date.now();
    }
  }

  /** Force-start the run even if workspace check hasn't passed */
  forceStart(): void {
    if (!this.currentRun) throw new Error("No active run");
    this.currentRun.status = "running";
    this.currentRun.startedAt = Date.now();
    this.currentRun.steps[0].status = "active";
    this.currentRun.steps[0].startedAt = Date.now();
  }

  /** Pause the current run */
  pauseRun(): void {
    if (!this.currentRun || this.currentRun.status !== "running") return;
    this.currentRun.status = "paused";
    this.updateStepElapsed();
  }

  /** Resume a paused run */
  resumeRun(): void {
    if (!this.currentRun || this.currentRun.status !== "paused") return;
    this.currentRun.status = "running";
    // Re-mark current step start for timing
    const step = this.currentRun.steps[this.currentRun.currentStepIndex];
    if (step.status === "active") {
      step.startedAt = Date.now();
    }
  }

  /** Abort the current run with an optional reason */
  abortRun(reason?: string): void {
    if (!this.currentRun) return;
    this.updateStepElapsed();
    this.currentRun.status = "aborted";
    this.currentRun.endedAt = Date.now();

    const step = this.currentRun.steps[this.currentRun.currentStepIndex];
    if (step.status === "active" || step.status === "verifying") {
      step.notes.push(`Aborted: ${reason || "user request"}`);
    }

    this.rememberRun(this.currentRun);
  }

  // ── Step Progression ────────────────────────────

  /**
   * Record a step verification result.
   * Advances to the next step only when `success && confidence >= KITCHEN_VERIFY_ADVANCE_MIN_CONFIDENCE`.
   * Intentional bypasses: `skipStep()` and `manualComplete()` (UI: Skip / Override).
   */
  recordVerification(result: VerificationResult): void {
    if (!this.currentRun || this.currentRun.status !== "running") {
      throw new Error("No active running protocol");
    }

    const step = this.currentRun.steps[this.currentRun.currentStepIndex];
    step.status = "verifying";
    step.verifications.push(result);
    this.currentRun.metrics.totalVerificationAttempts++;

    // Update average confidence
    const allConfs = this.currentRun.steps
      .flatMap((s) => s.verifications)
      .map((v) => v.confidence);
    this.currentRun.metrics.avgConfidence =
      allConfs.reduce((a, b) => a + b, 0) / allConfs.length;

    if (result.success && result.confidence >= KITCHEN_VERIFY_ADVANCE_MIN_CONFIDENCE) {
      this.advanceStep();
    } else {
      // Stay on current step — not verified yet
      step.status = "active";
    }
  }

  /** Manually advance to the next step (skip current if not completed) */
  skipStep(): void {
    if (!this.currentRun || this.currentRun.status !== "running") return;

    const step = this.currentRun.steps[this.currentRun.currentStepIndex];
    step.status = "skipped";
    step.notes.push("Manually skipped by user");
    this.currentRun.metrics.stepsSkipped++;

    this.moveToNextStep();
  }

  /** Manually mark current step as completed (bypasses ER verification). */
  manualComplete(): void {
    if (!this.currentRun || this.currentRun.status !== "running") return;
    this.advanceStep();
  }

  /** Reopen the previous completed/skipped step so an accidental confirm can be redone. */
  undoLastStep(reason?: string): UndoStepResult {
    if (!this.currentRun || this.currentRun.status !== "running") return { changed: false };
    if (this.currentRun.currentStepIndex <= 0) return { changed: false };

    const currentStep = this.currentRun.steps[this.currentRun.currentStepIndex];
    const fromStepNumber = currentStep.step.number;
    if (currentStep.status === "active") {
      this.updateStepElapsed();
      currentStep.status = "pending";
      currentStep.startedAt = undefined;
      currentStep.notes.push(`Returned to previous step: ${reason || "operator redo"}`);
    }

    const previousStep = this.currentRun.steps[this.currentRun.currentStepIndex - 1];
    if (previousStep.status === "completed" && this.currentRun.metrics.stepsCompleted > 0) {
      this.currentRun.metrics.stepsCompleted--;
    }
    if (previousStep.status === "skipped" && this.currentRun.metrics.stepsSkipped > 0) {
      this.currentRun.metrics.stepsSkipped--;
    }

    this.currentRun.currentStepIndex -= 1;
    const previousAttemptId = previousStep.attemptId;
    previousStep.status = "active";
    previousStep.completedAt = undefined;
    previousStep.attemptNumber += 1;
    previousStep.supersedesAttemptId = previousAttemptId;
    previousStep.attemptId = stepAttemptId(this.currentRun.id, previousStep.step.number, previousStep.attemptNumber);
    previousStep.startedAt = Date.now();
    previousStep.notes.push(`Reopened for redo: ${reason || "operator redo"}`);
    return {
      changed: true,
      fromStepNumber,
      toStepNumber: previousStep.step.number,
      attempt: this.getCurrentStepAttempt() ?? undefined,
    };
  }

  /** Set the "before" frame reference for the current step */
  setBeforeFrame(frameRef: string): void {
    if (!this.currentRun) return;
    const step = this.currentRun.steps[this.currentRun.currentStepIndex];
    if (!step.beforeFrameRef) {
      step.beforeFrameRef = frameRef;
    }
  }

  // ── Internal Helpers ────────────────────────────

  private advanceStep(): void {
    if (!this.currentRun) return;
    const step = this.currentRun.steps[this.currentRun.currentStepIndex];
    this.updateStepElapsed();
    step.status = "completed";
    step.completedAt = Date.now();
    this.currentRun.metrics.stepsCompleted++;

    this.moveToNextStep();
  }

  private moveToNextStep(): void {
    if (!this.currentRun) return;
    const nextIndex = this.currentRun.currentStepIndex + 1;

    if (nextIndex >= this.currentRun.steps.length) {
      // All steps done
      this.currentRun.status = "completed";
      this.currentRun.endedAt = Date.now();
      this.currentRun.metrics.totalElapsedMs =
        (this.currentRun.endedAt) - (this.currentRun.startedAt || this.currentRun.createdAt);
      this.rememberRun(this.currentRun);
    } else {
      this.currentRun.currentStepIndex = nextIndex;
      this.currentRun.steps[nextIndex].status = "active";
      this.currentRun.steps[nextIndex].startedAt = Date.now();
    }
  }

  private updateStepElapsed(): void {
    if (!this.currentRun) return;
    const step = this.currentRun.steps[this.currentRun.currentStepIndex];
    if (step.startedAt && step.status === "active") {
      step.elapsedMs += Date.now() - step.startedAt;
    }
  }

  // ── Queries ─────────────────────────────────────

  /** Get the current run state (null if idle) */
  getCurrentRun(): ProtocolRun | null {
    return this.currentRun;
  }

  /** Get the current step being worked on */
  getCurrentStep(): StepState | null {
    if (!this.currentRun) return null;
    return this.currentRun.steps[this.currentRun.currentStepIndex] ?? null;
  }

  getStepAttempt(step: StepState, run = this.currentRun): StepAttemptRef | null {
    if (!run) return null;
    return {
      stepNumber: step.step.number,
      attemptNumber: step.attemptNumber,
      attemptId: step.attemptId,
      supersedesAttemptId: step.supersedesAttemptId,
    };
  }

  getCurrentStepAttempt(): StepAttemptRef | null {
    const step = this.getCurrentStep();
    if (!step) return null;
    return this.getStepAttempt(step);
  }

  /** Get the protocol definition for the current run */
  getCurrentProtocol(): KitchenProtocol | null {
    if (!this.currentRun) return null;
    return getProtocol(this.currentRun.protocolId) ?? null;
  }

  /** Get run history */
  getHistory(): RunSummary[] {
    return this.runHistory.map(runToSummary);
  }

  /** Get a specific run by ID (current or historical) */
  getRun(id: string): ProtocolRun | null {
    if (this.currentRun?.id === id) return this.currentRun;
    return this.runHistory.find((r) => r.id === id) ?? null;
  }

  /** Check if a run is active */
  get isActive(): boolean {
    return this.currentRun !== null && this.currentRun.status === "running";
  }

  /** Get a brief status summary */
  get summary(): RunSummary | null {
    if (!this.currentRun) return null;
    return runToSummary(this.currentRun);
  }
}

// ── Helpers ─────────────────────────────────────────────

function runToSummary(run: ProtocolRun): RunSummary {
  const elapsed = run.endedAt
    ? run.endedAt - (run.startedAt || run.createdAt)
    : run.startedAt
      ? Date.now() - run.startedAt
      : 0;

  return {
    id: run.id,
    protocolId: run.protocolId,
    protocolName: run.protocolName,
    status: run.status,
    currentStep: run.currentStepIndex + 1,
    totalSteps: run.steps.length,
    stepsCompleted: run.metrics.stepsCompleted,
    startedAt: run.startedAt,
    endedAt: run.endedAt,
    elapsedMs: elapsed,
  };
}

// ── Singleton Instance ──────────────────────────────────

export const protocolTracker = new ProtocolTracker();
