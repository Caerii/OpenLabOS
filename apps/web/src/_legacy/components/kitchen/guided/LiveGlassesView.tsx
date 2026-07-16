import { Badge, Card, SectionLabel } from "../../ui/index";
import { ResilientPreviewStream } from "../../preview/ResilientPreviewStream";
import { formatPreviewLatency, usePreviewFrameLatency } from "../../preview/usePreviewFrameLatency";

export function LiveGlassesView({
  connected,
  previewReady,
  frameCount,
  fps,
  variant = "default",
}: {
  connected: boolean;
  previewReady: boolean;
  frameCount: number;
  fps: number;
  variant?: "default" | "console";
}) {
  const latencyMs = usePreviewFrameLatency(connected && previewReady);
  const metricsReady = previewReady && latencyMs !== null;

  if (variant === "console") {
    return (
      <>
        <div className="oc-viewport-head">
          <span>
            <strong>Operator view</strong>
          </span>
          <span className="oc-viewport-metrics">
            {previewReady ? (
              <>
                <span data-live="true">{fps.toFixed(1)} fps</span>
                <span>{formatPreviewLatency(latencyMs)}</span>
                <span>{frameCount.toLocaleString()} frames</span>
              </>
            ) : (
              <span>Awaiting stream</span>
            )}
          </span>
        </div>
        <div className="oc-viewport-clip">
          <ResilientPreviewStream
            connected={connected}
            streaming={previewReady}
            frameCount={frameCount}
            latencyMs={latencyMs}
            showStreamMetrics
            waitingMessage="Start preview on the glasses. The protocol should not advance until frames are live."
            disconnectedMessage="Connect glasses to open the operator view."
            className="!aspect-[16/10] sm:!aspect-video"
          />
        </div>
      </>
    );
  }

  return (
    <Card padding="none" className="overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-border/15 p-3">
        <div>
          <SectionLabel>Live Glasses View</SectionLabel>
          <p className="text-xs text-muted">Keep this visible during the demo so the operator can confirm what the glasses see.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge color={previewReady ? "green" : "yellow"}>{previewReady ? "streaming" : "waiting"}</Badge>
          <Badge color="gray">live only</Badge>
          <Badge color="gray">{fps.toFixed(1)} fps</Badge>
          <Badge color={metricsReady ? "blue" : "gray"}>{formatPreviewLatency(latencyMs)}</Badge>
        </div>
      </div>
      <ResilientPreviewStream
        connected={connected}
        streaming={previewReady}
        frameCount={frameCount}
        latencyMs={latencyMs}
        showStreamMetrics
        waitingMessage="Start preview and keep this panel open. The run should not start until frame count increases."
        disconnectedMessage="Connect glasses to view the camera stream."
        showCornerLabel
      />
    </Card>
  );
}
