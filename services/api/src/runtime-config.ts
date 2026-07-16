export const DEFAULT_DASHBOARD_API_PORT = 3847;
export const DEFAULT_DASHBOARD_CLIENT_PORT = 5174;

type EnvLike = Record<string, string | undefined>;

function readPort(env: EnvLike, keys: string[], fallback: number) {
  for (const key of keys) {
    const value = env[key];
    if (!value) continue;
    const port = Number.parseInt(value, 10);
    if (Number.isInteger(port) && port > 0 && port <= 65535) return port;
  }
  return fallback;
}

export function dashboardApiPort(env: EnvLike = process.env) {
  return readPort(
    env,
    ["OPENLABOS_API_PORT", "LABOS_DASHBOARD_API_PORT", "DASHBOARD_API_PORT", "PORT"],
    DEFAULT_DASHBOARD_API_PORT,
  );
}

export function dashboardClientPort(env: EnvLike = process.env) {
  return readPort(
    env,
    ["OPENLABOS_CLIENT_PORT", "LABOS_DASHBOARD_CLIENT_PORT", "DASHBOARD_CLIENT_PORT", "VITE_PORT"],
    DEFAULT_DASHBOARD_CLIENT_PORT,
  );
}

export function dashboardApiHost(env: EnvLike = process.env) {
  return env.OPENLABOS_API_HOST || env.LABOS_DASHBOARD_API_HOST || env.DASHBOARD_API_HOST || "0.0.0.0";
}

export function dashboardApiProxyTarget(env: EnvLike = process.env) {
  return `http://localhost:${dashboardApiPort(env)}`;
}
