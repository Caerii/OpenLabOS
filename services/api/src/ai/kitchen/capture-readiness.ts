import type { KitchenStepAnalysisRecord } from "./step-analysis-types.js";

export type KitchenCaptureReadinessGrade =
  | "not_ready"
  | "simple_demo_ready"
  | "analysis_ready"
  | "partner_ready";

export interface KitchenCaptureReadinessCheck {
  id: string;
  label: string;
  status: "pass" | "warn" | "fail";
  detail: string;
  requiredFor: "simple_demo" | "analysis_demo" | "partner_demo";
}

export interface KitchenCaptureReadiness {
  schemaVersion: "labos.kitchen.capture-readiness.v2";
  grade: KitchenCaptureReadinessGrade;
  label: string;
  summary: string;
  checks: KitchenCaptureReadinessCheck[];
}

export interface BuildCaptureReadinessInput {
  run: {
    status?: string;
    metrics?: unknown;
  };
  steps: unknown[];
  stepSegments: unknown[];
  frames: unknown[];
  chunks: unknown[];
  stepAnalyses: KitchenStepAnalysisRecord[];
}

function nativeVideoPathsForSegment(segment: any) {
  const nativeRecording = segment?.nativeRecording;
  if (!nativeRecording || typeof nativeRecording !== "object") return [];
  return [
    nativeRecording.lastVideoPath,
    nativeRecording.healthLastVideoPath,
    nativeRecording.activeVideoPath,
    nativeRecording.healthActiveVideoPath,
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);
}

function isLabOSNativeVideoPath(videoPath: string) {
  const normalized = videoPath.replace(/^\/storage\/emulated\/0\/LabOS\/media\//, "/sdcard/LabOS/media/");
  return normalized.startsWith("/sdcard/LabOS/media/");
}

function nativeVideoLinkedStepCount(stepSegments: unknown[]) {
  const stepNumbers = new Set<number>();
  for (const segment of stepSegments as any[]) {
    const stepNumber = Number(segment?.stepNumber);
    if (!Number.isFinite(stepNumber) || stepNumber <= 0) continue;
    if (!nativeVideoPathsForSegment(segment).some(isLabOSNativeVideoPath)) continue;
    stepNumbers.add(stepNumber);
  }
  return stepNumbers.size;
}

function numericMetric(metrics: unknown, key: string) {
  const value = typeof metrics === "object" && metrics ? (metrics as Record<string, unknown>)[key] : undefined;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function check(
  id: string,
  label: string,
  passed: boolean,
  detail: string,
  requiredFor: KitchenCaptureReadinessCheck["requiredFor"],
  warn = false,
): KitchenCaptureReadinessCheck {
  return {
    id,
    label,
    status: passed ? "pass" : warn ? "warn" : "fail",
    detail,
    requiredFor,
  };
}

function labelForGrade(grade: KitchenCaptureReadinessGrade) {
  switch (grade) {
    case "partner_ready":
      return "Partner demo ready";
    case "analysis_ready":
      return "Analysis demo ready";
    case "simple_demo_ready":
      return "Simple demo ready";
    default:
      return "Needs more evidence";
  }
}

export function buildKitchenCaptureReadiness({
  run,
  steps,
  stepSegments,
  frames,
  chunks,
  stepAnalyses,
}: BuildCaptureReadinessInput): KitchenCaptureReadiness {
  const totalSteps = Math.max(0, steps.length);
  const completedSteps = numericMetric(run.metrics, "stepsCompleted");
  const completedAnalyses = stepAnalyses.filter((analysis) => analysis.status === "completed").length;
  const passingAnalyses = stepAnalyses.filter((analysis) => analysis.status === "completed" && analysis.performedCorrectly === true).length;
  const nativeVideoStepCount = nativeVideoLinkedStepCount(stepSegments);

  const checks = [
    check(
      "run_completed",
      "Run completed",
      run.status === "completed" && totalSteps > 0 && completedSteps >= totalSteps,
      `${completedSteps}/${totalSteps || 0} steps completed`,
      "simple_demo",
    ),
    check(
      "step_segments",
      "Step boundaries saved",
      totalSteps > 0 && stepSegments.length >= totalSteps,
      `${stepSegments.length}/${totalSteps || 0} step segments saved`,
      "simple_demo",
    ),
    check(
      "snapshots",
      "Per-step snapshots saved",
      totalSteps > 0 && frames.length >= totalSteps,
      `${frames.length}/${totalSteps || 0} saved snapshots indexed`,
      "simple_demo",
    ),
    check(
      "native_videos",
      "Native videos linked",
      totalSteps > 0 && nativeVideoStepCount >= totalSteps,
      `${nativeVideoStepCount}/${totalSteps || 0} steps have native recording links`,
      "simple_demo",
    ),
    check(
      "async_analysis",
      "Async VLM analysis completed",
      totalSteps > 0 && completedAnalyses >= totalSteps,
      `${completedAnalyses}/${totalSteps || 0} step analyses completed`,
      "analysis_demo",
      completedAnalyses > 0,
    ),
    check(
      "analysis_passed",
      "Analysis says steps passed",
      totalSteps > 0 && passingAnalyses >= totalSteps,
      `${passingAnalyses}/${totalSteps || 0} analyses marked correct`,
      "analysis_demo",
      passingAnalyses > 0,
    ),
    check(
      "temporal_chunks",
      "Temporal clips indexed",
      chunks.length >= Math.max(1, totalSteps - 2),
      `${chunks.length} temporal clip${chunks.length === 1 ? "" : "s"} indexed`,
      "partner_demo",
      chunks.length > 0,
    ),
  ];

  const simpleReady = checks
    .filter((item) => item.requiredFor === "simple_demo")
    .every((item) => item.status === "pass");
  const analysisReady = simpleReady && checks
    .filter((item) => item.requiredFor === "analysis_demo")
    .every((item) => item.status === "pass");
  const partnerReady = analysisReady && checks
    .filter((item) => item.requiredFor === "partner_demo")
    .every((item) => item.status === "pass");

  const grade: KitchenCaptureReadinessGrade = partnerReady
    ? "partner_ready"
    : analysisReady
      ? "analysis_ready"
      : simpleReady
        ? "simple_demo_ready"
        : "not_ready";

  const nextFailure = checks.find((item) => item.status === "fail");
  return {
    schemaVersion: "labos.kitchen.capture-readiness.v2",
    grade,
    label: labelForGrade(grade),
    summary: nextFailure
      ? `${labelForGrade(grade)}. Next missing item: ${nextFailure.label.toLowerCase()} (${nextFailure.detail}).`
      : `${labelForGrade(grade)}. The saved package has the expected evidence for this tier.`,
    checks,
  };
}

export function ensureKitchenCaptureReadiness(manifest: any) {
  if (!manifest?.run || !Array.isArray(manifest?.steps)) return manifest;
  const stepAnalyses = Array.isArray(manifest.stepAnalyses) ? manifest.stepAnalyses : [];
  const readiness = buildKitchenCaptureReadiness({
    run: manifest.run,
    steps: manifest.steps,
    stepSegments: Array.isArray(manifest.stepSegments) ? manifest.stepSegments : [],
    frames: Array.isArray(manifest.frames) ? manifest.frames : [],
    chunks: Array.isArray(manifest.chunks) ? manifest.chunks : [],
    stepAnalyses,
  });
  if (manifest?.readiness?.schemaVersion === readiness.schemaVersion) return manifest;
  return {
    ...manifest,
    stepAnalyses,
    readiness,
  };
}
