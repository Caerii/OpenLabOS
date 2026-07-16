import { useState } from "react";
import { audioTestTone, audioTestMic, audioTestVad, type AudioTestResult, type VadTestResult } from "../api";

interface Props {
  connected: boolean;
}

export default function AudioTest({ connected }: Props) {
  const [toneStatus, setToneStatus] = useState<"idle" | "playing" | "success" | "error">("idle");
  const [micStatus, setMicStatus] = useState<"idle" | "recording" | "done" | "error">("idle");
  const [micResult, setMicResult] = useState<AudioTestResult | null>(null);
  const [vadResult, setVadResult] = useState<VadTestResult | null>(null);
  const [vadLoading, setVadLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleTone() {
    setToneStatus("playing");
    setError("");
    try {
      await audioTestTone();
      setToneStatus("success");
      setTimeout(() => setToneStatus("idle"), 3000);
    } catch (e: any) {
      setToneStatus("error");
      setError(e.message);
      setTimeout(() => setToneStatus("idle"), 3000);
    }
  }

  async function handleMic() {
    setMicStatus("recording");
    setMicResult(null);
    setError("");
    try {
      const result = await audioTestMic();
      setMicResult(result);
      setMicStatus("done");
    } catch (e: any) {
      setMicStatus("error");
      setError(e.message);
    }
  }

  async function handleVad() {
    setVadLoading(true);
    setVadResult(null);
    setError("");
    try {
      const result = await audioTestVad();
      setVadResult(result);
    } catch (e: any) {
      setError(e.message);
    }
    setVadLoading(false);
  }

  if (!connected) {
    return <div className="flex items-center justify-center h-64 text-muted">Connect to glasses first</div>;
  }

  return (
    <div className="space-y-4">
      <h2 className="text-accentText font-semibold text-lg">Audio Pipeline Testing</h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Speaker Test */}
        <div className="card">
          <h3 className="text-fg font-semibold mb-3">Speaker Test</h3>
          <button
            className="btn-primary text-sm w-full"
            onClick={handleTone}
            disabled={toneStatus === "playing"}
          >
            {toneStatus === "playing" ? "Playing..." : "Play Tone"}
          </button>
          {toneStatus === "success" && (
            <span className="inline-block mt-2 px-2 py-1 text-xs rounded bg-green-900/50 text-green-400">Success</span>
          )}
          {toneStatus === "error" && (
            <span className="inline-block mt-2 px-2 py-1 text-xs rounded bg-red-900/50 text-red-400">Failed</span>
          )}
        </div>

        {/* Microphone Test */}
        <div className="card">
          <h3 className="text-fg font-semibold mb-3">Microphone Test</h3>
          <button
            className="btn-primary text-sm w-full"
            onClick={handleMic}
            disabled={micStatus === "recording"}
          >
            {micStatus === "recording" ? "Recording..." : "Record 3s"}
          </button>
          {micResult && (
            <div className="mt-3 space-y-2">
              <div className="text-xs text-muted">
                <p>Duration: {micResult.duration}ms</p>
                <p>Size: {(micResult.fileSize / 1024).toFixed(1)} KB</p>
                <p>{micResult.message}</p>
              </div>
              <audio controls className="w-full mt-2" src="/api/audio/mic-recording" />
            </div>
          )}
          {micStatus === "error" && (
            <span className="inline-block mt-2 px-2 py-1 text-xs rounded bg-red-900/50 text-red-400">Failed</span>
          )}
        </div>

        {/* VAD Status */}
        <div className="card">
          <h3 className="text-fg font-semibold mb-3">VAD Status</h3>
          <button
            className="btn-primary text-sm w-full"
            onClick={handleVad}
            disabled={vadLoading}
          >
            {vadLoading ? "Checking..." : "Check VAD"}
          </button>
          {vadResult && (
            <div className="mt-3 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted">VAD:</span>
                <span className={`px-2 py-0.5 text-xs rounded ${vadResult.vadEnabled ? "bg-green-900/50 text-green-400" : "bg-red-900/50 text-red-400"}`}>
                  {vadResult.vadEnabled ? "Enabled" : "Disabled"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted">Mic:</span>
                <span className={`px-2 py-0.5 text-xs rounded ${vadResult.micEnabled ? "bg-green-900/50 text-green-400" : "bg-red-900/50 text-red-400"}`}>
                  {vadResult.micEnabled ? "Enabled" : "Disabled"}
                </span>
              </div>
              <p className="text-xs text-muted mt-1">{vadResult.message}</p>
            </div>
          )}
        </div>
      </div>

      {error && <p className="text-xs text-red-400 bg-surface-1 border border-red-500/20 p-2 rounded">{error}</p>}
    </div>
  );
}
