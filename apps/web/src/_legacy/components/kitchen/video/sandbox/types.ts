import type {
  ERAnalysisResult,
  KitchenDemoSample,
  MultiscaleValidationResult,
} from "../../../../api";

export type DemoMode = "api" | "static";

export type KitchenDemoSampleWithFrames = KitchenDemoSample & {
  frameUrls?: string[];
  originalVideoUrl?: string;
  previewVideoUrl?: string;
};

export type SourceVideoGroup = {
  sourceId: string;
  title: string;
  uploader: string;
  protocolId: string;
  stepHint: string;
  originalVideoUrl?: string;
  notes?: string;
  samples: KitchenDemoSampleWithFrames[];
  startSec: number;
  endSec: number;
  frameCount: number;
  thumbnailUrl?: string;
};

export type SuiteResult = {
  id?: string;
  title?: string;
  sampleId?: string;
  time?: string;
  tokenEstimate?: number;
  ok: boolean;
  latencyMs?: number;
  result?: ERAnalysisResult | any;
  error?: string;
};

export type SandboxBatchResult = {
  batch: boolean;
  segmentCount: number;
  results: SuiteResult[];
};

export type SandboxMultiscaleResult = MultiscaleValidationResult | SandboxBatchResult | any;
