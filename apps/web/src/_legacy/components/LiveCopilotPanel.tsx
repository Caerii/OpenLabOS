import { Badge, Btn, Card, CardHeader, CardTitle, SectionLabel } from "./ui";
import VoiceCharacterCard from "./liveCopilot/VoiceCharacterCard";
import WebRtcExperimentCard from "./liveCopilot/WebRtcExperimentCard";
import ProtocolControlCard from "./liveCopilot/ProtocolControlCard";
import { useLiveCoachController } from "./kitchen/liveCoach/useLiveCoachController";

interface LiveCopilotPanelProps {
  connected: boolean;
}

function AudioRouteCard({ coach }: { coach: ReturnType<typeof useLiveCoachController> }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle sub="Choose how the realtime copilot hears you and where speech plays back">
          Audio Route
        </CardTitle>
      </CardHeader>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-lg border border-border/15 bg-border/10 p-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-fg">Browser audio</span>
                <Badge color={coach.connected ? "green" : "gray"}>{coach.connected ? "connected" : "idle"}</Badge>
              </div>
              <p className="mt-1 text-[11px] text-muted">
                Uses this browser tab for microphone input and speaker output. Useful for laptop debugging.
              </p>
            </div>
            {coach.connected ? (
              <Btn variant="secondary" size="sm" onClick={coach.stop}>
                Stop Browser
              </Btn>
            ) : (
              <Btn
                variant="primary"
                size="sm"
                disabled={coach.demoMode === "static" || coach.browserAudioDisabled}
                onClick={coach.connect}
              >
                Use Browser
              </Btn>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-muted select-none">
              <input
                type="checkbox"
                checked={coach.hotMic}
                onChange={(event) => coach.setHotMic(event.target.checked)}
                disabled={!coach.connected || coach.demoMode === "static" || coach.browserAudioDisabled}
              />
              Hot mic
            </label>
            <Btn
              variant={coach.pttHeld ? "primary" : "ghost"}
              size="sm"
              disabled={!coach.connected || coach.hotMic || coach.browserAudioDisabled}
              onMouseDown={coach.startPushToTalk}
              onMouseUp={coach.stopPushToTalk}
              onMouseLeave={coach.stopPushToTalk}
              onTouchStart={coach.startPushToTalk}
              onTouchEnd={coach.stopPushToTalk}
            >
              Hold to talk
            </Btn>
          </div>
        </div>

        <div className="rounded-lg border border-border/15 bg-border/10 p-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-fg">Glasses native audio</span>
                <Badge color={coach.glassesAudio?.running ? coach.glassesAudio.connected ? "green" : "yellow" : "gray"}>
                  {coach.glassesAudio?.running ? coach.glassesAudio.connected ? "streaming" : "starting" : "off"}
                </Badge>
              </div>
              <p className="mt-1 text-[11px] text-muted">
                Streams the glasses microphone to Gemini Live and plays model audio back through the glasses speaker.
              </p>
              {coach.glassesAudio?.lastError && (
                <div className="mt-1 text-[11px] text-red-300">{coach.glassesAudio.lastError}</div>
              )}
            </div>
            {coach.glassesAudio?.running ? (
              <Btn variant="secondary" size="sm" loading={coach.glassesAudioChanging} onClick={coach.stopGlassesAudio}>
                Stop Glasses
              </Btn>
            ) : (
              <Btn
                variant="primary"
                size="sm"
                loading={coach.glassesAudioChanging}
                disabled={coach.demoMode === "static"}
                onClick={coach.startGlassesAudio}
              >
                Use Glasses
              </Btn>
            )}
          </div>
          <div className="mt-3 flex items-center justify-between text-[11px] text-muted">
            <span>{coach.glassesAudio?.chunksSent ? `${coach.glassesAudio.chunksSent} chunks sent` : "No mic chunks yet"}</span>
            <button className="hover:text-fg" onClick={coach.refreshGlassesAudio}>Refresh</button>
          </div>
        </div>
      </div>
    </Card>
  );
}

export default function LiveCopilotPanel({ connected }: LiveCopilotPanelProps) {
  const coach = useLiveCoachController({
    enabled: true,
    protocolId: "kitchen-tea-v1",
  });

  return (
    <div className="space-y-4">
      <Card glass className="overflow-hidden">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <SectionLabel>Live Copilot</SectionLabel>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-fg">Customize realtime guidance</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted">
              Configure the voice character, audio route, and experimental realtime transport before starting a hands-free protocol run.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge color={connected ? "green" : "yellow"}>{connected ? "glasses connected" : "glasses disconnected"}</Badge>
            <Badge color={coach.status.state === "connected" ? "green" : coach.status.state === "error" ? "red" : "blue"}>
              {coach.status.state}
            </Badge>
            <Badge color={coach.audioOwner === "glasses" ? "green" : coach.audioOwner === "browser" ? "blue" : "gray"}>
              {coach.audioOwner === "glasses" ? "glasses audio" : coach.audioOwner === "browser" ? "browser audio" : "no audio owner"}
            </Badge>
          </div>
        </div>

        {coach.health && (
          <div className="mt-4 rounded-lg border border-border/15 bg-bg/40 p-3 text-[11px] text-muted">
            <span className="font-mono text-subtle">{coach.health.model}</span>
            <span className="mx-2">&middot;</span>
            <span>{coach.health.apiVersion || "default api"}</span>
            <span className="mx-2">&middot;</span>
            <span>{coach.health.authMode || "auth unknown"}</span>
            <span className="mx-2">&middot;</span>
            <span>{coach.health.effectiveAudioRoute || coach.health.audioRoute}</span>
            <span className="mx-2">&middot;</span>
            <span>{coach.health.output}</span>
          </div>
        )}
      </Card>

      <ProtocolControlCard health={coach.health} />

      <Card>
        <CardHeader>
          <CardTitle sub="Samples are real Gemini TTS WAVs, generated on demand and cached locally">
            Voice Character
          </CardTitle>
        </CardHeader>
        <VoiceCharacterCard coach={coach} />
      </Card>

      <AudioRouteCard coach={coach} />

      <Card>
        <CardHeader>
          <CardTitle sub="Compare the current WebSocket bridge against the experimental WebRTC path">
            Realtime Transport
          </CardTitle>
        </CardHeader>
        <WebRtcExperimentCard webRtc={coach.webRtc} />
        {!coach.webRtc.config?.enabled && (
          <div className="rounded-lg border border-border/15 bg-border/10 p-3 text-xs text-muted">
            WebRTC experiments are disabled. Enable the feature flag to compare transport options.
          </div>
        )}
      </Card>

      {coach.transcript.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle sub="Recent browser-session copilot messages">Transcript</CardTitle>
          </CardHeader>
          <div className="max-h-56 overflow-auto rounded-lg border border-border bg-bg2 p-3 text-[11px] leading-relaxed">
            {coach.transcript.map((line, index) => (
              <div key={index} className="text-muted">{line}</div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
