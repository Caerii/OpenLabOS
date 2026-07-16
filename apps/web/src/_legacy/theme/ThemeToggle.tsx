import { Btn, Icon } from "../components/ui";
import { useTheme } from "./ThemeProvider";
import { THEMES, type ThemeId } from "./themes";

const ICON_SUN =
  "M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12ZM12 2.25v1.5M12 20.25v1.5M4.219 4.219l1.061 1.061M18.72 18.72l1.06 1.06M2.25 12h1.5M20.25 12h1.5M4.219 19.781l1.061-1.061M18.72 5.28l1.06-1.06";
const ICON_MOON =
  "M21.752 15.002A9.718 9.718 0 0 1 12.003 2.25a7.5 7.5 0 1 0 9.749 12.752Z";

function nextTheme(current: ThemeId) {
  const idx = THEMES.findIndex((t) => t.id === current);
  const next = THEMES[(idx + 1) % THEMES.length];
  return next.id;
}

export function ThemeToggle({
  className = "",
  labelClassName = "",
}: {
  className?: string;
  labelClassName?: string;
}) {
  const { theme, setTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <Btn
      variant="ghost"
      size="xs"
      className={className}
      onClick={() => setTheme(nextTheme(theme))}
      title={`Theme: ${theme} (click to switch)`}
    >
      <Icon d={isDark ? ICON_MOON : ICON_SUN} size={14} />
      <span className={labelClassName}>{isDark ? "Dark" : "Light"}</span>
    </Btn>
  );
}

