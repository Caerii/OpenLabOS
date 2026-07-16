import { Badge, Btn, Card, SectionLabel } from "../ui/index";
import type { CoachAutoCue } from "./guided";
import {
  eventsUrlForRecording,
  outputUrlForRecording,
} from "./liveCoach/scenarios";
import type { CoachRecording, CoachScenario, DemoMode } from "./liveCoach/types";
import { useLiveCoachController } from "./liveCoach/useLiveCoachController";
import VoiceCharacterCard from "../liveCopilot/VoiceCharacterCard";
import WebRtcExperimentCard from "../liveCopilot/WebRtcExperimentCard";

function ScenarioCueButton({
  scenario,
  demoMode,
  running,
  onRun,
}: {
  scenario: CoachScenario;
  demoMode: DemoMode;
  running: boolean;
  onRun: (id: string) => void;
}) {
  return (
    <button
      className="text-left rounded-lg border border-border/15 bg-border/10 p-2 hover:bg-border/15 transition-colors disabled:opacity-50"
      disabled={running}
      onClick={() => onRun(scenario.id)}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-fg">{scenario.title}</span>
        {running && (
          <span className="text-[10px] text-muted">{demoMode === "static" ? "playing" : "running"}</span>
        )}
      </div>
      <div className="text-[10px] text-subtle uppercase tracking-wide mt-0.5">
        {scenario.category}{scenario.stepNumber ? ` - step ${scenario.stepNumber}` : ""}
      </div>
    </button>
  );
}

function ScenarioCueGrid({
  scenarios,
  demoMode,
  scenarioRunning,
  onRun,
}: {
  scenarios: CoachScenario[];
  demoMode: DemoMode;
  scenarioRunning: string;
  onRun: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {scenarios.map((scenario) => (
        <ScenarioCueButton
          key={scenario.id}
          scenario={scenario}
          demoMode={demoMode}
          running={scenarioRunning === scenario.id}
          onRun={onRun}
        />
      ))}
    </div>
  );
}

function RecentRecording({
  recording,
}: {
  recording: CoachRecording;
}) {
  return (
    <div className="rounded-lg border border-border/15 bg-border/10 p-2">
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="min-w-0">
          <div className="text-xs text-fg truncate">{recording.title || recording.scenarioId || recording.id}</div>
          <div className="text-[10px] text-subtle">{new Date(recording.startedAt).toLocaleString()} - {recording.eventCount} events</div>
        </div>
        <a
          className="text-[11px] text-good-fg hover:text-highlight"
          href={eventsUrlForRecording(recording)}
          target="_blank"
          rel="noreferrer"
        >
          events
        </a>
      </div>
      {(recording.outputWav || recording.outputUrl || recording.staticBaseUrl) && (
        <audio
          className="w-full h-8"
          controls
          src={outputUrlForRecording(recording)}
        />
      )}
    </div>
  );
}

export default function LiveCoachPanel({
  enabled,
  protocolId = "kitchen-tea-v1",
  currentStepNumber,
  autoCue,
  showTransportControls = true,
}: {
  enabled: boolean;
  protocolId?: string;
  currentStepNumber?: number | null;
  autoCue?: CoachAutoCue | null;
  showTransportControls?: boolean;
}) {
  const coach = useLiveCoachController({
    enabled,
    protocolId,
    currentStepNumber,
    autoCue,
  });

  return (
    <Card>
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <SectionLabel>Voice Coach</SectionLabel>
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-fg">Gemini Live</span>
            <Badge color={coach.status.state === "connected" ? "green" : coach.status.state === "error" ? "red" : "blue"}>
              {coach.status.state}
            </Badge>
            <Badge color={coach.audioOwner === "glasses" ? "green" : coach.audioOwner === "browser" ? "blue" : "gray"}>
              {coach.audioOwner === "glasses" ? "glasses audio" : coach.audioOwner === "browser" ? "browser audio" : "no audio owner"}
            </Badge>
            {coach.demoMode === "static" && <Badge color="blue">static replay</Badge>}
            {coach.health && (
              <Badge color={coach.health.configured ? "green" : "yellow"}>
                {coach.health.configured ? "configured" : coach.demoMode === "static" ? "replay fallback" : "missing auth"}
              </Badge>
            )}
            {coach.status.state === "connected" && "model" in coach.status && (
              <span className="text-[11px] text-muted">{coach.status.model}</span>
            )}
          </div>
        </div>

        {showTransportControls && (
          <div className="flex items-center gap-2">
            {!coach.connected ? (
              <Btn
                variant="primary"
                size="sm"
                disabled={coach.demoMode === "static" || coach.browserAudioDisabled}
                onClick={() => { coach.connect(); }}
              >
                Use Browser Audio
              </Btn>
            ) : (
              <Btn variant="secondary" size="sm" onClick={coach.stop}>
                Stop Browser
              </Btn>
            )}
          </div>
        )}
      </div>

      {showTransportControls ? (
        <div className="flex items-center gap-3 mb-3">
        <label className="flex items-center gap-2 text-xs text-muted select-none">
          <input
            type="checkbox"
            checked={coach.hotMic}
            onChange={(event) => coach.setHotMic(event.target.checked)}
            disabled={!coach.connected || coach.demoMode === "static" || coach.browserAudioDisabled}
          />
          Hot mic (VAD)
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

        <span className="text-[11px] text-muted">
          {coach.browserAudioDisabled
            ? "Glasses own the Live session; browser mic is disabled to avoid stealing audio output."
            : coach.hotMic ? "Streaming mic continuously." : "Push-to-talk by holding the button."}
        </span>
        </div>
      ) : (
        <div className="mb-3 rounded-lg border border-highlight-border/20 bg-highlight-bg/10 p-2 text-[11px] text-good-fg">
          Voice transport is managed by the guided hands-free controls. Start Hands-Free Run starts glasses mic and playback automatically.
        </div>
      )}

      {showTransportControls && (
        <div className="mb-3 rounded-lg border border-border/15 bg-border/10 p-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-fg">Glasses native audio</span>
              <Badge color={coach.glassesAudio?.running ? coach.glassesAudio.connected ? "green" : "yellow" : "gray"}>
                {coach.glassesAudio?.running ? coach.glassesAudio.connected ? "streaming" : "starting" : "off"}
              </Badge>
            </div>
            <div className="mt-1 text-[11px] text-muted">
              Streams the glasses microphone to Gemini Live and plays model PCM audio on the glasses.
              {coach.glassesAudio?.chunksSent ? ` ${coach.glassesAudio.chunksSent} chunks sent.` : ""}
              {coach.connected && !coach.glassesAudio?.running ? " Starting glasses audio will stop browser audio first." : ""}
            </div>
            {coach.glassesAudio?.lastError && (
              <div className="mt-1 text-[11px] text-red-300">{coach.glassesAudio.lastError}</div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {coach.glassesAudio?.running ? (
              <Btn variant="secondary" size="sm" loading={coach.glassesAudioChanging} onClick={coach.stopGlassesAudio}>
                Stop Glasses Mic
              </Btn>
            ) : (
              <Btn
                variant="primary"
                size="sm"
                loading={coach.glassesAudioChanging}
                disabled={coach.demoMode === "static"}
                onClick={coach.startGlassesAudio}
              >
                Use Glasses Mic
              </Btn>
            )}
            <button className="text-[11px] text-muted hover:text-fg" onClick={coach.refreshGlassesAudio}>
              Refresh
            </button>
          </div>
        </div>
        </div>
      )}

      {coach.health && (
        <div className="mb-3 rounded-lg border border-border/15 bg-border/10 p-2 text-[11px] text-muted">
          <span className="font-mono text-subtle">{coach.health.model}</span>
          <span className="mx-2">&middot;</span>
          <span>{coach.health.apiVersion || "default api"}</span>
          <span className="mx-2">&middot;</span>
          <span>{coach.health.audioRoute}</span>
          <span className="mx-2">&middot;</span>
          <span>{coach.health.output}</span>
          {coach.health.recordingsEnabled && (
            <>
              <span className="mx-2">&middot;</span>
              <span>recording to {coach.health.recordingsDir}</span>
            </>
          )}
        </div>
      )}

      <div className="mb-3">
        <VoiceCharacterCard coach={coach} compact />
      </div>

      <div className="mb-3">
        <WebRtcExperimentCard webRtc={coach.webRtc} />
      </div>

      {coach.primaryScenarios.length > 0 && (
        <div className="mb-3">
          <SectionLabel>{coach.demoMode === "static" ? "Calm Replay Cues" : "Calm Coach Cues"}</SectionLabel>
          <div className="mb-2 rounded-lg border border-border/15 bg-border/10 p-2 text-[11px] text-muted">
            Auto-cues are throttled so the coach speaks at step starts, confirmations, uncertainty, and deviations without narrating every frame.
          </div>
          <ScenarioCueGrid
            scenarios={coach.primaryScenarios}
            demoMode={coach.demoMode}
            scenarioRunning={coach.scenarioRunning}
            onRun={coach.runScenario}
          />
          {coach.advancedScenarios.length > 0 && (
            <details className="mt-2 rounded-lg border border-border/15 bg-border/10">
              <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-fg">
                Other step cues ({coach.advancedScenarios.length})
              </summary>
              <div className="border-t border-border/15 p-2">
                <ScenarioCueGrid
                  scenarios={coach.advancedScenarios}
                  demoMode={coach.demoMode}
                  scenarioRunning={coach.scenarioRunning}
                  onRun={coach.runScenario}
                />
              </div>
            </details>
          )}
        </div>
      )}

      {coach.transcript.length > 0 ? (
        <div className="max-h-40 overflow-auto rounded-lg border border-border bg-bg2 p-2 text-[11px] leading-relaxed">
          {coach.transcript.map((line, index) => (
            <div key={index} className="text-muted">{line}</div>
          ))}
        </div>
      ) : (
        <div className="text-[11px] text-muted">
          {coach.demoMode === "static"
            ? "Choose a replay scenario to hear pre-generated Gemini Live feedback without keys."
            : "Start the coach, then hold-to-talk or enable hot mic."}
        </div>
      )}

      {coach.recordings.length > 0 && (
        <div className="mt-3">
          <div className="flex items-center justify-between mb-2">
            <SectionLabel>Recent Recordings</SectionLabel>
            <button className="text-[11px] text-muted hover:text-fg" onClick={coach.refreshRecordings}>Refresh</button>
          </div>
          <div className="space-y-2">
            {coach.recordings.map((recording) => (
              <RecentRecording key={recording.id} recording={recording} />
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
