import {
  kitchenAnalyzeBoxes,
  kitchenAnalyzeCount,
  kitchenAnalyzeEntitySegmentation,
  kitchenAnalyzeHands,
  kitchenAnalyzeInstrument,
  kitchenAnalyzeLiquidLevel,
  kitchenAnalyzeObjects,
  kitchenAnalyzeSafety,
  kitchenAnalyzeSpatial,
  kitchenAnalyzeTrajectory,
  kitchenAnalyzeVideo,
  kitchenAnalyzeWorkspaceClear,
  kitchenMultiscaleStepValidation,
  kitchenTeacherVideoJudgment,
} from "../../../../api";
import {
  absoluteUrl,
  clipOpts,
  clipTimeLabel,
  estimateTokensForSegment,
} from "./model";
import type { KitchenDemoSampleWithFrames, SandboxBatchResult, SuiteResult } from "./types";

async function captureSegmentRun({
  segment,
  fps,
  calls = 1,
  run,
}: {
  segment: KitchenDemoSampleWithFrames;
  fps: number;
  calls?: number;
  run: () => Promise<any>;
}): Promise<SuiteResult> {
  try {
    const result = await run();
    return {
      sampleId: segment.sampleId,
      time: clipTimeLabel(segment),
      tokenEstimate: calls === 1
        ? estimateTokensForSegment(segment, fps).perCall
        : estimateTokensForSegment(segment, fps, calls).total,
      ok: true,
      latencyMs: result.latencyMs,
      result,
    };
  } catch (e: any) {
    return {
      sampleId: segment.sampleId,
      time: clipTimeLabel(segment),
      tokenEstimate: calls === 1
        ? estimateTokensForSegment(segment, fps).perCall
        : estimateTokensForSegment(segment, fps, calls).total,
      ok: false,
      error: e.message,
    };
  }
}

function batchResult(segments: KitchenDemoSampleWithFrames[], results: SuiteResult[]): SandboxBatchResult {
  return {
    batch: segments.length > 1,
    segmentCount: segments.length,
    results,
  };
}

export async function runClipSummaryForSegments(segments: KitchenDemoSampleWithFrames[], fps: number) {
  const results = [];
  for (const segment of segments) {
    results.push(await captureSegmentRun({
      segment,
      fps,
      run: () => kitchenAnalyzeVideo(segment.videoUrl, {
        ...clipOpts(segment, fps),
        prompt: "Summarize what physical tea-making step is happening in this short clip. Return JSON with action, visible_objects, likely_protocol_step, and quality_notes.",
        thinkingLevel: "high",
      }),
    }));
  }
  return batchResult(segments, results);
}

export async function runTeacherJudgmentForSegments({
  segments,
  fps,
  stepNumber,
}: {
  segments: KitchenDemoSampleWithFrames[];
  fps: number;
  stepNumber: number;
}) {
  const results = [];
  for (const segment of segments) {
    results.push(await captureSegmentRun({
      segment,
      fps,
      run: () => kitchenTeacherVideoJudgment({
        protocolId: segment.protocolId || "kitchen-tea-v1",
        stepNumber,
        ...clipOpts(segment, fps),
        thinkingLevel: "high",
      }),
    }));
  }
  return batchResult(segments, results);
}

export async function runMultiscaleValidationForSegments({
  segments,
  fps,
  stepNumber,
}: {
  segments: KitchenDemoSampleWithFrames[];
  fps: number;
  stepNumber: number;
}) {
  const results = [];
  for (const segment of segments) {
    const testImageUrl = absoluteUrl(segment.frameUrls?.[0]);
    results.push(await captureSegmentRun({
      segment,
      fps,
      calls: testImageUrl ? 2 : 1,
      run: () => kitchenMultiscaleStepValidation({
        protocolId: segment.protocolId || "kitchen-tea-v1",
        stepNumber,
        scales: testImageUrl ? ["frame", "short_chunk"] : ["short_chunk"],
        maxChecks: testImageUrl ? 4 : 2,
        ...(testImageUrl ? { testImageUrl } : {}),
        ...clipOpts(segment, fps),
        thinkingLevel: "high",
      }),
    }));
  }
  return batchResult(segments, results);
}

function primitiveSuite(segment: KitchenDemoSampleWithFrames, fps: number) {
  const opts = clipOpts(segment, fps);
  const segmentationFrameUrl = absoluteUrl(segment.frameUrls?.[0]);
  return [
    { id: "spatial", title: "Spatial inventory", run: () => kitchenAnalyzeSpatial({ maxItems: 20, ...opts }) },
    { id: "objects", title: "Find tea objects", run: () => kitchenAnalyzeObjects(["mug", "kettle", "tea bag", "spoon"], opts) },
    { id: "boxes", title: "Bounding boxes", run: () => kitchenAnalyzeBoxes({ maxObjects: 20, ...opts }) },
    {
      id: "entities",
      title: "Entity masks/tracks",
      run: () => segmentationFrameUrl
        ? kitchenAnalyzeEntitySegmentation(
            ["mug", "kettle", "tea bag", "spoon", "hand"],
            { testImageUrl: segmentationFrameUrl, includeMasks: true, includeTracks: true },
          )
        : Promise.reject(new Error("No sampled frame available for entity segmentation")),
    },
    { id: "hands", title: "Hand tracking", run: () => kitchenAnalyzeHands(opts) },
    { id: "safety", title: "Safety check", run: () => kitchenAnalyzeSafety("making tea with hot water", opts) },
    { id: "count", title: "Mug count", run: () => kitchenAnalyzeCount("mug", opts) },
    { id: "instrument", title: "Instrument read", run: () => kitchenAnalyzeInstrument("timer, kettle display, or measuring marks if visible", opts) },
    { id: "liquid", title: "Liquid level", run: () => kitchenAnalyzeLiquidLevel("mug or kettle", opts) },
    { id: "trajectory", title: "Kettle to mug trajectory", run: () => kitchenAnalyzeTrajectory("kettle", "mug", { numPoints: 8, ...opts }) },
    { id: "workspace", title: "Workspace clear", run: () => kitchenAnalyzeWorkspaceClear("tea tray", opts) },
  ];
}

export async function runPrimitiveSuiteForSegments({
  segments,
  fps,
  onResult,
}: {
  segments: KitchenDemoSampleWithFrames[];
  fps: number;
  onResult: (result: SuiteResult) => void;
}) {
  for (const segment of segments) {
    for (const item of primitiveSuite(segment, fps)) {
      const result = await captureSegmentRun({
        segment,
        fps,
        run: item.run,
      });
      onResult({
        ...result,
        id: `${segment.sampleId}:${item.id}`,
        title: item.title,
      });
    }
  }
}
