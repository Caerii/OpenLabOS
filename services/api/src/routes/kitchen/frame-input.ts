/**
 * Frame materialization helpers for Kitchen route handlers.
 */

import { getKitchenRouteDeps } from "./deps.js";

export async function resolveFrameInput(body: any) {
  const { modelId, frameBuffer, testImageUrl } = getKitchenRouteDeps().extractEROptions(body);
  return {
    modelId,
    testImageUrl,
    frameBuffer: frameBuffer ?? (testImageUrl ? undefined : await getKitchenRouteDeps().captureFrame()),
  };
}

export async function saveFrameIfPresent(frameBuffer: Buffer | undefined, prefix: string) {
  return frameBuffer ? getKitchenRouteDeps().saveKitchenFrame(frameBuffer, { prefix }) : undefined;
}

export async function materializeFrameBuffer(frameBuffer: Buffer | undefined, testImageUrl?: string) {
  if (frameBuffer) return frameBuffer;
  if (!testImageUrl) return undefined;

  const response = await fetch(testImageUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch test image: ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

