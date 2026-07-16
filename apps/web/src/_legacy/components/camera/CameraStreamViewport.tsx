import type { RefObject } from "react";
import { ResilientPreviewStream } from "../preview/ResilientPreviewStream";
import type { CameraPreviewStatus } from "./types";

export function CameraStreamViewport({
  imgRef,
  frameCount,
  status,
}: {
  imgRef: RefObject<HTMLImageElement>;
  frameCount: number;
  status: CameraPreviewStatus;
}) {
  return (
    <div className="card flex items-center justify-center min-h-[300px]">
      {status === "streaming" ? (
        <ResilientPreviewStream
          connected
          streaming
          frameCount={frameCount}
          imgRef={imgRef}
          alt="MJPEG camera stream"
          className="w-full max-w-[760px] rounded"
          imageClassName="h-full max-h-[500px] w-full rounded object-contain"
          errorMessage="Stream connection stalled. Reconnecting the camera preview."
          waitingMessage="Waiting for the preview server to deliver frames."
        />
      ) : (
        <p className="text-muted">
          {status === "idle" ? "No preview active - click Start Stream" : "Connecting..."}
        </p>
      )}
    </div>
  );
}
