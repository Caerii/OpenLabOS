/**
 * VisionPanel — AI Vision pipeline dashboard for LabOS.
 *
 * Sections:
 *   1. Provider Status — shows which AI backends are available (Gemini, OpenAI, Ollama, LM Studio)
 *   2. One-Shot Analysis — analyze current frame with selected model
 *   3. Pipeline Control — start/stop continuous analysis loop
 *   4. Analysis History — recent results with scene descriptions and detected objects
 *   5. Data Collection — dataset stats, export controls
 *   6. Local Model Managers — Ollama (CLI) and LM Studio (desktop GUI)
 */

import { useState } from "react";
import { usePolling } from "../hooks/usePolling";
import {
  aiProviders,
  aiModels,
  aiAnalyzeFrame,
  aiPipelineStart,
  aiPipelineStop,
  aiPipelineStatus,
  aiDataStats,
  aiDataExportCOCO,
  aiDataExportJSONL,
  aiDataClear,
  aiCompare,
  aiExperiments,
  ollamaStatus,
  ollamaPull,
  lmstudioStatus,
  type FrameAnalysisResult,
  type PipelineStatus,
  type DatasetStats,
  type OllamaStatus,
  type LmStudioStatus,
} from "../api";
import { ConfirmDialog, KpiTile } from "./ui";
import { suggestedVisionMaxConcurrent } from "../lib/labosModelRouting";
import { VisionHeader } from "./vision/VisionHeader";
import { ProvidersCard } from "./vision/ProvidersCard";
import { DatasetCard } from "./vision/DatasetCard";
import { AnalysisResult } from "./vision/AnalysisResult";
import { OllamaManagerCard } from "./vision/OllamaManagerCard";
import { LmStudioManagerCard } from "./vision/LmStudioManagerCard";
import { VisionCompareCard } from "./vision/VisionCompareCard";
import { VisionExperimentsCard } from "./vision/VisionExperimentsCard";
import { VisionSectionCard } from "./vision/VisionSectionCard";

const VISION_MODEL_FALLBACKS = [
  "ollama:llava:7b",
  "ollama:llava:13b",
  "ollama:llama3.2-vision:11b",
  "ollama:moondream",
  "google:gemini-2.5-flash",
  "google:gemini-2.5-pro",
  "openai:gpt-4o",
  "openai:gpt-4o-mini",
] as const;

interface Props {
  connected: boolean;
}

export default function VisionPanel({ connected }: Props) {
  // Provider & model state
  const { data: providers } = usePolling(aiProviders, 15000);
  const { data: modelsData } = usePolling(aiModels, 15000);
  const { data: ollama, refresh: refreshOllama } = usePolling(ollamaStatus, 10000);
  const { data: lmstudio } = usePolling(lmstudioStatus, 10000);
  const { data: experiments } = usePolling(aiExperiments, 5000);

  // Pipeline state
  const { data: pipelineData, refresh: refreshPipeline } = usePolling(aiPipelineStatus, 2000, connected);

  // Data collection state
  const { data: dataStats, refresh: refreshData } = usePolling(aiDataStats, 5000);

  // UI state
  const [selectedModel, setSelectedModel] = useState("ollama:llava:7b");
  const [analysisInterval, setAnalysisInterval] = useState(3000);
  const [saveToDataset, setSaveToDataset] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [lastAnalysis, setLastAnalysis] = useState<FrameAnalysisResult | null>(null);
  const [error, setError] = useState("");
  const [pullModel, setPullModel] = useState("llava:7b");
  const [pulling, setPulling] = useState(false);
  const [pullStatus, setPullStatus] = useState("");
  const [comparing, setComparing] = useState(false);
  const [compareResult, setCompareResult] = useState<any>(null);
  const [clearOpen, setClearOpen] = useState(false);

  // Build flat list of all available models from providers
  const allModels = modelsData?.models || [];

  async function handleAnalyze() {
    setAnalyzing(true);
    setError("");
    try {
      const result = await aiAnalyzeFrame(selectedModel, { saveToDataset });
      setLastAnalysis(result);
    } catch (e: any) {
      setError(e.message);
    }
    setAnalyzing(false);
  }

  async function handlePipelineToggle() {
    try {
      if ((pipelineData?.activePipelineCount ?? 0) > 0) {
        await aiPipelineStop({ stopAll: true });
      } else {
        await aiPipelineStart({
          modelId: selectedModel,
          intervalMs: analysisInterval,
          maxConcurrent: suggestedVisionMaxConcurrent(selectedModel),
          saveToDataset,
        });
      }
      refreshPipeline();
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function handlePull() {
    setPulling(true);
    setPullStatus(`Pulling ${pullModel}...`);
    try {
      await ollamaPull(pullModel);
      setPullStatus(`${pullModel} pulled successfully`);
      refreshOllama();
    } catch (e: any) {
      setPullStatus(`Pull failed: ${e.message}`);
    }
    setPulling(false);
  }

  async function confirmClearData() {
    setClearOpen(false);
    try {
      await aiDataClear();
      refreshData();
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function handleCompare() {
    if (allModels.length < 2) {
      setError("Need 2+ available models to compare");
      return;
    }
    setComparing(true);
    setError("");
    try {
      // Compare up to 3 models (or all available if fewer)
      const modelsToCompare = allModels.slice(0, 3);
      const result = await aiCompare(modelsToCompare, saveToDataset);
      setCompareResult(result);
    } catch (e: any) {
      setError(e.message);
    }
    setComparing(false);
  }

  // Derive a backward-compatible pipeline view from multi-pipeline response.
  // Shows the first active pipeline (or a default "not running" state).
  const activePipeline = pipelineData?.pipelines?.find((p: any) => p.running);
  const pipeline = {
    running: (pipelineData?.activePipelineCount ?? 0) > 0,
    totalAnalyzed: activePipeline?.totalAnalyzed ?? 0,
    totalErrors: activePipeline?.totalErrors ?? 0,
    modelId: activePipeline?.modelId,
    moduleId: activePipeline?.moduleId,
    recentHistory: pipelineData?.recentHistory ?? [],
  };
  const stats: DatasetStats = dataStats || { totalFrames: 0, totalAnnotations: 0, diskUsageMB: 0, models: {}, recentAnnotations: [] };
  const ollamaInfo: OllamaStatus = ollama || { available: false, url: "http://localhost:11434" };
  const lmstudioInfo: LmStudioStatus = lmstudio || { available: false, url: "http://localhost:1234" };

  return (
    <div className="space-y-4">
      <ConfirmDialog
        open={clearOpen}
        onClose={() => setClearOpen(false)}
        title="Clear vision dataset?"
        description="Deletes all collected frames and annotations. This cannot be undone."
        destructive
        confirmText="Delete all"
        onConfirm={confirmClearData}
      />
      {/* Header */}
      <VisionHeader running={pipeline.running} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* ─── Provider Status ─────────────────────── */}
        <ProvidersCard providers={providers?.providers || []} />

        <VisionSectionCard title="Analyze Frame">
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted block mb-1">Model</label>
              <select
                className="w-full px-3 py-2 bg-surface-2 border border-border/20 rounded text-sm text-fg"
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
              >
                {allModels.length > 0 ? (
                  allModels.map((m: string) => (
                    <option key={m} value={m}>{m}</option>
                  ))
                ) : (
                  VISION_MODEL_FALLBACKS.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))
                )}
              </select>
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-muted cursor-pointer">
                <input
                  type="checkbox"
                  checked={saveToDataset}
                  onChange={(e) => setSaveToDataset(e.target.checked)}
                  className="rounded"
                />
                Save to dataset
              </label>
            </div>
            <button
              className="btn-primary w-full"
              onClick={handleAnalyze}
              disabled={analyzing || !connected}
            >
              {analyzing ? "Analyzing..." : "Analyze Current Frame"}
            </button>
          </div>
          {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
        </VisionSectionCard>

        <VisionSectionCard title="Continuous Pipeline">
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted block mb-1">Analysis Interval (ms)</label>
              <input
                type="number"
                className="w-full px-3 py-2 bg-surface-2 border border-border/20 rounded text-sm text-fg"
                value={analysisInterval}
                onChange={(e) => setAnalysisInterval(parseInt(e.target.value) || 3000)}
                min={500}
                step={500}
              />
            </div>
            <button
              className={pipeline.running ? "btn-danger w-full" : "btn-primary w-full"}
              onClick={handlePipelineToggle}
              disabled={!connected}
            >
              {pipeline.running ? "Stop Pipeline" : "Start Pipeline"}
            </button>
            {pipeline.running && (
              <div className="grid grid-cols-3 gap-2 text-center">
                <KpiTile label="Analyzed" value={pipeline.totalAnalyzed} tone="good" />
                <KpiTile label="Errors" value={pipeline.totalErrors} tone={pipeline.totalErrors > 0 ? "bad" : "default"} />
                <KpiTile label="Model" value={pipeline.modelId?.split(":").pop() ?? "—"} tone="info" />
              </div>
            )}
          </div>
        </VisionSectionCard>

        {/* ─── Data Collection Stats ──────────────── */}
        <DatasetCard
          stats={stats}
          exportCocoHref={aiDataExportCOCO()}
          exportJsonlHref={aiDataExportJSONL()}
          onClear={() => setClearOpen(true)}
        />

        <OllamaManagerCard
          info={ollamaInfo}
          pullModel={pullModel}
          onPullModelChange={setPullModel}
          pulling={pulling}
          pullStatus={pullStatus}
          onPull={handlePull}
        />

        <LmStudioManagerCard info={lmstudioInfo} />

        <VisionCompareCard
          connected={connected}
          modelCount={allModels.length}
          comparing={comparing}
          compareResult={compareResult}
          onCompare={handleCompare}
        />

        <VisionExperimentsCard experiments={experiments} />

        <VisionSectionCard title="Latest Analysis" className="lg:col-span-2">
          {lastAnalysis ? (
            <AnalysisResult result={lastAnalysis} />
          ) : pipeline.recentHistory && pipeline.recentHistory.length > 0 ? (
            <AnalysisResult result={pipeline.recentHistory[pipeline.recentHistory.length - 1]} />
          ) : (
            <p className="text-muted text-sm">No analysis results yet. Start streaming and click "Analyze Current Frame".</p>
          )}
        </VisionSectionCard>

        {pipeline.recentHistory && pipeline.recentHistory.length > 1 && (
          <VisionSectionCard
            title={`Recent History (${pipeline.recentHistory.length} results)`}
            className="lg:col-span-2"
          >
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {[...pipeline.recentHistory].reverse().map((r: any, i: number) => (
                <div key={i} className="p-2 rounded bg-surface-1 border border-border/15">
                  {r.error ? (
                    <span className="text-red-400 text-sm">{r.error}</span>
                  ) : (
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate">{r.scene}</p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {(r.objects || []).slice(0, 6).map((obj: any, j: number) => (
                            <span key={j} className="px-1.5 py-0.5 rounded bg-border/25 text-xs text-muted">
                              {obj.label}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="text-xs text-muted whitespace-nowrap">
                        {r.latencyMs}ms
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </VisionSectionCard>
        )}
      </div>
    </div>
  );
}
