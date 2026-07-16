import type { LabOSFeatureFlags } from "../../../config/features.js";
import type { ButtonPressEvent } from "../../sensor-bridge.js";
import type { ProtocolRun, ProtocolTracker } from "../tracker.js";
import { operatorConfirmStepOptions } from "./operator-run-service.js";

export interface KitchenButtonConfirmResult {
  handled: boolean;
  ignoredReason?: string;
  runId?: string;
  stepNumber?: number;
  completedManually?: boolean;
  timingsMs?: {
    ackDelay?: number;
    mapping?: number;
    confirm?: number;
    complete?: number;
    total?: number;
  };
  at: number;
}

export interface KitchenButtonConfirmStatus {
  enabled: boolean;
  inFlight: boolean;
  totalHandled: number;
  lastResult: KitchenButtonConfirmResult | null;
}

export interface KitchenButtonConfirmRunService {
  confirmStep(body?: Record<string, unknown>): Promise<{ validation?: any; currentStep?: unknown }>;
  completeStep(): Promise<unknown>;
}

export interface KitchenButtonConfirmServicePorts {
  tracker: ProtocolTracker;
  runService: KitchenButtonConfirmRunService;
  featureFlags: () => LabOSFeatureFlags;
  getButtonMappings: () => Promise<Record<string, string>>;
  playCue?: (cue: "step_start" | "verify_success" | "verify_fail") => Promise<unknown>;
  now?: () => number;
}

const BUTTON_CONFIRM_ACTION = "protocol_confirm_step";

function buttonMappingKey(event: Pick<ButtonPressEvent, "buttonId" | "isLongPress">) {
  return `${event.buttonId}_${event.isLongPress ? "long" : "short"}`;
}

function activeRunningRun(tracker: ProtocolTracker): ProtocolRun | null {
  const run = tracker.getCurrentRun();
  return run?.status === "running" ? run : null;
}

function operatorConfirmStepBody(flags: LabOSFeatureFlags) {
  return {
    ...operatorConfirmStepOptions(flags),
    notes: ["confirmed by glasses button"],
  };
}

export class KitchenButtonConfirmService {
  private inFlight = false;
  private lastHandledAt = 0;
  private totalHandled = 0;
  private lastResult: KitchenButtonConfirmResult | null = null;

  constructor(
    private readonly ports: KitchenButtonConfirmServicePorts,
    private readonly debounceMs = 1200,
  ) {}

  status(): KitchenButtonConfirmStatus {
    return {
      enabled: this.ports.featureFlags().buttonConfirmEnabled,
      inFlight: this.inFlight,
      totalHandled: this.totalHandled,
      lastResult: this.lastResult,
    };
  }

  private playCue(cue: "step_start" | "verify_success" | "verify_fail") {
    void this.ports.playCue?.(cue).catch(() => {});
  }

  async handleButtonPress(event: ButtonPressEvent): Promise<KitchenButtonConfirmResult> {
    const at = this.ports.now?.() ?? Date.now();
    const startedAt = Date.now();
    const flags = this.ports.featureFlags();
    const ignored = (ignoredReason: string, audible = false): KitchenButtonConfirmResult => {
      const result = { handled: false, ignoredReason, at };
      this.lastResult = result;
      if (audible) this.playCue("verify_fail");
      return result;
    };

    if (!flags.buttonConfirmEnabled) return ignored("feature_disabled");
    if (event.isLongPress) return ignored("long_press_ignored");

    const mappingKey = buttonMappingKey(event);
    if (this.inFlight) return ignored("confirm_in_flight");
    if (at - this.lastHandledAt < this.debounceMs) return ignored("debounced");

    const run = activeRunningRun(this.ports.tracker);
    const step = this.ports.tracker.getCurrentStep();
    if (!run || !step) return ignored("no_active_running_step", true);

    this.inFlight = true;
    this.lastHandledAt = at;
    const ackAt = Date.now();
    this.playCue("step_start");
    try {
      const mappingStartedAt = Date.now();
      const mappings = await this.ports.getButtonMappings().catch((): Record<string, string> => ({}));
      const mappingMs = Date.now() - mappingStartedAt;
      if (mappings[mappingKey] !== BUTTON_CONFIRM_ACTION) {
        const result = {
          handled: false,
          ignoredReason: "button_not_mapped_to_confirm_step",
          runId: run.id,
          stepNumber: step.step.number,
          timingsMs: {
            ackDelay: ackAt - startedAt,
            mapping: mappingMs,
            total: Date.now() - startedAt,
          },
          at,
        };
        this.lastResult = result;
        this.playCue("verify_fail");
        return result;
      }

      const confirmStartedAt = Date.now();
      const confirm = await this.ports.runService.confirmStep(operatorConfirmStepBody(flags));
      const confirmMs = Date.now() - confirmStartedAt;
      let completedManually = false;
      let completeMs = 0;
      if (flags.protocolMode === "manual" && !confirm.validation?.stepAdvanced) {
        const completeStartedAt = Date.now();
        await this.ports.runService.completeStep();
        completeMs = Date.now() - completeStartedAt;
        completedManually = true;
      }
      this.totalHandled++;
      const result = {
        handled: true,
        runId: run.id,
        stepNumber: step.step.number,
        completedManually,
        timingsMs: {
          ackDelay: ackAt - startedAt,
          mapping: mappingMs,
          confirm: confirmMs,
          complete: completeMs,
          total: Date.now() - startedAt,
        },
        at,
      };
      this.lastResult = result;
      this.playCue("verify_success");
      return result;
    } catch (error) {
      this.playCue("verify_fail");
      const message = error instanceof Error ? error.message : String(error);
      if (/Native recording is not active/i.test(message)) {
        const result = {
          handled: false,
          ignoredReason: "native_recording_inactive",
          runId: run.id,
          stepNumber: step.step.number,
          timingsMs: {
            ackDelay: ackAt - startedAt,
            total: Date.now() - startedAt,
          },
          at,
        };
        this.lastResult = result;
        return result;
      }
      throw error;
    } finally {
      this.inFlight = false;
    }
  }
}

export { BUTTON_CONFIRM_ACTION };
