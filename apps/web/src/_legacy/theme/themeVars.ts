import type { ThemeId } from "./themes";

/** CSS custom property values (space-separated RGB channels). */
export const THEME_CSS_VARS: Record<ThemeId, Record<string, string>> = {
  dark: {
    "--surface-0": "8 12 10",
    "--surface-1": "13 20 16",
    "--surface-2": "17 25 22",
    "--surface-3": "23 32 25",
    "--surface-4": "29 42 34",
    "--fg": "232 240 236",
    "--muted": "164 178 172",
    "--subtle": "118 132 126",
    "--border": "255 255 255",
    "--ring": "16 185 129",
    "--accent": "16 185 129",
    "--accent-text": "52 211 153",
    "--accent-fg": "3 7 18",
    "--overlay": "255 255 255",
    "--overlay-hover": "255 255 255",
    "--highlight": "52 211 153",
    "--highlight-bg": "16 185 129",
    "--highlight-border": "16 185 129",
    "--good-fg": "52 211 153",
    "--good-bg": "16 185 129",
    "--good-border": "16 185 129",
    "--warn-fg": "252 211 77",
    "--warn-bg": "245 158 11",
    "--warn-border": "245 158 11",
    "--bad-fg": "248 113 113",
    "--bad-bg": "239 68 68",
    "--bad-border": "239 68 68",
    "--info-fg": "96 165 250",
    "--info-bg": "59 130 246",
    "--info-border": "59 130 246",
    "--shadow-color": "0 0 0",
    "--viewport-bg": "0 0 0",
  },
  light: {
    "--surface-0": "248 250 252",
    "--surface-1": "241 245 249",
    "--surface-2": "255 255 255",
    "--surface-3": "248 250 252",
    "--surface-4": "241 245 249",
    "--fg": "15 23 42",
    "--muted": "51 65 85",
    "--subtle": "71 85 105",
    "--border": "15 23 42",
    "--ring": "16 185 129",
    "--accent": "16 185 129",
    "--accent-text": "5 150 105",
    "--accent-fg": "255 255 255",
    "--overlay": "15 23 42",
    "--overlay-hover": "15 23 42",
    "--highlight": "5 150 105",
    "--highlight-bg": "16 185 129",
    "--highlight-border": "16 185 129",
    "--good-fg": "5 150 105",
    "--good-bg": "16 185 129",
    "--good-border": "16 185 129",
    "--warn-fg": "180 83 9",
    "--warn-bg": "245 158 11",
    "--warn-border": "245 158 11",
    "--bad-fg": "220 38 38",
    "--bad-bg": "239 68 68",
    "--bad-border": "239 68 68",
    "--info-fg": "37 99 235",
    "--info-bg": "59 130 246",
    "--info-border": "59 130 246",
    "--shadow-color": "15 23 42",
    "--viewport-bg": "0 0 0",
  },
};

function rgbCss(channels: string) {
  return `rgb(${channels.replace(/\s+/g, ", ")})`;
}

export function applyThemeVars(theme: ThemeId) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  const vars = THEME_CSS_VARS[theme];
  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(key, value);
  }
  const bg = rgbCss(vars["--surface-0"]);
  const fg = rgbCss(vars["--fg"]);
  root.style.backgroundColor = bg;
  root.style.color = fg;
  document.body.style.backgroundColor = bg;
  document.body.style.color = fg;
  const appRoot = document.getElementById("root");
  if (appRoot) {
    appRoot.style.backgroundColor = bg;
    appRoot.style.color = fg;
  }
}
