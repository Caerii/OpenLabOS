import { defineConfig, devices } from "@playwright/test";

const webPort = process.env.PLAYWRIGHT_WEB_PORT || process.env.OPENLABOS_WEB_PORT || process.env.WEB_PORT || "5175";
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://localhost:${webPort}`;
const skipWebServer = process.env.PLAYWRIGHT_SKIP_WEB_SERVER === "true" || !!process.env.PLAYWRIGHT_BASE_URL;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  webServer: skipWebServer
    ? undefined
    : {
        command: "pnpm dev",
        url: baseURL,
        env: {
          ...process.env,
          OPENLABOS_WEB_PORT: webPort,
          WEB_PORT: webPort,
          VITE_PORT: webPort,
        },
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
