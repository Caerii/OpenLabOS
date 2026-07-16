import { Badge, Btn } from "../ui";
import type { LiveCoachController } from "../kitchen/liveCoach/useLiveCoachController";

interface VoiceCharacterCardProps {
  coach: LiveCoachController;
  compact?: boolean;
}

export default function VoiceCharacterCard({ coach, compact }: VoiceCharacterCardProps) {
  if (!coach.voiceOptions.length) return null;
  const locked = coach.status.state === "connected" || coach.status.state === "connecting" || coach.glassesAudio?.running;
  const selectedSampleVoice = coach.voiceName || "default";

  return (
    <div className="rounded-lg border border-border/15 bg-border/10 p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-fg">Voice character</span>
            <Badge color={coach.voiceName ? "green" : "gray"}>{coach.voiceName || "model default"}</Badge>
          </div>
          <div className="mt-1 text-[11px] text-muted">
            Select the Gemini Live voice before starting a session. Active sessions must be stopped before switching character.
          </div>
          {coach.voiceError && <div className="mt-1 text-[11px] text-red-300">{coach.voiceError}</div>}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <select
            className="min-w-56 rounded-lg border border-border bg-bg2 px-3 py-2 text-xs text-fg disabled:opacity-60"
            value={coach.voiceName || ""}
            disabled={locked || coach.voiceChanging}
            onChange={(event) => coach.changeVoice(event.target.value || null)}
          >
            <option value="">Default - Despina</option>
            {coach.voiceOptions.map((voice) => (
              <option key={voice.name} value={voice.name}>
                {voice.name} - {voice.character} ({voice.style})
              </option>
            ))}
          </select>
          <Btn
            variant="ghost"
            size="sm"
            loading={!!coach.voiceSampleLoading}
            disabled={!!coach.voiceSampleLoading}
            onClick={() => coach.playVoiceSample(selectedSampleVoice)}
          >
            {coach.voiceSamplePlaying === selectedSampleVoice ? "Playing" : "Sample"}
          </Btn>
        </div>
      </div>

      <details className="mt-3" open={!compact}>
        <summary className="cursor-pointer text-[11px] text-muted">
          Hear all voice characters
        </summary>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {coach.voiceOptions.map((voice) => (
            <button
              key={voice.name}
              className="rounded-lg border border-border/15 bg-bg/40 p-2 text-left hover:bg-border/10 disabled:opacity-60"
              disabled={!!coach.voiceSampleLoading}
              onClick={() => coach.playVoiceSample(voice.name)}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-fg">{voice.isDefault ? "Default - Despina" : voice.name}</span>
                <span className="text-[10px] text-muted">
                  {coach.voiceSampleLoading === voice.name
                    ? "loading"
                    : coach.voiceSamplePlaying === voice.name
                      ? "playing"
                      : voice.sampleCached
                        ? "cached"
                        : "generate"}
                </span>
              </div>
              <div className="mt-0.5 text-[10px] text-subtle">{voice.character} - {voice.style}</div>
            </button>
          ))}
        </div>
      </details>
    </div>
  );
}
