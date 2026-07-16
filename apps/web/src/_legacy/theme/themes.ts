export type ThemeId = "light" | "dark";

export const THEMES: { id: ThemeId; label: string }[] = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
];

export const DEFAULT_THEME: ThemeId = "dark";

export const THEME_STORAGE_KEY = "labos.theme";

