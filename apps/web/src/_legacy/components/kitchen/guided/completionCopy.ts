import type { KitchenRunSummary } from "../../../api";

export function terminalRunStatusLabel(run: KitchenRunSummary | null) {
  if (run?.status === "aborted") return "Run stopped";
  if (run?.status === "completed") return "Run complete";
  return "Run review";
}

export function terminalRunOperatorMessage(run: KitchenRunSummary | null, savedManifestRef = "") {
  const partial = run?.status === "aborted";
  if (savedManifestRef) {
    return partial
      ? "Partial evidence is saved. Review this run or start another attempt from step 1."
      : "Evidence is saved. Review this run or start another attempt from step 1.";
  }
  return partial
    ? "Run stopped. Save the partial evidence package before starting another attempt."
    : "Run complete. Save the evidence package so this attempt appears in the run library.";
}
