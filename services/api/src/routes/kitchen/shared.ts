/**
 * Compatibility barrel for Kitchen route helpers.
 *
 * New route utility code should live in a focused sibling module rather than
 * growing this file. Existing route imports can continue using `shared.ts`.
 */

export { toClosedWorldStepId } from "../../ai/kitchen/step-ids.js";
export * from "./access.js";
export * from "./events.js";
export * from "./frame-input.js";
export * from "./live-coach-context.js";
export * from "./mutations.js";
export * from "./teacher-judgment.js";
