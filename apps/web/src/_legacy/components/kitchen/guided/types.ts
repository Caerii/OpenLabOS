import type { KitchenRunAdherenceResult } from "../../../api";

export type DemoReadiness = "ready" | "warn" | "blocked" | "checking";

export type CheckItem = {
  id: string;
  label: string;
  detail: string;
  state: DemoReadiness;
  action?: { label: string; onClick: () => void; loading?: boolean };
};

export type OperatorAction = {
  label: string;
  detail: string;
  disabled?: boolean;
  loading?: boolean;
  onClick?: () => void;
};

export type OperatorSecondaryAction = OperatorAction & {
  key: "stop-realtime" | "redo-previous-step" | "stop-run";
  variant: "secondary" | "ghost";
};

export type CoachAutoCue = {
  key: string;
  trigger: "run_started" | "step_started" | "step_passed" | "low_confidence_or_occluded" | "possible_deviation" | "run_completed";
  stepNumber?: number | null;
};

export type AdherenceDecision = KitchenRunAdherenceResult["adherence"];
