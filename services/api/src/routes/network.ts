import { Router } from "express";
import { adbShell } from "../adb.js";
import { asyncRoute } from "../lib/http.js";
import { getHostBluetoothStatus, openHostBluetoothSettings } from "../lib/host-bluetooth.js";

const router = Router();

type NetworkInterfaceInfo = {
  name: string;
  state: string;
  mac: string | null;
  ipv4: string[];
  ipv6: string[];
};

function parseWifiStatus(output: string) {
  const lines = output.split("\n").filter((line) => line.trim());
  const ssidMatch = output.match(/SSID:\s*"?([^",\n]+)"?/i);
  const rssiMatch = output.match(/RSSI:\s*(-?\d+)/i);
  const freqMatch = output.match(/Frequency:\s*(\d+)/i);
  const linkSpeedMatch = output.match(/Link speed:\s*(\d+)/i);
  const stateMatch = output.match(/state:\s*(\w+\/\w+)/i);

  return {
    ssid: ssidMatch ? ssidMatch[1].trim() : null,
    rssi: rssiMatch ? Number(rssiMatch[1]) : null,
    frequency: freqMatch ? Number(freqMatch[1]) : null,
    linkSpeedMbps: linkSpeedMatch ? Number(linkSpeedMatch[1]) : null,
    state: stateMatch ? stateMatch[1] : null,
    raw: lines.slice(0, 20),
  };
}

function parseInterfaces(output: string) {
  const blocks = output.split(/^\d+:\s+/m).filter((block) => block.trim());
  const interfaces: NetworkInterfaceInfo[] = [];

  for (const block of blocks) {
    const nameMatch = block.match(/^(\S+):/);
    if (!nameMatch) continue;

    interfaces.push({
      name: nameMatch[1],
      state: block.match(/state\s+(\w+)/i)?.[1] || "unknown",
      mac: block.match(/link\/\w+\s+([\da-f:]{17})/i)?.[1] || null,
      ipv4: [...block.matchAll(/inet\s+([\d.]+\/\d+)/g)].map((match) => match[1]),
      ipv6: [...block.matchAll(/inet6\s+([\da-f:]+\/\d+)/g)].map((match) => match[1]),
    });
  }

  return { interfaces };
}

function parseBluetoothStatus(output: string) {
  const lines = output.split("\n").filter((line) => line.trim());
  const enabledMatch = output.match(/enabled:\s*(true|false)/i) || output.match(/state:\s*(\w+)/i);
  const addressMatch = output.match(/address:\s*([\da-fA-F:]{17})/i);
  const nameMatch = output.match(/name:\s*(.+)/i);
  const connectedDevices = [...output.matchAll(/Connected\s+devices?:?\s*(.+)/gi)]
    .map((match) => match[1].trim())
    .filter((device) => device && device !== "0");

  return {
    enabled: enabledMatch
      ? enabledMatch[1].toLowerCase() === "true" || enabledMatch[1].toLowerCase() === "on"
      : null,
    address: addressMatch ? addressMatch[1] : null,
    name: nameMatch ? nameMatch[1].trim() : null,
    connectedDevices,
    raw: lines.slice(0, 20),
  };
}

async function readConnectivity() {
  try {
    const output = await adbShell("ping -c 1 -W 2 8.8.8.8", 10000);
    const timeMatch = output.match(/time[=<](\d+\.?\d*)\s*ms/);
    return {
      connected: output.includes("1 received") || output.includes("1 packets received"),
      latencyMs: timeMatch ? Number(timeMatch[1]) : null,
      raw: output,
    };
  } catch (error: any) {
    return {
      connected: false,
      latencyMs: null,
      error: error.message,
    };
  }
}

router.get("/wifi", asyncRoute(async (_req, res) => {
  res.json(parseWifiStatus(
    await adbShell('dumpsys wifi | grep -E "mNetworkInfo|SSID|mWifiInfo|Link speed|Frequency|RSSI"', 10000),
  ));
}));

router.get("/interfaces", asyncRoute(async (_req, res) => {
  res.json(parseInterfaces(await adbShell("ip addr", 10000)));
}));

router.get("/connectivity", asyncRoute(async (_req, res) => {
  res.json(await readConnectivity());
}));

router.get("/bluetooth", asyncRoute(async (_req, res) => {
  res.json(parseBluetoothStatus(await adbShell("dumpsys bluetooth_manager | head -50", 10000)));
}));

router.get("/host/bluetooth", asyncRoute(async (_req, res) => {
  res.json(await getHostBluetoothStatus());
}));

router.post("/host/bluetooth/open-settings", asyncRoute(async (_req, res) => {
  res.json(await openHostBluetoothSettings());
}));

router.post("/host/bluetooth/scan", asyncRoute(async (_req, res) => {
  const openResult = await openHostBluetoothSettings();
  res.json({
    success: openResult.success,
    status: await getHostBluetoothStatus(),
    message: openResult.success
      ? "Opened Windows Bluetooth settings. Put the glasses in pairing mode, then pair the audio device there."
      : openResult.message,
  });
}));

export default router;
