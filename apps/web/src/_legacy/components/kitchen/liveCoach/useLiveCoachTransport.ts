import { useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { clearPcm24kPlayback, playPcm24kBase64 } from "./audio";
import type { CoachStatus, DemoMode, ServerMsg } from "./types";

function liveWsUrl() {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${location.host}/api/live-coach/ws`;
}

export function useLiveCoachTransport({
  demoMode,
  setStatus,
}: {
  demoMode: DemoMode;
  setStatus: Dispatch<SetStateAction<CoachStatus>>;
}) {
  const [connected, setConnected] = useState(false);
  const [transcript, setTranscript] = useState<string[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const wsUrl = useMemo(() => liveWsUrl(), []);

  async function ensureAudioCtx() {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext({ latencyHint: "interactive" });
    }
    if (audioCtxRef.current.state === "suspended") {
      await audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  }

  function appendTranscript(line: string) {
    setTranscript((prev) => [...prev.slice(-30), line]);
  }

  function connect(): Promise<void> {
    if (demoMode === "static") {
      setStatus({ state: "idle", configured: false, model: "static replay", audioRoute: "browser" });
      return Promise.resolve();
    }
    if (wsRef.current?.readyState === WebSocket.OPEN) return Promise.resolve();
    if (wsRef.current) {
      return new Promise((resolve) => {
        const existing = wsRef.current;
        const done = () => resolve();
        existing?.addEventListener("open", done, { once: true });
        existing?.addEventListener("close", done, { once: true });
        window.setTimeout(done, 2000);
      });
    }

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    setStatus({ state: "connecting" });

    return new Promise((resolve) => {
      ws.onopen = () => {
        setConnected(true);
        ws.send(JSON.stringify({ type: "start" }));
        resolve();
      };
      ws.onclose = () => {
        setConnected(false);
        wsRef.current = null;
        setStatus({ state: "idle" });
        resolve();
      };
      ws.onerror = () => {
        setStatus({ state: "error", message: "WebSocket error" });
        resolve();
      };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(String(ev.data)) as ServerMsg;
          if (msg.type === "status") setStatus(msg.status);
          if (msg.type === "clear-audio") clearPcm24kPlayback(audioCtxRef.current);
          if (msg.type === "transcript") appendTranscript(msg.transcript);
          if (msg.type === "text") appendTranscript(`AI: ${msg.text}`);
          if (msg.type === "audio") playPcm24kBase64(audioCtxRef.current, msg.data);
        } catch {}
      };
    });
  }

  function disconnect() {
    const ws = wsRef.current;
    if (ws) {
      try {
        ws.send(JSON.stringify({ type: "stop" }));
      } catch {}
      ws.close();
    }
    wsRef.current = null;
  }

  return {
    connected,
    transcript,
    wsRef,
    ensureAudioCtx,
    appendTranscript,
    connect,
    disconnect,
  };
}
