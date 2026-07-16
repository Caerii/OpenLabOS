import { useEffect, useMemo, useRef, useState } from "react";
import type { CoachAutoCue } from "../guided";
import {
  liveCoachGlassesAudioStart,
  liveCoachGlassesAudioStatus,
  liveCoachGlassesAudioStop,
  liveCoachFetchVoiceSample,
  liveCoachSetVoice,
  liveCoachVoices,
  type GlassesLiveCoachAudioStatus,
  type LiveCoachVoiceOption,
} from "../../../api";
import {
  bytesToBase64,
  downsampleTo16k,
  float32ToPcm16Bytes,
  speakStaticScript,
} from "./audio";
import {
  outputUrlForRecording,
  scenarioForCue,
  splitScenarioGroups,
} from "./scenarios";
import { useLiveCoachDataset } from "./useLiveCoachDataset";
import { useLiveCoachTransport } from "./useLiveCoachTransport";
import { useWebRtcExperiment } from "./useWebRtcExperiment";
import type {
  CoachScenario,
  CoachStatus,
} from "./types";

export function useLiveCoachController({
  enabled,
  protocolId,
  currentStepNumber,
  autoCue,
}: {
  enabled: boolean;
  protocolId: string;
  currentStepNumber?: number | null;
  autoCue?: CoachAutoCue | null;
}) {
  const [status, setStatus] = useState<CoachStatus>({ state: "idle" });
  const [hotMic, setHotMic] = useState(false);
  const [pttHeld, setPttHeld] = useState(false);
  const [scenarioRunning, setScenarioRunning] = useState("");
  const [glassesAudio, setGlassesAudio] = useState<GlassesLiveCoachAudioStatus | null>(null);
  const [glassesAudioChanging, setGlassesAudioChanging] = useState(false);
  const [voiceOptions, setVoiceOptions] = useState<LiveCoachVoiceOption[]>([]);
  const [voiceName, setVoiceName] = useState<string | null>(null);
  const [voiceChanging, setVoiceChanging] = useState(false);
  const [voiceError, setVoiceError] = useState("");
  const [voiceSamplePlaying, setVoiceSamplePlaying] = useState("");
  const [voiceSampleLoading, setVoiceSampleLoading] = useState("");

  const mediaStreamRef = useRef<MediaStream | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sampleAudioRef = useRef<HTMLAudioElement | null>(null);
  const sampleUrlRef = useRef("");
  const lastAutoCueRef = useRef("");
  const lastAutoCueAtRef = useRef(0);
  const shouldSendAudioRef = useRef(false);

  const { health, scenarios, recordings, demoMode, refreshRecordings } = useLiveCoachDataset({
    protocolId,
    setStatus,
  });
  const {
    connected,
    transcript,
    wsRef,
    ensureAudioCtx,
    appendTranscript,
    connect,
    disconnect,
  } = useLiveCoachTransport({ demoMode, setStatus });
  const { primaryScenarios, advancedScenarios } = useMemo(
    () => splitScenarioGroups(scenarios, currentStepNumber),
    [currentStepNumber, scenarios],
  );
  const glassesAudioActive = !!glassesAudio?.running;
  const audioOwner = glassesAudioActive ? "glasses" : connected ? "browser" : "none";
  const webRtc = useWebRtcExperiment(enabled, health?.webRtc);

  useEffect(() => {
    if (health) setVoiceName(health.voiceName || null);
  }, [health?.voiceName]);

  useEffect(() => {
    shouldSendAudioRef.current = enabled && connected && !glassesAudioActive && (hotMic || pttHeld);
  }, [connected, enabled, glassesAudioActive, hotMic, pttHeld]);

  async function startMic() {
    const ctx = await ensureAudioCtx();
    if (mediaStreamRef.current) return;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaStreamRef.current = stream;
    const source = ctx.createMediaStreamSource(stream);
    sourceRef.current = source;
    const proc = ctx.createScriptProcessor(4096, 1, 1);
    processorRef.current = proc;

    proc.onaudioprocess = (e) => {
      if (!shouldSendAudioRef.current) return;
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      const inData = e.inputBuffer.getChannelData(0);
      const down = downsampleTo16k(inData, ctx.sampleRate);
      const bytes = float32ToPcm16Bytes(down);
      ws.send(JSON.stringify({ type: "pcm16", data: bytesToBase64(bytes) }));
    };

    source.connect(proc);
    proc.connect(ctx.destination);
  }

  function stopMic() {
    processorRef.current?.disconnect();
    sourceRef.current?.disconnect();
    processorRef.current = null;
    sourceRef.current = null;
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
  }

  function stopVoiceSample() {
    const audio = sampleAudioRef.current;
    if (audio) {
      audio.pause();
      audio.src = "";
      sampleAudioRef.current = null;
    }
    if (sampleUrlRef.current) {
      URL.revokeObjectURL(sampleUrlRef.current);
      sampleUrlRef.current = "";
    }
    setVoiceSamplePlaying("");
  }

  async function ensureMicStarted() {
    if (mediaStreamRef.current) return;
    try {
      await startMic();
    } catch {
      // Browser mic permission failures are recoverable from the UI.
    }
  }

  async function runScenario(id: string) {
    setScenarioRunning(id);
    try {
      if (demoMode === "static") {
        const scenario = scenarios.find((item) => item.id === id);
        const recording = recordings.find((item) => item.scenarioId === id || item.id === scenario?.recordingId);
        appendTranscript(`Replay: ${recording?.title || scenario?.title || id}`);
        if (recording?.outputWav || recording?.outputUrl || recording?.staticBaseUrl) {
          try {
            await new Audio(outputUrlForRecording(recording)).play();
            return;
          } catch {
            // Fall through to browser speech for generated scripted assets.
          }
        }
        if (scenario?.script && speakStaticScript(scenario.script)) return;
        throw new Error(`No static voice replay found for ${id}`);
      }

      if (!glassesAudioActive) {
        await ensureAudioCtx();
        await connect();
      }
      const scenario = scenarios.find((item) => item.id === id);
      const route = scenario?.protocolId
        ? `/api/live-coach/protocols/${encodeURIComponent(scenario.protocolId)}/scenarios/${encodeURIComponent(id)}/run`
        : `/api/live-coach/scenarios/${encodeURIComponent(id)}/run`;
      const res = await fetch(route, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      appendTranscript(`Scenario: ${data.scenario?.title || id}`);
      window.setTimeout(() => refreshRecordings(), 3000);
    } catch (e: any) {
      appendTranscript(`Scenario error: ${e.message}`);
    } finally {
      setScenarioRunning("");
    }
  }

  function startPushToTalk() {
    if (glassesAudioActive) return;
    ensureMicStarted().catch(() => {});
    setPttHeld(true);
  }

  function stopPushToTalk() {
    setPttHeld(false);
  }

  function stop() {
    stopMic();
    disconnect();
  }

  async function startBrowserAudio() {
    if (glassesAudio?.running) {
      await stopGlassesAudio();
    }
    await ensureAudioCtx();
    await connect();
  }

  function setBrowserHotMic(value: boolean) {
    if (glassesAudioActive) {
      setHotMic(false);
      return;
    }
    setHotMic(value);
  }

  async function refreshGlassesAudio() {
    try {
      setGlassesAudio(await liveCoachGlassesAudioStatus());
    } catch (error: any) {
      setGlassesAudio((prev) => ({
        success: false,
        running: false,
        connected: false,
        wsUrl: prev?.wsUrl || "",
        sampleRate: prev?.sampleRate || 16000,
        outputSampleRate: prev?.outputSampleRate || 24000,
        playbackEnabled: prev?.playbackEnabled ?? true,
        startedAt: prev?.startedAt || 0,
        lastAudioAt: prev?.lastAudioAt || 0,
        chunksSent: prev?.chunksSent || 0,
        bytesSent: prev?.bytesSent || 0,
        audioBytesPlayed: prev?.audioBytesPlayed || 0,
        lastError: error?.message || String(error),
      }));
    }
  }

  async function startGlassesAudio() {
    setGlassesAudioChanging(true);
    try {
      setHotMic(false);
      setPttHeld(false);
      stopMic();
      disconnect();
      setGlassesAudio(await liveCoachGlassesAudioStart({ playback: true }));
    } finally {
      setGlassesAudioChanging(false);
    }
  }

  async function stopGlassesAudio() {
    setGlassesAudioChanging(true);
    try {
      setGlassesAudio(await liveCoachGlassesAudioStop());
    } finally {
      setGlassesAudioChanging(false);
    }
  }

  async function changeVoice(nextVoiceName: string | null) {
    setVoiceChanging(true);
    setVoiceError("");
    try {
      const result = await liveCoachSetVoice(nextVoiceName);
      setVoiceName(result.activeVoiceName || null);
    } catch (error: any) {
      setVoiceError(error?.message || String(error));
    } finally {
      setVoiceChanging(false);
    }
  }

  async function playVoiceSample(sampleVoiceName: string) {
    stopVoiceSample();
    setVoiceError("");
    setVoiceSampleLoading(sampleVoiceName);
    try {
      const sample = voiceOptions.find((voice) => voice.name === sampleVoiceName);
      const blob = await liveCoachFetchVoiceSample(sampleVoiceName, sample?.sampleUrl);
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      sampleAudioRef.current = audio;
      sampleUrlRef.current = url;
      setVoiceSamplePlaying(sampleVoiceName);
      audio.onended = () => {
        if (sampleAudioRef.current === audio) {
          stopVoiceSample();
        }
      };
      audio.onerror = () => {
        if (sampleAudioRef.current === audio) {
          stopVoiceSample();
        }
      };
      await audio.play();
    } catch (error: any) {
      setVoiceError(error?.message || String(error));
    } finally {
      setVoiceSampleLoading("");
    }
  }

  useEffect(() => {
    lastAutoCueRef.current = "";
  }, [protocolId]);

  useEffect(() => {
    if (!enabled || !autoCue || !scenarios.length) return;
    if (lastAutoCueRef.current === autoCue.key) return;
    const scenario = scenarioForCue(scenarios, autoCue);
    if (!scenario) return;

    lastAutoCueRef.current = autoCue.key;
    const elapsed = Date.now() - lastAutoCueAtRef.current;
    const delayMs = Math.max(350, 2600 - elapsed);
    const timer = window.setTimeout(() => {
      lastAutoCueAtRef.current = Date.now();
      runScenario(scenario.id);
    }, delayMs);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, autoCue?.key, protocolId, scenarios.length]);

  useEffect(() => {
    if (!enabled) {
      setPttHeld(false);
      setHotMic(false);
      stopVoiceSample();
      stop();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  useEffect(() => stopVoiceSample, []);

  useEffect(() => {
    if (!enabled) return;
    refreshGlassesAudio();
    const id = window.setInterval(refreshGlassesAudio, 5000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    liveCoachVoices()
      .then((data) => {
        setVoiceOptions(data.voices);
        setVoiceName(data.activeVoiceName || null);
      })
      .catch(() => {});
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !connected || !hotMic || glassesAudioActive) return;
    ensureMicStarted().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, enabled, glassesAudioActive, hotMic]);

  return {
    status,
    connected,
    audioOwner,
    browserAudioDisabled: glassesAudioActive,
    hotMic,
    setHotMic: setBrowserHotMic,
    pttHeld,
    transcript,
    health,
    recordings,
    glassesAudio,
    glassesAudioChanging,
    voiceOptions,
    voiceName,
    voiceChanging,
    voiceError,
    voiceSamplePlaying,
    voiceSampleLoading,
    scenarioRunning,
    demoMode,
    primaryScenarios,
    advancedScenarios,
    connect: startBrowserAudio,
    stop,
    startPushToTalk,
    stopPushToTalk,
    startGlassesAudio,
    stopGlassesAudio,
    refreshGlassesAudio,
    changeVoice,
    playVoiceSample,
    stopVoiceSample,
    runScenario,
    refreshRecordings,
    webRtc,
  };
}

export type LiveCoachController = ReturnType<typeof useLiveCoachController>;
