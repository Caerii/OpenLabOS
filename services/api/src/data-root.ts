import path from "node:path";

export function openLabosDataDir(env: NodeJS.ProcessEnv = process.env) {
  return path.resolve(env.OPENLABOS_DATA_DIR || path.join(process.cwd(), "data"));
}
