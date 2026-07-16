/**
 * Video, teacher-judgment, and search-grounded Kitchen analysis calls.
 */

import { kitchenAnalyzePost, kitchenPost } from "./transport";
import type { ERAnalysisResult, ERInputOptions, VideoAnalysisResult, VideoProtocolResult } from "./types";

export const kitchenAnalyzeVideo = (
  videoUrl: string,
  opts?: { prompt?: string; useSearch?: boolean; thinkingLevel?: string; modelId?: string },
) => kitchenAnalyzePost<VideoAnalysisResult>("video", { videoUrl, ...opts });

export const kitchenVideoToProtocol = (
  videoUrl: string,
  opts?: { protocolId?: string; useSearch?: boolean; thinkingLevel?: string; modelId?: string },
) => kitchenAnalyzePost<VideoProtocolResult>("video/to-protocol", { videoUrl, ...opts });

export const kitchenTeacherVideoJudgment = (opts: {
  protocolId: string;
  stepNumber: number;
} & ERInputOptions) => kitchenPost<{
  success: boolean;
  judgment: any;
  clip: {
    videoUrl: string;
    videoStartOffsetSec?: number;
    videoEndOffsetSec?: number;
    videoFps?: number;
  };
  latencyMs: number;
}>("teacher/judgment/video", opts);

export const kitchenSearchGrounded = (
  query: string,
  opts?: { testImage?: string; videoUrl?: string; modelId?: string },
) => kitchenAnalyzePost<ERAnalysisResult & { sources?: any[] }>("search", { query, ...opts });

