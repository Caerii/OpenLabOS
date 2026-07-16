import { FileState } from "@google/genai";
import { createGoogleGenAI } from "../google-genai-client.js";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface UploadedGeminiVideoFile {
  uri: string;
  name: string;
  cleanup: () => Promise<void>;
}

export async function uploadGeminiVideoFile(opts: {
  videoFilePath: string;
  mimeType?: string;
  displayName?: string;
}): Promise<UploadedGeminiVideoFile> {
  const ai = createGoogleGenAI();
  const uploaded = await ai.files.upload({
    file: opts.videoFilePath,
    config: {
      mimeType: opts.mimeType || "video/mp4",
      displayName: opts.displayName || "labos-live-preview-chunk",
    },
  });
  if (!uploaded.name) {
    throw new Error("Gemini file upload returned no file name");
  }

  let file = uploaded;
  for (let attempt = 0; attempt < 12; attempt++) {
    if (file.state === FileState.ACTIVE || file.state === undefined) break;
    if (file.state === FileState.FAILED) {
      throw new Error(file.error?.message || "Gemini file processing failed");
    }
    await sleep(500);
    file = await ai.files.get({ name: uploaded.name });
  }
  if (file.state === FileState.FAILED) {
    throw new Error(file.error?.message || "Gemini file processing failed");
  }
  if (!file.uri) {
    throw new Error("Gemini file upload returned no file URI");
  }

  return {
    uri: file.uri,
    name: uploaded.name,
    cleanup: async () => {
      await ai.files.delete({ name: uploaded.name! }).catch(() => {});
    },
  };
}
