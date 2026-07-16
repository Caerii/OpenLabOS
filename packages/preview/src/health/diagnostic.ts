export type PreviewDiagnosticStatus =
  | "ready"
  | "server_unreachable"
  | "not_streaming"
  | "waiting_for_frames"
  | "frame_unreachable";

export interface PreviewDiagnosticInput {
  healthReachable?: boolean;
  streaming?: unknown;
  frameCount?: unknown;
  frameReachable?: boolean;
  frameBytes?: number;
  healthError?: string;
  frameError?: string;
}

export interface PreviewDiagnostic {
  ready: boolean;
  status: PreviewDiagnosticStatus;
  detail: string;
}

function numeric(value: unknown) {
  const n = typeof value === "number" ? value : Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

export function previewReadyFromSignals(input: {
  frameReachable?: boolean;
  streaming?: unknown;
  frameCount?: unknown;
}) {
  return input.frameReachable === true || (input.streaming === true && numeric(input.frameCount) > 0);
}

export function previewDiagnostic(input: PreviewDiagnosticInput): PreviewDiagnostic {
  const ready = previewReadyFromSignals(input);
  if (ready) {
    return {
      ready: true,
      status: "ready",
      detail: input.frameReachable
        ? `Current frame reachable${input.frameBytes ? ` (${input.frameBytes} bytes)` : ""}.`
        : "Preview stream is reporting frames.",
    };
  }

  if (input.healthReachable === false) {
    return {
      ready: false,
      status: "server_unreachable",
      detail: `Preview server did not answer /health${input.healthError ? `: ${input.healthError}` : ""}.`,
    };
  }

  if (input.streaming !== true) {
    return {
      ready: false,
      status: "not_streaming",
      detail: "Preview server reachable but not streaming yet.",
    };
  }

  if (numeric(input.frameCount) <= 0) {
    return {
      ready: false,
      status: "waiting_for_frames",
      detail: "Preview stream started; waiting for first frames.",
    };
  }

  return {
    ready: false,
    status: "frame_unreachable",
    detail: `Preview reports frames, but /frame is not reachable${input.frameError ? `: ${input.frameError}` : ""}.`,
  };
}

export function previewPortForwardPresent(output: string, port = 8089) {
  return output
    .split(/\r?\n/)
    .some((line) => line.includes(`tcp:${port} tcp:${port}`));
}
