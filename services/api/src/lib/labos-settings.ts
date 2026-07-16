import { adbShell } from "../adb.js";

const SETTINGS_DUMP_PATH = "/sdcard/LabOS/.settings_dump.json";
const SETTINGS_PACKAGE = "com.openlab.labos.core";
const GET_SETTINGS_ACTION = "com.openlab.labos.ACTION_GET_SETTINGS";
const UPDATE_SETTINGS_ACTION = "com.openlab.labos.ACTION_UPDATE_SETTINGS";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function escapeShellSingleQuotes(value: string) {
  return value.replace(/'/g, "'\\''");
}

async function readSettingsDump<T>() {
  const json = await adbShell(`cat ${SETTINGS_DUMP_PATH}`, 5000);
  return JSON.parse(json.trim()) as T;
}

export async function fetchLabosSettings<T = Record<string, any>>(delayMs = 500): Promise<T> {
  await adbShell(`am broadcast -a ${GET_SETTINGS_ACTION} ${SETTINGS_PACKAGE}`, 10000);
  await sleep(delayMs);
  return readSettingsDump<T>();
}

export async function updateLabosSettings<T = Record<string, any>>(
  updates: Record<string, any>,
  delayMs = 500,
): Promise<T> {
  const escaped = escapeShellSingleQuotes(JSON.stringify(updates));
  await adbShell(
    `am broadcast -a ${UPDATE_SETTINGS_ACTION} --es settings '${escaped}' ${SETTINGS_PACKAGE}`,
    10000,
  );
  await sleep(delayMs);
  return readSettingsDump<T>();
}

export function extractButtonMappings(settings: any) {
  const buttonActions = settings?.button_actions || {};
  return {
    camera_short: buttonActions.camera_short || "take_photo",
    camera_long: buttonActions.camera_long || "toggle_video",
    power_short: buttonActions.power_short || "none",
  };
}
