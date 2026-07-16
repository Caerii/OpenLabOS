import { postFormJson, postJson, request } from "./core";

export interface AdbDevice {
  serial: string;
  status: string;
  model?: string;
  product?: string;
}

export const deviceStatus = () =>
  request<{ connected: boolean; device?: string; ip?: string; devices?: AdbDevice[]; targetDevice?: string | null }>(
    "/api/device/status",
  );
export const deviceList = () =>
  request<{ devices: AdbDevice[]; targetDevice: string | null }>("/api/device/list");
export const deviceSelect = (serial: string | null) =>
  postJson<{ success: boolean; targetDevice: string | null; model?: string }>("/api/device/select", { serial });
export const deviceConnect = (ip: string) =>
  postJson<{ success: boolean; output: string }>("/api/device/connect", { ip });
export const deviceDisconnect = () =>
  postJson<{ success: boolean; output: string }>("/api/device/disconnect");
export const deviceInfo = () => request<Record<string, string>>("/api/device/info");
export const deviceScan = () => postJson<{ devices: string[] }>("/api/device/scan");

export const listApps = (filter?: string) =>
  request<{ packages: string[] }>(filter ? `/api/apps?filter=${filter}` : "/api/apps");
export const appInfo = (pkg: string) => request<any>(`/api/apps/${pkg}`);
export const uninstallApp = (packageName: string) =>
  postJson<{ success: boolean; output: string }>("/api/apps/uninstall", { packageName });
export const launchApp = (packageName: string, activity?: string) =>
  postJson<{ success: boolean; output: string }>("/api/apps/launch", { packageName, activity });
export const stopApp = (packageName: string) =>
  postJson<{ success: boolean; output: string }>("/api/apps/stop", { packageName });

export async function installApk(file: File): Promise<{ success: boolean; output: string }> {
  const form = new FormData();
  form.append("apk", file);
  return postFormJson("/api/apps/install", form);
}

export interface LabosModule {
  name: string;
  pkg: string;
  installed: boolean;
  apkExists: boolean;
  apkPath?: string;
  apkSource?: "build" | "prebuilt";
  buildApkExists?: boolean;
  prebuiltApkExists?: boolean;
  installedVersionCode?: number | null;
  installedVersionName?: string | null;
  builtVersionCode?: number | null;
  builtVersionName?: string | null;
  builtCertSha256?: string | null;
  installedSignatureSummary?: string | null;
  isLatest?: boolean;
  needsUpdate?: boolean;
}

export interface LabosStatusResult {
  isDeviceOwner: boolean;
  isInstalled: boolean;
  isRunning: boolean;
  packageName: string;
  modules?: LabosModule[];
}

export const labosStatus = () => request<LabosStatusResult>("/api/labos/status");
export const labosActivate = () => postJson<{ success: boolean; output: string }>("/api/labos/activate");
export const labosDeactivate = () => postJson<{ success: boolean; output: string }>("/api/labos/deactivate");
export const labosDeploy = (module?: string) =>
  postJson<{ success: boolean; results: { name: string; success: boolean; output: string; code?: string; needsSignatureReset?: boolean }[] }>(
    "/api/labos/deploy",
    { module: module || "all", preferPrebuilt: true },
  );
export const labosLaunch = () => postJson<{ success: boolean; output: string }>("/api/labos/launch");
export const labosStop = () => postJson<{ success: boolean; output: string }>("/api/labos/stop");
