import { describe, expect, it } from "vitest";
import {
  OPERATE_BASE,
  defaultTabForFeatures,
  hrefForSidebarNavId,
  isTabVisibleForFeatures,
  navGroupsForFeatures,
  pathForTab,
  tabFromPathSegment,
} from "../src/_legacy/navPaths";
import type { LabOSFeatureFlags } from "../src/_legacy/api";

const simpleFlags: LabOSFeatureFlags = {
  protocolMode: "manual",
  stepSegmentsEnabled: true,
  captureStepChunksEnabled: false,
  confirmStepValidationEnabled: false,
  asyncStepAnalysisEnabled: false,
  buttonConfirmEnabled: true,
  realtimeSupervisorEnabled: false,
  handsFreeEnabled: false,
  fullAnnotationEnabled: false,
  liveVqaEnabled: false,
  postRunVqaEnabled: false,
  rollingEvidenceEnabled: false,
  adaptivePreviewEnabled: false,
  previewDuringRecordingDefault: false,
};

const realtimeFlags: LabOSFeatureFlags = {
  ...simpleFlags,
  protocolMode: "post_step_async",
  confirmStepValidationEnabled: true,
  realtimeSupervisorEnabled: true,
  handsFreeEnabled: true,
};

describe("operator routing", () => {
  it("maps kitchen segment to tab and operate path", () => {
    expect(tabFromPathSegment("kitchen")).toBe("kitchen");
    expect(pathForTab("kitchen")).toBe(`${OPERATE_BASE}/kitchen`);
    expect(hrefForSidebarNavId("kitchen")).toBe(`${OPERATE_BASE}/kitchen`);
  });

  it("maps camera segment to preview tab", () => {
    expect(tabFromPathSegment("camera")).toBe("preview");
    expect(pathForTab("preview")).toBe(`${OPERATE_BASE}/camera`);
  });

  it("defaults operator mode to kitchen", () => {
    expect(defaultTabForFeatures(simpleFlags)).toBe("kitchen");
    expect(defaultTabForFeatures(realtimeFlags)).toBe("dashboard");
  });

  it("shows operator nav tabs for simple flags", () => {
    const ids = navGroupsForFeatures(simpleFlags).flatMap((group) => group.items.map((item) => item.id));
    expect(ids).toEqual(["kitchen", "preview", "files"]);
    expect(isTabVisibleForFeatures("kitchen", simpleFlags)).toBe(true);
    expect(isTabVisibleForFeatures("dashboard", simpleFlags)).toBe(false);
  });
});
