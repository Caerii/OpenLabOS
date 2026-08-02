import { ThemeProvider } from "./theme/ThemeProvider";
import { Outlet } from "react-router-dom";

/** Legacy operator UI mounted at /operate/* — needs ThemeProvider from the old entry shell. */
export default function LegacyOperatorShell() {
  return (
    <ThemeProvider>
      <div className="min-h-full bg-surface-0 text-fg">
        <Outlet />
      </div>
    </ThemeProvider>
  );
}
