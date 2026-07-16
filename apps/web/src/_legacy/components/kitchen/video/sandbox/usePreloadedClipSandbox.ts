import { useEffect, useMemo, useState } from "react";
import { loadKitchenDemoSamplesWithFallback } from "./data";
import {
  buildSourceGroups,
  previewUrlForSegment,
  sourceKey,
} from "./model";
import {
  runClipSummaryForSegments,
  runMultiscaleValidationForSegments,
  runPrimitiveSuiteForSegments,
  runTeacherJudgmentForSegments,
} from "./operations";
import type {
  DemoMode,
  KitchenDemoSampleWithFrames,
  SandboxMultiscaleResult,
  SourceVideoGroup,
  SuiteResult,
} from "./types";

export function usePreloadedClipSandbox() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [samples, setSamples] = useState<KitchenDemoSampleWithFrames[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [stepNumber, setStepNumber] = useState(1);
  const [fps, setFps] = useState(2);
  const [running, setRunning] = useState("");
  const [teacherResult, setTeacherResult] = useState<any>(null);
  const [clipResult, setClipResult] = useState<any>(null);
  const [multiscaleResult, setMultiscaleResult] = useState<SandboxMultiscaleResult | null>(null);
  const [suiteResults, setSuiteResults] = useState<SuiteResult[]>([]);
  const [demoMode, setDemoMode] = useState<DemoMode>("api");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadKitchenDemoSamplesWithFallback()
      .then((data) => {
        if (cancelled) return;
        setSamples(data.samples);
        setSelectedSourceId(data.selectedSourceId);
        setSelectedId(data.selectedId);
        setSelectedIds(data.selectedIds);
        setDemoMode(data.demoMode);
        setError(data.error);
      })
      .catch((e: any) => {
        if (!cancelled) setError(e.message || "Failed to load demo samples.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const sourceGroups = useMemo(() => buildSourceGroups(samples), [samples]);
  const selectedSource = useMemo(
    () => sourceGroups.find((group) => group.sourceId === selectedSourceId) || sourceGroups[0],
    [sourceGroups, selectedSourceId],
  );
  const sourceSamples = selectedSource?.samples || [];
  const selectedSegments = useMemo(() => {
    const set = new Set(selectedIds);
    const matches = sourceSamples.filter((sample) => set.has(sample.sampleId));
    return matches.length ? matches : (sourceSamples[0] ? [sourceSamples[0]] : []);
  }, [selectedIds, sourceSamples]);
  const selected = useMemo(
    () =>
      selectedSegments.find((sample) => sample.sampleId === selectedId) ||
      selectedSegments[0] ||
      sourceSamples[0] ||
      samples[0],
    [samples, selectedId, selectedSegments, sourceSamples],
  );
  const selectedPreviewUrl = selected ? previewUrlForSegment(selected, demoMode) : "";

  function clearAnalysisResults() {
    setClipResult(null);
    setTeacherResult(null);
    setMultiscaleResult(null);
    setSuiteResults([]);
    setError("");
  }

  function chooseSource(group: SourceVideoGroup) {
    setSelectedSourceId(group.sourceId);
    setSelectedId(group.samples[0]?.sampleId || "");
    setSelectedIds(group.samples[0]?.sampleId ? [group.samples[0].sampleId] : []);
    clearAnalysisResults();
  }

  function chooseSegment(sample: KitchenDemoSampleWithFrames) {
    const inSource = new Set(sourceSamples.map((candidate) => candidate.sampleId));
    const current = selectedIds.filter((id) => inSource.has(id));
    const next = current.includes(sample.sampleId)
      ? current.length > 1 ? current.filter((id) => id !== sample.sampleId) : current
      : [...current, sample.sampleId];

    setSelectedSourceId(sourceKey(sample));
    setSelectedId(next.includes(sample.sampleId) ? sample.sampleId : next[0] || sample.sampleId);
    setSelectedIds(next);
    clearAnalysisResults();
  }

  function focusSegment(sample: KitchenDemoSampleWithFrames) {
    setSelectedSourceId(sourceKey(sample));
    setSelectedId(sample.sampleId);
  }

  function selectAllSegments() {
    if (!sourceSamples.length) return;
    setSelectedIds(sourceSamples.map((sample) => sample.sampleId));
    setSelectedId(sourceSamples[0].sampleId);
    clearAnalysisResults();
  }

  function selectPrimaryOnly() {
    if (!selected) return;
    setSelectedIds([selected.sampleId]);
    clearAnalysisResults();
  }

  function segmentsToRun() {
    return selectedSegments.length ? selectedSegments : selected ? [selected] : [];
  }

  async function runClipSummary() {
    const segments = segmentsToRun();
    if (!segments.length) return;
    if (demoMode === "static") {
      setError("Static live-site mode can replay clips without keys. Real clip analysis needs the backend API and Gemini/RunPod keys.");
      return;
    }
    setRunning("clip");
    setError("");
    try {
      setClipResult(await runClipSummaryForSegments(segments, fps));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRunning("");
    }
  }

  async function runTeacherJudgment() {
    const segments = segmentsToRun();
    if (!segments.length) return;
    if (demoMode === "static") {
      setError("Static live-site mode can replay clips without keys. Teacher judgment needs the backend API and Gemini key.");
      return;
    }
    setRunning("teacher");
    setError("");
    try {
      setTeacherResult(await runTeacherJudgmentForSegments({ segments, fps, stepNumber }));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRunning("");
    }
  }

  async function runMultiscaleValidation() {
    const segments = segmentsToRun();
    if (!segments.length) return;
    if (demoMode === "static") {
      setError("Static live-site mode can replay clips without keys. Multiscale validation needs the backend API and Gemini/RunPod keys.");
      return;
    }
    setRunning("multiscale");
    setError("");
    try {
      setMultiscaleResult(await runMultiscaleValidationForSegments({ segments, fps, stepNumber }));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setRunning("");
    }
  }

  async function runPrimitiveSuite() {
    const segments = segmentsToRun();
    if (!segments.length) return;
    if (demoMode === "static") {
      setError("Static live-site mode can replay clips without keys. The primitive suite needs the backend AI API.");
      return;
    }
    setRunning("suite");
    setError("");
    setSuiteResults([]);
    try {
      await runPrimitiveSuiteForSegments({
        segments,
        fps,
        onResult: (result) => setSuiteResults((prev) => [...prev, result]),
      });
    } finally {
      setRunning("");
    }
  }

  return {
    loading,
    error,
    setError,
    samples,
    sourceGroups,
    selectedSource,
    selected,
    selectedIds,
    selectedSegments,
    selectedPreviewUrl,
    stepNumber,
    setStepNumber,
    fps,
    setFps,
    running,
    demoMode,
    clipResult,
    teacherResult,
    multiscaleResult,
    suiteResults,
    chooseSource,
    chooseSegment,
    focusSegment,
    selectAllSegments,
    selectPrimaryOnly,
    runClipSummary,
    runTeacherJudgment,
    runMultiscaleValidation,
    runPrimitiveSuite,
  };
}
