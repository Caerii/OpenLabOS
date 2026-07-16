import { useCallback, useEffect, useRef, useState } from "react";
import {
  avc1CodecStringFromSps,
  extractParameterSets,
  splitAnnexBNals,
} from "@openlabos/preview/browser";

const SILENT_RECONNECT_MS = 12_000;
const ERROR_RECONNECT_MS = 2_500;

type Props = {
  src: string;
  connected: boolean;
  streaming: boolean;
  className?: string;
  fetchHeaders?: Record<string, string>;
  onFrame?: () => void;
  onError?: (message: string) => void;
};

/** Low-latency H.264 preview via WebCodecs VideoDecoder + Annex-B over HTTP. */
export function H264AnnexBPlayer({
  src,
  connected,
  streaming,
  className = "h-full w-full object-contain",
  fetchHeaders = {},
  onFrame,
  onError,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [decodeError, setDecodeError] = useState<string | null>(null);
  const versionRef = useRef(0);

  const startStream = useCallback(async (streamUrl: string, signal: AbortSignal) => {
    if (typeof VideoDecoder === "undefined") {
      throw new Error("WebCodecs VideoDecoder not available");
    }

    const decoder = new VideoDecoder({
      output: (frame) => {
        const canvas = canvasRef.current;
        if (canvas) {
          canvas.width = frame.displayWidth;
          canvas.height = frame.displayHeight;
          const ctx = canvas.getContext("2d");
          ctx?.drawImage(frame, 0, 0);
        }
        onFrame?.();
        frame.close();
      },
      error: (e) => {
        setDecodeError(e.message);
        onError?.(e.message);
      },
    });

    let configured = false;
    let timestampUs = 0;
    const buffer: Uint8Array[] = [];
    let pending = new Uint8Array(0);

    const response = await fetch(streamUrl, { cache: "no-store", signal, headers: fetchHeaders });
    if (!response.ok || !response.body) {
      throw new Error(`H.264 stream HTTP ${response.status}`);
    }

    const reader = response.body.getReader();
    while (!signal.aborted) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value?.length) continue;

      const merged = new Uint8Array(pending.length + value.length);
      merged.set(pending, 0);
      merged.set(value, pending.length);
      pending = merged;

      const nals = splitAnnexBNals(pending);
      if (!nals.length) continue;

      const { sps, pps } = extractParameterSets(nals);
      if (!configured && sps && pps) {
        const codec = avc1CodecStringFromSps(sps);
        const description = new Uint8Array(11 + sps.length + pps.length);
        description[0] = 1;
        description[1] = sps[1]!;
        description[2] = sps[2]!;
        description[3] = sps[3]!;
        description[4] = 0xff;
        description[5] = 0xe1;
        description[6] = (sps.length >> 8) & 0xff;
        description[7] = sps.length & 0xff;
        description.set(sps, 8);
        let o = 8 + sps.length;
        description[o++] = 1;
        description[o++] = (pps.length >> 8) & 0xff;
        description[o++] = pps.length & 0xff;
        description.set(pps, o);
        decoder.configure({
          codec,
          description,
          optimizeForLatency: true,
          hardwareAcceleration: "prefer-hardware",
        });
        configured = true;
      }

      for (const nal of nals) {
        if (nal.type === 7 || nal.type === 8) continue;
        if (!configured) continue;
        const chunk = new EncodedVideoChunk({
          type: nal.keyFrame ? "key" : "delta",
          timestamp: timestampUs,
          data: nal.data,
        });
        decoder.decode(chunk);
        timestampUs += 33_333;
      }

      buffer.push(pending);
      if (buffer.length > 4) buffer.shift();
      pending = new Uint8Array(0);
    }

    if (decoder.state !== "closed") {
      await decoder.flush().catch(() => undefined);
      decoder.close();
    }
  }, [fetchHeaders, onError, onFrame]);

  useEffect(() => {
    if (!connected || !streaming) {
      setDecodeError(null);
      return;
    }

    const ac = new AbortController();
    const url = `${src}${src.includes("?") ? "&" : "?"}v=${++versionRef.current}`;

    startStream(url, ac.signal).catch((error: unknown) => {
      if (ac.signal.aborted) return;
      const message = error instanceof Error ? error.message : String(error);
      setDecodeError(message);
      onError?.(message);
    });

    return () => ac.abort();
  }, [connected, streaming, src, startStream, onError]);

  if (!connected) return null;

  return (
    <>
      <canvas ref={canvasRef} className={className} />
      {decodeError && (
        <div className="absolute inset-x-3 bottom-3 rounded-lg border border-amber-300/50 bg-black/75 p-2 text-[11px] text-white">
          H.264 decode: {decodeError}
        </div>
      )}
    </>
  );
}

export function webCodecsH264Supported(): boolean {
  return typeof VideoDecoder !== "undefined";
}

export { SILENT_RECONNECT_MS, ERROR_RECONNECT_MS };
