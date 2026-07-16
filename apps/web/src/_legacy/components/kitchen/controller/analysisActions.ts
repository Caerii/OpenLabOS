import {
  kitchenSearchGrounded,
  kitchenVideoToProtocol,
  type ERAnalysisResult,
} from "../../../api";
import { withControllerError } from "./errorBoundary";
import type { KitchenDemoRefresh, StateSetter } from "./types";

export function useAnalysisActions({
  refresh,
  searchQuery,
  videoUrl,
  setError,
  setAnalyzing,
  setLastResult,
  setSearchResult,
  setSearching,
  setVideoExtracting,
  setVideoResult,
}: {
  refresh: KitchenDemoRefresh;
  searchQuery: string;
  videoUrl: string;
  setError: StateSetter<string>;
  setAnalyzing: StateSetter<boolean>;
  setLastResult: StateSetter<ERAnalysisResult | null>;
  setSearchResult: StateSetter<any>;
  setSearching: StateSetter<boolean>;
  setVideoExtracting: StateSetter<boolean>;
  setVideoResult: StateSetter<any>;
}) {
  async function runAnalysis(_name: string, fn: () => Promise<ERAnalysisResult>) {
    setAnalyzing(true);
    setError("");
    try {
      setLastResult(await fn());
    } catch (error: any) {
      setError(error.message);
    } finally {
      setAnalyzing(false);
    }
  }

  const search = withControllerError(setError, async () => {
    setSearching(true);
    try {
      setSearchResult(await kitchenSearchGrounded(searchQuery));
    } finally {
      setSearching(false);
    }
  });

  const extractVideo = withControllerError(setError, async () => {
    if (!videoUrl) return;
    setVideoExtracting(true);
    setVideoResult(null);
    try {
      setVideoResult(await kitchenVideoToProtocol(videoUrl, { useSearch: false, thinkingLevel: "high" }));
      refresh.protocols();
    } finally {
      setVideoExtracting(false);
    }
  });

  return { runAnalysis, search, extractVideo };
}
