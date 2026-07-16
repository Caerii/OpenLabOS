import { postJson, request } from "./core";

export const consoleSend = (command: string) =>
  postJson<{ success: boolean; lines: string[] }>("/api/console/send", { command });
export const consoleHistory = () => request<{ lines: string[] }>("/api/console/history");
export const consoleClear = () => postJson<{ success: boolean }>("/api/console/clear");
