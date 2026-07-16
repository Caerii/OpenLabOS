import { Badge, Btn } from "../ui";
import type { LiveCoachController } from "../kitchen/liveCoach/useLiveCoachController";

interface WebRtcExperimentCardProps {
  webRtc: LiveCoachController["webRtc"];
}

export default function WebRtcExperimentCard({ webRtc }: WebRtcExperimentCardProps) {
  const config = webRtc.config;
  if (!config?.enabled) return null;
  const latest = webRtc.latest;

  return (
    <div className="rounded-lg border border-cyan-400/20 bg-cyan-500/10 p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-fg">Experimental WebRTC</span>
            <Badge color={config.transportReady ? "green" : "yellow"}>
              {config.activeProvider}
            </Badge>
            <Badge color={webRtc.state === "connected" ? "green" : webRtc.state === "error" ? "red" : "blue"}>
              {webRtc.state}
            </Badge>
          </div>
          <div className="mt-1 text-[11px] text-muted">
            Opus target {Math.round(config.audioBitrateBps / 1000)} kbps vs current PCM/WebSocket estimate{" "}
            {config.estimates.websocketJsonBase64Kbps} kbps. {config.estimates.expectedReduction}.
          </div>
          {!config.transportReady && config.mode !== "loopback" && (
            <div className="mt-1 text-[11px] text-yellow-200">
              No WebRTC gateway configured yet; this runs a local capture/SDP probe only.
            </div>
          )}
          {webRtc.message && <div className="mt-1 text-[11px] text-subtle">{webRtc.message}</div>}
          {latest && (
            <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-muted sm:grid-cols-4">
              <span>up {latest.bitrateSentKbps ?? 0} kbps</span>
              <span>down {latest.bitrateReceivedKbps ?? 0} kbps</span>
              <span>rtt {latest.rttMs ?? 0} ms</span>
              <span>jitter {latest.jitterMs ?? 0} ms</span>
            </div>
          )}
          <details className="mt-2">
            <summary className="cursor-pointer text-[11px] text-cyan-100">
              Compare providers ({config.providers.length})
            </summary>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {config.providers.map((provider) => (
                <div
                  key={provider.id}
                  className="rounded-md border border-cyan-400/15 bg-bg/35 p-2 text-[10px] text-muted"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-fg">{provider.label}</span>
                    <Badge color={provider.id === config.activeProvider ? "green" : provider.signalingReady ? "blue" : provider.configured ? "yellow" : "gray"}>
                      {provider.id === config.activeProvider ? "active" : provider.signalingReady ? "ready" : provider.configured ? "local" : "needs gateway"}
                    </Badge>
                  </div>
                  <div className="mt-1">{provider.transport}</div>
                  <a className="mt-1 inline-block text-cyan-200 hover:text-cyan-100" href={provider.docsUrl} target="_blank" rel="noreferrer">
                    provider docs
                  </a>
                </div>
              ))}
            </div>
          </details>
        </div>
        <div className="flex items-center gap-2">
          {webRtc.state === "idle" || webRtc.state === "error" ? (
            <Btn variant="secondary" size="sm" onClick={webRtc.start}>
              {config.activeProvider === "livekit" ? "Start LiveKit Room" : "Start WebRTC Probe"}
            </Btn>
          ) : (
            <Btn variant="ghost" size="sm" onClick={webRtc.stop}>
              Stop WebRTC
            </Btn>
          )}
        </div>
      </div>
    </div>
  );
}
