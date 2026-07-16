import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

const DEFAULT_API_PORT = 3847;
const DEFAULT_CLIENT_PORT = 5174;

function readPort(env: Record<string, string | undefined>, keys: string[], fallback: number) {
  for (const key of keys) {
    const value = env[key];
    if (!value) continue;
    const port = Number.parseInt(value, 10);
    if (Number.isInteger(port) && port > 0 && port <= 65535) return port;
  }
  return fallback;
}

export default defineConfig(({ mode }) => {
  const env = { ...process.env, ...loadEnv(mode, process.cwd(), "") } as Record<
    string,
    string | undefined
  >;
  const apiPort = readPort(
    env,
    ["OPENLABOS_API_PORT", "API_PORT", "PORT"],
    DEFAULT_API_PORT,
  );
  const clientPort = readPort(
    env,
    ["OPENLABOS_WEB_PORT", "WEB_PORT", "VITE_PORT"],
    DEFAULT_CLIENT_PORT,
  );
  const apiTarget = env.OPENLABOS_API_URL || `http://localhost:${apiPort}`;

  return {
    plugins: [react()],
    root: ".",
    publicDir: "public",
    build: {
      outDir: "dist",
      emptyOutDir: true,
    },
    server: {
      port: clientPort,
      strictPort: true,
      proxy: {
        "/api": {
          target: apiTarget,
          changeOrigin: true,
          ws: true,
        },
      },
    },
    resolve: {
      alias: {
        "@app": path.resolve(__dirname, "src"),
      },
    },
  };
});
