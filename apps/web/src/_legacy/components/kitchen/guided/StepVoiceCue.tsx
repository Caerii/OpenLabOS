import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { playProtocolStepAudio, type KitchenStepStatus } from "../../../api";
import {
  staticProtocolVoiceManifestUrl,
  stepIntroClipFor,
  type ProtocolVoiceManifest,
} from "./protocolVoiceAssets";

const AUTO_STEP_AUDIO_DEDUPE_MS = 60_000;
const recentAutoStepAudio = new Map<string, number>();

function pruneRecentAutoStepAudio(now: number) {
  for (const [key, playedAt] of recentAutoStepAudio) {
    if (now - playedAt > AUTO_STEP_AUDIO_DEDUPE_MS * 2) recentAutoStepAudio.delete(key);
  }
}

export function autoStepAudioPlaybackKey(
  protocolId: string | null | undefined,
  currentStep: KitchenStepStatus | null,
  clipUrl: string,
) {
  if (!protocolId || !currentStep?.number || !clipUrl) return "";
  const attemptKey = currentStep.attemptId || `step-${currentStep.number}-attempt-${currentStep.attemptNumber || 1}`;
  return `${protocolId}:${attemptKey}:${clipUrl}`;
}

export function claimAutoStepAudioPlayback(key: string, now = Date.now()) {
  if (!key) return false;
  pruneRecentAutoStepAudio(now);
  const previous = recentAutoStepAudio.get(key);
  if (previous && now - previous < AUTO_STEP_AUDIO_DEDUPE_MS) return false;
  recentAutoStepAudio.set(key, now);
  return true;
}

export function StepVoiceCue({
  protocolId,
  currentStep,
  disabled,
}: {
  protocolId?: string | null;
  currentStep: KitchenStepStatus | null;
  disabled?: boolean;
}) {
  const [manifest, setManifest] = useState<ProtocolVoiceManifest | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<"idle" | "ready" | "sending" | "playing" | "browser" | "blocked" | "error">("idle");
  const [autoBlocked, setAutoBlocked] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const autoPlayedKeyRef = useRef("");
  const playNonceRef = useRef(0);

  useEffect(() => {
    if (!protocolId) {
      setManifest(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(staticProtocolVoiceManifestUrl(protocolId))
      .then((response) => response.ok ? response.json() : null)
      .then((data) => {
        if (!cancelled) setManifest(data);
      })
      .catch(() => {
        if (!cancelled) setManifest(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [protocolId]);

  const clip = useMemo(() => stepIntroClipFor(
    manifest,
    currentStep?.number,
    currentStep?.instruction || "",
  ), [currentStep?.instruction, currentStep?.number, manifest]);
  const clipKey = clip?.url ? autoStepAudioPlaybackKey(protocolId, currentStep, clip.url) : "";

  useEffect(() => {
    setAutoBlocked(false);
    setStatus(clip ? "ready" : "idle");
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    audio.load();
  }, [clip?.url]);

  const playBrowserFallback = useCallback(async (source: "auto" | "manual", nonce: number) => {
    if (!clip?.url) return false;
    const audio = audioRef.current;
    if (!audio) return false;
    try {
      audio.muted = false;
      audio.volume = 1;
      audio.currentTime = 0;
      await audio.play();
      if (playNonceRef.current === nonce) {
        setStatus("browser");
      }
      return true;
    } catch {
      if (playNonceRef.current === nonce) {
        setStatus("blocked");
        setAutoBlocked(source === "auto");
      }
      return false;
    }
  }, [clip?.url]);

  const play = useCallback(async (source: "auto" | "manual" = "manual") => {
    if (!protocolId || !currentStep?.number || !clip?.url) return false;
    const nonce = playNonceRef.current + 1;
    playNonceRef.current = nonce;
    try {
      setAutoBlocked(false);
      setStatus("sending");
      const result = await playProtocolStepAudio(protocolId, currentStep.number, currentStep.instruction || "", {
        playbackKey: clipKey,
        force: source === "manual",
      });
      if (result.skipped) {
        if (playNonceRef.current === nonce) setStatus("ready");
        return true;
      }
      if (playNonceRef.current === nonce) {
        setStatus("playing");
        window.setTimeout(() => {
          if (playNonceRef.current === nonce) setStatus("ready");
        }, 4000);
      }
      return true;
    } catch {
      return playBrowserFallback(source, nonce);
    }
  }, [clip?.url, clipKey, currentStep?.instruction, currentStep?.number, playBrowserFallback, protocolId]);

  useEffect(() => {
    if (!clipKey || disabled || !currentStep || autoPlayedKeyRef.current === clipKey) return;
    const timer = window.setTimeout(() => {
      if (!claimAutoStepAudioPlayback(clipKey)) return;
      autoPlayedKeyRef.current = clipKey;
      void play("auto");
    }, 150);
    return () => window.clearTimeout(timer);
  }, [clipKey, currentStep, disabled, play]);

  if (!currentStep || disabled) return null;

  if (!clip) {
    return loading ? (
      <div className="mt-3 labos-inset px-3 py-2 text-xs text-muted">
        Loading step audio...
      </div>
    ) : null;
  }

  return (
    <div className="mt-3 rounded-lg border border-highlight-border/20 bg-surface-2/90 p-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-subtle">Step audio</div>
          <div className="truncate text-xs text-muted">
            {status === "sending" ? "Sending to glasses..." :
              status === "playing" ? "Playing on the glasses." :
                status === "browser" ? "Playing in this browser." :
                  clip.scenario.title}
          </div>
        </div>
        <audio
          ref={audioRef}
          src={clip.url}
          preload="auto"
          onEnded={() => setStatus("ready")}
          onError={() => setStatus("error")}
        />
        <button
          type="button"
          className="rounded-lg border border-highlight-border/30 bg-highlight-bg/10 px-3 py-1.5 text-xs font-semibold text-accentText hover:bg-highlight-bg/15 disabled:cursor-not-allowed disabled:opacity-60"
          onClick={() => void play("manual")}
          disabled={status === "sending" || status === "playing"}
        >
          {status === "sending" ? "Sending..." : status === "playing" ? "Playing..." : autoBlocked ? "Enable Browser Audio" : "Hear Step"}
        </button>
      </div>
      {autoBlocked && (
        <div className="mt-2 text-[11px] text-amber-500">
          Audio did not play on the glasses, and this browser needs permission to play it. Select Enable Browser Audio once, or check the glasses connection.
        </div>
      )}
      {status === "browser" && (
        <div className="mt-2 text-[11px] text-amber-500">
          The glasses audio was unavailable, so the instruction played here instead.
        </div>
      )}
      {status === "error" && (
        <div className="mt-2 text-[11px] text-amber-500">
          Step audio could not be loaded. The step text is still authoritative.
        </div>
      )}
    </div>
  );
}
