import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { KitchenSessionManifest } from "../src/_legacy/api";
import {
  CAPTURE_CONSENT_STORAGE_KEY,
  CaptureConsentModal,
  hasCaptureConsent,
  recordCaptureConsent,
} from "../src/_legacy/components/kitchen/guided/CaptureConsentModal";
import { DependencyStatusPanel } from "../src/_legacy/components/kitchen/guided/DependencyStatusPanel";
import { deriveJudgmentSource } from "../src/_legacy/components/kitchen/guided/JudgmentSourceBadge";
import { buildAuditTimelineFromManifest } from "../src/_legacy/components/kitchen/guided/RunAuditTimeline";

describe("guided demo smoke", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("derives mock judgment source from adherence evidence", () => {
    const source = deriveJudgmentSource({
      lastAdherence: {
        success: true,
        plan: {} as any,
        selectedChecks: [],
        evidence: [{ modeId: "mock:deterministic", checkId: "c1" }],
        decision: {} as any,
        adherence: { action: "confirming", state: "confirming", confidence: 0.5, shouldAdvance: false, shouldRecordVerification: false, reason: "", spokenSummary: "", stateMemory: {} as any },
        verification: null,
        stepAdvanced: false,
        runCompleted: false,
        currentStep: null,
      },
      supervisor: null,
      segmentation: null,
      runpodGuard: null,
    });

    expect(source.label).toBe("practice checks");
    expect(source.tone).toBe("blue");
  });

  it("records capture consent in local storage", () => {
    expect(hasCaptureConsent()).toBe(false);
    recordCaptureConsent();
    expect(window.localStorage.getItem(CAPTURE_CONSENT_STORAGE_KEY)).toBe("true");
    expect(hasCaptureConsent()).toBe(true);
  });

  it("shows the capture consent modal and confirms", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    const onClose = vi.fn();

    render(<CaptureConsentModal open onClose={onClose} onConfirm={onConfirm} />);

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/camera capture notice/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /start recording/i }));
    expect(hasCaptureConsent()).toBe(true);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("renders dependency health from readyz", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          ready: true,
          checks: {
            inference: { ok: true, detail: "mock provider" },
            perception: { ok: true, detail: "sidecar healthy" },
          },
        }),
      ),
    );

    render(<DependencyStatusPanel pollMs={60_000} />);

    await waitFor(() => {
      expect(screen.getByText("Step-check service")).toBeInTheDocument();
    });
    expect(screen.getAllByText("healthy").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/automatic checks/i)).toBeInTheDocument();
  });

  it("builds audit timeline entries from a manifest", () => {
    const manifest = {
      stepSegments: [
        {
          id: "seg-1",
          stepNumber: 1,
          source: "native-recording",
          createdAt: "2026-01-01T12:00:00.000Z",
          endedAt: 1_735_732_800_000,
          frameRefs: ["frame-1"],
          chunkRefs: [],
        },
      ],
      stepAttempts: [],
      adherence: [
        {
          ts: 1_735_732_810_000,
          stepNumber: 1,
          action: "advance",
          state: "passed",
          confidence: 0.91,
          reason: "Step complete",
        },
      ],
      frames: [],
      chunks: [],
    } as KitchenSessionManifest;

    const entries = buildAuditTimelineFromManifest(manifest);
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.some((entry) => entry.label.includes("Step 1"))).toBe(true);
  });
});
