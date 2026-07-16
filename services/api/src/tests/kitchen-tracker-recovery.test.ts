import assert from "node:assert/strict";
import { ProtocolTracker } from "../ai/kitchen/tracker.js";

function main() {
  const tracker = new ProtocolTracker();
  const run = tracker.startRun("kitchen-tea-v1");
  assert.equal(run.status, "setup");

  tracker.forceStart();
  assert.equal(tracker.summary?.status, "running");
  assert.equal(tracker.summary?.currentStep, 1);
  assert.equal(tracker.getCurrentStepAttempt()?.attemptNumber, 1);

  const noopUndo = tracker.undoLastStep("nothing to undo");
  assert.equal(noopUndo.changed, false);
  assert.equal(tracker.summary?.currentStep, 1);
  assert.equal(tracker.summary?.stepsCompleted, 0);

  tracker.manualComplete();
  assert.equal(tracker.summary?.currentStep, 2);
  assert.equal(tracker.summary?.stepsCompleted, 1);
  const originalStepOneAttempt = run.steps[0].attemptId;

  const undo = tracker.undoLastStep("operator tapped confirm too early");
  assert.equal(undo.changed, true);
  assert.equal(tracker.summary?.currentStep, 1);
  assert.equal(tracker.summary?.stepsCompleted, 0);
  assert.equal(tracker.getCurrentStep()?.status, "active");
  assert.equal(tracker.getCurrentStepAttempt()?.attemptNumber, 2);
  assert.equal(tracker.getCurrentStepAttempt()?.supersedesAttemptId, originalStepOneAttempt);
  assert.match(tracker.getCurrentStep()?.notes.at(-1) || "", /Reopened for redo/);

  tracker.manualComplete();
  assert.equal(tracker.summary?.currentStep, 2);
  assert.equal(tracker.summary?.stepsCompleted, 1);

  console.log("[kitchen-tracker-recovery] all checks passed");
}

main();
