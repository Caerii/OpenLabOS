import { analyzeFrame, type FrameAnalysis } from "./frame-analyzer.js";

export interface ModelComparison {
  modelId: string;
  status: "fulfilled" | "rejected";
  result?: FrameAnalysis;
  error?: string;
}

export interface ModelAgreement {
  modelCount: number;
  objectOverlap: number;
  sharedObjects: string[];
  uniqueObjects: string[];
  sceneWordOverlap: number;
  activityAgreement: boolean;
  activities: string[];
}

export async function compareFrameAcrossModels(frame: Buffer, modelIds: string[], moduleId?: string) {
  const results = await Promise.allSettled(modelIds.map((id) => analyzeFrame(frame, id, { moduleId })));

  const analyses: ModelComparison[] = results.map((result, index) => ({
    modelId: modelIds[index],
    status: result.status,
    result: result.status === "fulfilled" ? result.value : undefined,
    error: result.status === "rejected" ? (result.reason as Error).message : undefined,
  }));

  return {
    analyses,
    agreement: buildAgreement(analyses),
  };
}

export function selectRichestSuccessfulAnalysis(analyses: ModelComparison[]) {
  const successful = analyses.filter((analysis) => analysis.result);
  if (successful.length === 0) return null;
  return successful.reduce((best, current) =>
    best.result!.objects.length >= current.result!.objects.length ? best : current,
  );
}

function buildAgreement(analyses: ModelComparison[]): ModelAgreement | null {
  const successful = analyses.filter((analysis) => analysis.result);
  if (successful.length < 2) return null;

  const labelSets = successful.map((analysis) =>
    new Set(analysis.result!.objects.map((object) => object.label.toLowerCase())),
  );
  const uniqueLabels = new Set(
    successful.flatMap((analysis) => analysis.result!.objects.map((object) => object.label.toLowerCase())),
  );
  const sharedLabels = [...uniqueLabels].filter((label) => labelSets.filter((labels) => labels.has(label)).length >= 2);

  const sceneWordSets = successful.map((analysis) =>
    new Set(analysis.result!.scene.toLowerCase().split(/\s+/).filter((word) => word.length > 3)),
  );
  const allSceneWords = new Set(sceneWordSets.flatMap((words) => [...words]));
  const sharedSceneWords = [...allSceneWords].filter((word) =>
    sceneWordSets.filter((words) => words.has(word)).length >= 2,
  );

  const activities = successful.map((analysis) => analysis.result!.activity?.toLowerCase()).filter(Boolean) as string[];

  return {
    modelCount: successful.length,
    objectOverlap: uniqueLabels.size > 0 ? sharedLabels.length / uniqueLabels.size : 0,
    sharedObjects: sharedLabels,
    uniqueObjects: [...uniqueLabels],
    sceneWordOverlap: allSceneWords.size > 0 ? sharedSceneWords.length / allSceneWords.size : 0,
    activityAgreement: activities.length >= 2 && new Set(activities).size === 1,
    activities: [...new Set(activities)],
  };
}
