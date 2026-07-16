import type { StreamConfig } from "../../api";
import type { CameraPreviewStatus } from "./types";

export function PreviewInfoFooter({
  status,
  streamConfig,
}: {
  status: CameraPreviewStatus;
  streamConfig: StreamConfig;
}) {
  if (status !== "streaming") return null;
  return (
    <div className="text-xs text-muted text-center">
      MJPEG stream via on-device HTTP server (port 8089) - ADB port forwarding active
      {" | "}YUV to JPEG software encoding at {streamConfig.stream_width}x{streamConfig.stream_height}
    </div>
  );
}
