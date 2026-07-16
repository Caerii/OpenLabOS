import { postFormJson, postJson, request } from "./core";

export interface OtaVersionInfo {
  versionName: string;
  versionCode: string;
  lastUpdate: string;
}

export interface OtaUploadResult {
  filename: string;
  size: number;
  tempPath: string;
}

export const otaCurrent = () => request<OtaVersionInfo>("/api/ota/current");

export async function otaUpload(file: File): Promise<OtaUploadResult> {
  const form = new FormData();
  form.append("apk", file);
  return postFormJson("/api/ota/upload", form);
}

export const otaInstall = (tempPath: string) =>
  postJson<{ success: boolean; output: string }>("/api/ota/install", { tempPath });
