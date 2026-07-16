import LegacyOperatorApp from "./App";
import { ThemeProvider } from "./theme/ThemeProvider";

/** Legacy operator UI mounted at /operate/* — needs ThemeProvider from the old entry shell. */
export default function LegacyOperatorShell() {
  return (
    <ThemeProvider>
      <div className="min-h-full bg-surface-0 text-fg">
        <LegacyOperatorApp />
      </div>
    </ThemeProvider>
  );
}
