import {
  beforeAfterMode,
  boundingBoxMode,
  countingMode,
  handTrackingMode,
  instrumentReadMode,
  liquidLevelMode,
  objectPointingMode,
  safetyCheckMode,
  spatialInventoryMode,
  successCheckMode,
  trajectoryMode,
  workspaceClearMode,
  type ERAnalysisMode,
} from "./index.js";

export type AnalyzeRouteConfig = {
  path: string;
  build: (body: any) =>
    | { mode: ERAnalysisMode; extra?: Record<string, unknown> }
    | Promise<{ mode: ERAnalysisMode; extra?: Record<string, unknown> }>;
};

export const analyzeRouteConfigs: AnalyzeRouteConfig[] = [
  {
    path: "/analyze/spatial",
    build: (body) => {
      const { maxItems } = body || {};
      return { mode: spatialInventoryMode(maxItems || 20) };
    },
  },
  {
    path: "/analyze/objects",
    build: (body) => {
      const { objects } = body || {};
      if (!Array.isArray(objects) || objects.length === 0) {
        throw new Error("objects array is required");
      }
      return { mode: objectPointingMode(objects) };
    },
  },
  {
    path: "/analyze/boxes",
    build: (body) => {
      const { maxObjects } = body || {};
      return { mode: boundingBoxMode(maxObjects || 25) };
    },
  },
  {
    path: "/analyze/trajectory",
    build: (body) => {
      const { from, to, numPoints } = body || {};
      if (!from || !to) {
        throw new Error("from and to object names are required");
      }
      return { mode: trajectoryMode(from, to, numPoints || 10) };
    },
  },
  {
    path: "/analyze/instrument",
    build: (body) => {
      const { instrument } = body || {};
      if (!instrument) {
        throw new Error("instrument description is required");
      }
      return { mode: instrumentReadMode(instrument) };
    },
  },
  {
    path: "/analyze/liquid-level",
    build: (body) => {
      const { container, targetMl } = body || {};
      if (!container) {
        throw new Error("container description is required");
      }
      return { mode: liquidLevelMode(container, targetMl) };
    },
  },
  {
    path: "/analyze/count",
    build: (body) => {
      const { object } = body || {};
      if (!object) {
        throw new Error("object name is required");
      }
      return { mode: countingMode(object) };
    },
  },
  {
    path: "/analyze/safety",
    build: (body) => {
      const { currentActivity } = body || {};
      return { mode: safetyCheckMode(currentActivity) };
    },
  },
  {
    path: "/analyze/hands",
    build: () => ({ mode: handTrackingMode() }),
  },
  {
    path: "/analyze/workspace-clear",
    build: (body) => {
      const { needSpaceFor } = body || {};
      if (!needSpaceFor) {
        throw new Error("needSpaceFor is required");
      }
      return { mode: workspaceClearMode(needSpaceFor) };
    },
  },
  {
    path: "/analyze/success-check",
    build: (body) => {
      const { verificationPrompt } = body || {};
      if (!verificationPrompt) {
        throw new Error("verificationPrompt is required");
      }
      return { mode: successCheckMode(verificationPrompt) };
    },
  },
  {
    path: "/analyze/before-after",
    build: (body) => {
      const { taskDescription } = body || {};
      if (!taskDescription) {
        throw new Error("taskDescription is required");
      }
      return { mode: beforeAfterMode(taskDescription) };
    },
  },
];
