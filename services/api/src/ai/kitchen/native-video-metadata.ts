import { spawn } from "child_process";

export interface KitchenNativeVideoMetadata {
  durationSec?: number;
  width?: number;
  height?: number;
  codecName?: string;
  avgFps?: number;
  bitRate?: number;
}

function finitePositiveNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : undefined;
}

function parseRatio(value: unknown) {
  if (typeof value !== "string") return undefined;
  const [rawNumerator, rawDenominator] = value.split("/");
  const numerator = Number(rawNumerator);
  const denominator = Number(rawDenominator);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return undefined;
  const ratio = numerator / denominator;
  return Number.isFinite(ratio) && ratio > 0 ? Number(ratio.toFixed(3)) : undefined;
}

export function parseFfprobeVideoMetadata(raw: string): KitchenNativeVideoMetadata | null {
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const videoStream = Array.isArray(parsed?.streams)
    ? parsed.streams.find((stream: any) => stream?.codec_type === "video") || parsed.streams[0]
    : null;
  if (!videoStream) return null;
  const durationSec = finitePositiveNumber(videoStream.duration) ?? finitePositiveNumber(parsed?.format?.duration);
  const bitRate = finitePositiveNumber(videoStream.bit_rate) ?? finitePositiveNumber(parsed?.format?.bit_rate);
  return {
    durationSec,
    width: finitePositiveNumber(videoStream.width),
    height: finitePositiveNumber(videoStream.height),
    codecName: typeof videoStream.codec_name === "string" ? videoStream.codec_name : undefined,
    avgFps: parseRatio(videoStream.avg_frame_rate) ?? parseRatio(videoStream.r_frame_rate),
    bitRate,
  };
}

function runProcess(command: string, args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`${command} timed out`));
    }, timeoutMs);

    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout);
      else reject(new Error(`${command} failed with exit code ${code}: ${stderr.slice(-800)}`));
    });
  });
}

export async function probeNativeVideoMetadata(videoPath: string): Promise<KitchenNativeVideoMetadata | undefined> {
  const output = await runProcess(
    "ffprobe",
    [
      "-v",
      "error",
      "-print_format",
      "json",
      "-show_format",
      "-show_streams",
      videoPath,
    ],
    30_000,
  );
  const metadata = parseFfprobeVideoMetadata(output);
  if (!metadata) return undefined;
  return metadata;
}
