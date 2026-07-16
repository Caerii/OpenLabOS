import { adbShell } from "../adb.js";

const BATTERY_STATUS_MAP: Record<string, string> = {
  "1": "Unknown",
  "2": "Charging",
  "3": "Discharging",
  "4": "Not charging",
  "5": "Full",
};

const BATTERY_HEALTH_MAP: Record<string, string> = {
  "1": "Unknown",
  "2": "Good",
  "3": "Overheat",
  "4": "Dead",
  "5": "Over voltage",
  "6": "Unspecified failure",
  "7": "Cold",
};

const BATTERY_PLUGGED_MAP: Record<string, string> = {
  "0": "Unplugged",
  "1": "AC",
  "2": "USB",
  "4": "Wireless",
};

function parseLineValue(output: string, key: string) {
  const match = output.match(new RegExp(`${key}:\\s*(.+)`));
  return match ? match[1].trim() : null;
}

function parseKbValue(output: string, key: string) {
  const match = output.match(new RegExp(`${key}:\\s+(\\d+)`));
  return match ? Number(match[1]) : null;
}

function parseBatteryDetailsFromDump(output: string) {
  const rawStatus = parseLineValue(output, "status");
  const rawHealth = parseLineValue(output, "health");
  const rawPlugged = parseLineValue(output, "plugged");
  const rawTemp = parseLineValue(output, "temperature");

  return {
    level: Number(parseLineValue(output, "level")) || 0,
    status: rawStatus ? BATTERY_STATUS_MAP[rawStatus] || rawStatus : "Unknown",
    health: rawHealth ? BATTERY_HEALTH_MAP[rawHealth] || rawHealth : "Unknown",
    temperature: rawTemp ? Number(rawTemp) / 10 : null,
    voltage: Number(parseLineValue(output, "voltage")) || null,
    technology: parseLineValue(output, "technology"),
    plugged: rawPlugged ? BATTERY_PLUGGED_MAP[rawPlugged] || rawPlugged : "Unknown",
  };
}

function parseMemoryInfoFromProc(output: string) {
  return {
    memTotalKB: parseKbValue(output, "MemTotal"),
    memFreeKB: parseKbValue(output, "MemFree"),
    memAvailableKB: parseKbValue(output, "MemAvailable"),
    buffersKB: parseKbValue(output, "Buffers"),
    cachedKB: parseKbValue(output, "Cached"),
    swapTotalKB: parseKbValue(output, "SwapTotal"),
    swapFreeKB: parseKbValue(output, "SwapFree"),
  };
}

function parseCpuUsageFromStat(stat: string) {
  const cpuLine = stat.split("\n").find((line) => line.startsWith("cpu "));
  if (!cpuLine) return null;
  const parts = cpuLine.trim().split(/\s+/).slice(1).map(Number);
  const idle = parts[3] + (parts[4] || 0);
  const total = parts.reduce((sum, value) => sum + value, 0);
  return total > 0 ? Math.round(((total - idle) / total) * 1000) / 10 : null;
}

function parseCpuInfo(cpuinfo: string, stat: string) {
  const processors: { id: number; model: string; frequency: string }[] = [];
  for (const block of cpuinfo.split(/\n\n+/)) {
    const idMatch = block.match(/processor\s*:\s*(\d+)/);
    if (!idMatch) continue;
    const modelMatch = block.match(/model name\s*:\s*(.+)/i) || block.match(/Processor\s*:\s*(.+)/i);
    const freqMatch = block.match(/cpu MHz\s*:\s*(.+)/i) || block.match(/BogoMIPS\s*:\s*(.+)/i);
    processors.push({
      id: Number(idMatch[1]),
      model: modelMatch ? modelMatch[1].trim() : "unknown",
      frequency: freqMatch ? freqMatch[1].trim() : "unknown",
    });
  }

  return {
    processorCount: processors.length,
    processors,
    usagePercent: parseCpuUsageFromStat(stat),
  };
}

function parseDfOutput(output: string) {
  const lines = output.split("\n").filter((line) => line.trim());
  if (lines.length < 2) return null;
  const parts = lines[1].trim().split(/\s+/);
  return {
    filesystem: parts[0] || null,
    total: parts[1] || null,
    used: parts[2] || null,
    available: parts[3] || null,
    usePercent: parts[4] || null,
    mountedOn: parts[5] || null,
  };
}

function parseThermalZones(temps: string, types = "") {
  const tempLines = temps.split("\n").filter((line) => line.trim());
  const typeLines = types.split("\n").filter((line) => line.trim());
  return tempLines.map((temp, index) => ({
    zone: index,
    name: typeLines[index]?.trim() || `zone${index}`,
    temperatureC: Number(temp.trim()) / 1000,
  }));
}

function parseDisplayInfo(output: string) {
  const widthMatch = output.match(/(\d+)\s*x\s*(\d+)/);
  const densityMatch = output.match(/density\s*(\d+)/i);
  const refreshMatch =
    output.match(/(\d+\.?\d*)\s*fps/i) ||
    output.match(/refreshRate\s*=?\s*(\d+\.?\d*)/i);

  return {
    width: widthMatch ? Number(widthMatch[1]) : null,
    height: widthMatch ? Number(widthMatch[2]) : null,
    density: densityMatch ? Number(densityMatch[1]) : null,
    refreshRate: refreshMatch ? Number(refreshMatch[1]) : null,
    raw: output.substring(0, 500),
  };
}

function parseSensorSummary(output: string) {
  return {
    lines: output.split("\n").filter((line) => line.trim()),
    raw: output,
  };
}

function parseOverview(
  battery: string,
  meminfo: string,
  stat: string,
  dataStorage: string,
  thermal: string,
) {
  const batteryInfo = parseBatteryDetailsFromDump(battery);
  const memoryInfo = parseMemoryInfoFromProc(meminfo);
  const thermalTemps = thermal
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => Number(line.trim()) / 1000);
  const storageInfo = parseDfOutput(dataStorage);

  return {
    battery: {
      level: batteryInfo.level,
      status: batteryInfo.status,
      temperatureC: batteryInfo.temperature,
    },
    memory: {
      totalKB: memoryInfo.memTotalKB,
      availableKB: memoryInfo.memAvailableKB,
      usedPercent:
        memoryInfo.memTotalKB && memoryInfo.memAvailableKB
          ? Math.round(
              ((memoryInfo.memTotalKB - memoryInfo.memAvailableKB) / memoryInfo.memTotalKB) * 1000,
            ) / 10
          : null,
    },
    cpu: { usagePercent: parseCpuUsageFromStat(stat) },
    storage: { usePercent: storageInfo?.usePercent || null },
    thermal: {
      maxTemperatureC: thermalTemps.length > 0 ? Math.max(...thermalTemps) : null,
    },
  };
}

export async function getBatteryDetails() {
  return parseBatteryDetailsFromDump(await adbShell("dumpsys battery"));
}

export async function getMemoryInfo() {
  return parseMemoryInfoFromProc(await adbShell("cat /proc/meminfo"));
}

export async function getCpuDetails() {
  const [cpuinfo, stat] = await Promise.all([
    adbShell("cat /proc/cpuinfo"),
    adbShell("cat /proc/stat"),
  ]);
  return parseCpuInfo(cpuinfo, stat);
}

export async function getStorageInfo() {
  const [dataOut, sdcardOut] = await Promise.all([
    adbShell("df -h /data").catch(() => ""),
    adbShell("df -h /sdcard").catch(() => ""),
  ]);
  return {
    data: parseDfOutput(dataOut),
    sdcard: parseDfOutput(sdcardOut),
  };
}

export async function getThermalInfo() {
  const [temps, types] = await Promise.all([
    adbShell("cat /sys/class/thermal/thermal_zone*/temp").catch(() => ""),
    adbShell("cat /sys/class/thermal/thermal_zone*/type").catch(() => ""),
  ]);
  return { zones: parseThermalZones(temps, types) };
}

export async function getDisplayInfo() {
  return parseDisplayInfo(await adbShell('dumpsys display | grep -A 20 "mDisplayInfo"', 10000));
}

export async function getSensorSummary() {
  return parseSensorSummary(await adbShell("dumpsys sensorservice | head -50", 10000));
}

export async function getHardwareOverview() {
  const [battery, meminfo, stat, dataStorage, thermal] = await Promise.all([
    adbShell("dumpsys battery").catch(() => ""),
    adbShell("cat /proc/meminfo").catch(() => ""),
    adbShell("cat /proc/stat").catch(() => ""),
    adbShell("df -h /data").catch(() => ""),
    adbShell("cat /sys/class/thermal/thermal_zone*/temp").catch(() => ""),
  ]);
  return parseOverview(battery, meminfo, stat, dataStorage, thermal);
}
