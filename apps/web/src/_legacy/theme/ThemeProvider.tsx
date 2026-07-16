import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { DEFAULT_THEME, THEME_STORAGE_KEY, type ThemeId, THEMES } from "./themes";
import { applyThemeVars } from "./themeVars";

type ThemeContextValue = {
  theme: ThemeId;
  setTheme: (t: ThemeId) => void;
  themes: typeof THEMES;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getInitialTheme(): ThemeId {
  const stored = localStorage.getItem(THEME_STORAGE_KEY) as ThemeId | null;
  if (stored && THEMES.some((t) => t.id === stored)) return stored;
  return DEFAULT_THEME;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(() => {
    if (typeof window === "undefined") return DEFAULT_THEME;
    try {
      const initial = getInitialTheme();
      applyThemeVars(initial);
      return initial;
    } catch {
      applyThemeVars(DEFAULT_THEME);
      return DEFAULT_THEME;
    }
  });

  useEffect(() => {
    applyThemeVars(theme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {}
  }, [theme]);

  const value = useMemo<ThemeContextValue>(() => ({
    theme,
    themes: THEMES,
    setTheme: (t) => setThemeState(t),
  }), [theme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
