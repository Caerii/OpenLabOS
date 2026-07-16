import { getBase, mergeWifiAuth, postJson, request } from "./core";

export const systemReboot = () => postJson<{ success: boolean }>("/api/system/reboot");

export async function systemScreenshot(): Promise<string> {
  const res = await fetch(`${getBase()}/api/system/screenshot`, {
    method: "POST",
    headers: mergeWifiAuth({}),
  });
  if (!res.ok) throw new Error("Screenshot failed");
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export const systemShell = (command: string) =>
  request<{ output: string }>("/api/system/shell", {
    method: "POST",
    body: JSON.stringify({ command }),
  });
