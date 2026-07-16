import { putJson, request } from "./core";

export const buttonMappings = () =>
  request<{ mappings: Record<string, string> }>("/api/buttons/mappings");
export const updateButtonMappings = (mappings: Record<string, string>) =>
  putJson<{ success: boolean; mappings: Record<string, string> }>("/api/buttons/mappings", {
    mappings,
  });
export const buttonActions = () => request<{ actions: string[] }>("/api/buttons/actions");
