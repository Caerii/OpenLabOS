import type { LabOSFeatureFlags } from "../../../config/features.js";

export type OperatorReadinessState = "ready" | "warn" | "blocked";

export type OperatorReadinessAction =
  | "connect_glasses"
  | "launch_labos"
  | "start_preview"
  | "set_button_confirm"
  | "reconnect_button"
  | "none";

export type OperatorReadinessCheckId =
  | "glasses"
  | "labos"
  | "preview"
  | "recording"
  | "button-confirm"
  | "voice-perception";

export interface OperatorReadinessCheck {
  id: OperatorReadinessCheckId;
  label: string;
  detail: string;
  state: OperatorReadinessState;
  blocking: boolean;
  recoveryAction: OperatorReadinessAction;
}

export interface BuildOperatorReadinessInput {
  connected: boolean;
  labosInstalled?: boolean;
  labosRunning?: boolean;
  previewReachable?: boolean;
  previewStreaming?: boolean;
  previewFrameCount?: number;
  previewFrameBytes?: number;
  previewFps?: number;
  previewDetail?: string;
  previewStatus?: string;
  recordingActive?: boolean;
  activeVideoPath?: string;
  buttonConfirmEnabled?: boolean;
  buttonMapped?: boolean;
  buttonStreamConnected?: boolean;
  buttonMappingValue?: string | null;
  voicePerceptionEnabled?: boolean;
  voiceReady?: boolean;
  perceptionReady?: boolean;
  featureFlags?: LabOSFeatureFlags | null;
}

export interface OperatorReadiness {
  generatedAt: number;
  ready: boolean;
  checks: OperatorReadinessCheck[];
  blockers: OperatorReadinessCheck[];
  summary: {
    glassesConnected: boolean;
    labosReady: boolean;
    previewReady: boolean;
    recordingActive: boolean;
    buttonConfirmReady: boolean;
    operatorMode: LabOSFeatureFlags["protocolMode"] | "unknown";
  };
}

function readyCheck(
  id: OperatorReadinessCheckId,
  label: string,
  detail: string,
): OperatorReadinessCheck {
  return { id, label, detail, state: "ready", blocking: false, recoveryAction: "none" };
}

function blockedCheck(
  id: OperatorReadinessCheckId,
  label: string,
  detail: string,
  recoveryAction: OperatorReadinessAction,
): OperatorReadinessCheck {
  return { id, label, detail, state: "blocked", blocking: true, recoveryAction };
}

function warnCheck(
  id: OperatorReadinessCheckId,
  label: string,
  detail: string,
  recoveryAction: OperatorReadinessAction = "none",
): OperatorReadinessCheck {
  return { id, label, detail, state: "warn", blocking: false, recoveryAction };
}

export function buildOperatorReadiness(input: BuildOperatorReadinessInput): OperatorReadiness {
  const previewReady = input.previewReachable === true
    || (input.previewStreaming === true && Number(input.previewFrameCount || 0) > 0);
  const labosReady = input.labosInstalled === true && input.labosRunning === true;
  const buttonEnabled = input.buttonConfirmEnabled !== false;
  const buttonConfirmReady = !buttonEnabled
    || input.buttonStreamConnected === true;
  const checks: OperatorReadinessCheck[] = [];

  checks.push(input.connected
    ? readyCheck(
        "glasses",
        "Glasses connected",
        "ADB is connected. Keep the glasses awake and pointed at the workspace.",
      )
    : blockedCheck(
        "glasses",
        "Glasses connected",
        "Connect the glasses before starting the guided flow.",
        "connect_glasses",
      ));

  checks.push(labosReady
    ? readyCheck("labos", "LabOS app running", "The on-device LabOS app is installed and running.")
    : blockedCheck(
        "labos",
        "LabOS app running",
        input.labosInstalled
          ? "The app is installed but not currently running."
          : "The LabOS app is not installed or status is unavailable.",
        "launch_labos",
      ));

  checks.push(previewReady
    ? readyCheck(
        "preview",
        "Live preview frames",
        `Current frame reachable${input.previewFrameBytes ? ` (${input.previewFrameBytes} bytes)` : ""}; health reports ${Number(input.previewFps || 0).toFixed(1)} fps.`,
      )
    : blockedCheck(
        "preview",
        "Live preview frames",
        input.previewDetail || "Start the camera preview so step evidence can capture current frames.",
        "start_preview",
      ));

  checks.push(input.recordingActive
    ? readyCheck(
        "recording",
        "Native session recording",
        `Recording is active${input.activeVideoPath ? `: ${input.activeVideoPath}` : "."}`,
      )
    : readyCheck(
        "recording",
        "Native session recording",
        "Ready. Start Protocol will start native recording, then each confirmed step saves its own segment.",
      ));

  if (buttonEnabled) {
    checks.push(buttonConfirmReady
      ? readyCheck(
          "button-confirm",
          "Glasses button confirms steps",
          input.buttonMapped === true
            ? "Short-press the camera button after each step. The run will save evidence and advance."
            : "Button stream is connected. Start Protocol will arm camera short-press for this run, then restore the normal button action afterwards.",
        )
      : blockedCheck(
          "button-confirm",
          "Glasses button confirms steps",
          input.buttonMapped === true
            ? "Camera short-press is mapped, but LabOS could not connect to the button event stream automatically."
            : "LabOS could not connect to the button event stream automatically. Start Protocol will arm the mapping once the stream is connected.",
          "reconnect_button",
        ));
  }

  if (input.voicePerceptionEnabled) {
    const voicePerceptionReady = input.voiceReady === true && input.perceptionReady === true;
    checks.push(voicePerceptionReady
      ? readyCheck("voice-perception", "Voice and perception stack", "Realtime voice and perception services are ready.")
      : warnCheck(
          "voice-perception",
          "Voice and perception stack",
          "Realtime services are not fully ready. The default operator demo can still run without them.",
        ));
  }

  const blockers = checks.filter((check) => check.blocking);
  return {
    generatedAt: Date.now(),
    ready: blockers.length === 0,
    checks,
    blockers,
    summary: {
      glassesConnected: input.connected,
      labosReady,
      previewReady,
      recordingActive: input.recordingActive === true,
      buttonConfirmReady,
      operatorMode: input.featureFlags?.protocolMode || "unknown",
    },
  };
}
