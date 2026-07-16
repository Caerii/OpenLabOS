import { deleteJson, parseHumanSizeToMB, request, withQuery } from "./core";

export interface BatteryDetails {
  level: number;
  status: string;
  temperature: number;
  voltage: number;
  health: string;
  technology: string;
}

export interface MemoryInfo {
  totalMB: number;
  usedMB: number;
  freeMB: number;
  cachedMB: number;
  buffersMB: number;
}

export interface CpuInfo {
  model: string;
  cores: number;
  frequencyMHz: number;
  loadPercent: number;
}

export interface StorageInfo {
  data: { totalMB: number; usedMB: number; freeMB: number };
  sdcard: { totalMB: number; usedMB: number; freeMB: number };
}

export interface ThermalInfo {
  zones: { name: string; temperature: number }[];
}

export interface HardwareOverview {
  battery: BatteryDetails;
  memory: MemoryInfo;
  cpu: CpuInfo;
  storage: StorageInfo;
  thermal: ThermalInfo;
}

export interface McuLogs {
  lines: { timestamp: string; level: string; tag: string; message: string }[];
}

export interface McuStatus {
  connected: boolean;
  lastSeen: string;
  uartFrameCount: number;
  bytesReceived: number;
  firmwareVersion?: string;
}

export interface McuEvents {
  events: { timestamp: string; type: string; data: string }[];
}

export interface BatteryHistory {
  history: { timestamp: number; percentage: number; voltage: number }[];
  currentPercentage: number;
  currentVoltage: number;
}

export interface BatterySummary {
  avgDrainPerHour: number;
  estimatedMinutesLeft: number;
  minPct24h: number;
  maxPct24h: number;
  sampleCount: number;
}

export const fetchBatteryDetails = () => request<BatteryDetails>("/api/hardware/battery");

export const fetchMemoryInfo = async (): Promise<MemoryInfo> => {
  const raw = await request<any>("/api/hardware/memory");
  const totalKB = raw.memTotalKB ?? 0;
  const freeKB = raw.memFreeKB ?? 0;
  const availKB = raw.memAvailableKB ?? 0;
  const cachedKB = raw.cachedKB ?? 0;
  const buffersKB = raw.buffersKB ?? 0;
  return {
    totalMB: totalKB / 1024,
    freeMB: freeKB / 1024,
    usedMB: (totalKB - availKB) / 1024,
    cachedMB: cachedKB / 1024,
    buffersMB: buffersKB / 1024,
  };
};

export const fetchCpuInfo = async (): Promise<CpuInfo> => {
  const raw = await request<any>("/api/hardware/cpu");
  const processors = raw.processors ?? [];
  return {
    model: processors[0]?.model ?? "Unknown",
    cores: raw.processorCount ?? 0,
    frequencyMHz: parseFloat(processors[0]?.frequency) || 0,
    loadPercent: raw.usagePercent ?? 0,
  };
};

export const fetchStorageInfo = async (): Promise<StorageInfo> => {
  const raw = await request<any>("/api/hardware/storage");
  const parsePart = (part: any) => {
    if (!part) return { totalMB: 0, usedMB: 0, freeMB: 0 };
    return {
      totalMB: parseHumanSizeToMB(part.total),
      usedMB: parseHumanSizeToMB(part.used),
      freeMB: parseHumanSizeToMB(part.available),
    };
  };
  return { data: parsePart(raw.data), sdcard: parsePart(raw.sdcard) };
};

export const fetchThermalInfo = async (): Promise<ThermalInfo> => {
  const raw = await request<any>("/api/hardware/thermal");
  return {
    zones: (raw.zones ?? []).map((zone: any) => ({
      name: zone.name ?? `zone${zone.zone}`,
      temperature: zone.temperatureC ?? 0,
    })),
  };
};

export const fetchHardwareOverview = () => request<HardwareOverview>("/api/hardware/overview");

export const fetchMcuLogs = async (): Promise<McuLogs> => {
  const raw = await request<any>("/api/mcu/logs");
  return {
    lines: (raw.entries ?? []).map((entry: any) => ({
      timestamp: entry.timestamp ?? "",
      level: entry.level ?? "",
      tag: entry.tag ?? "",
      message: entry.message ?? "",
    })),
  };
};

export const fetchMcuStatus = async (): Promise<McuStatus> => {
  const raw = await request<any>("/api/mcu/status");
  return {
    connected: raw.state === "connected",
    lastSeen: raw.lastTimestamp ?? "",
    uartFrameCount: raw.uartFrameCount ?? 0,
    bytesReceived: raw.bytesReceived ?? 0,
    firmwareVersion: raw.firmwareVersion,
  };
};

export const fetchMcuEvents = async (): Promise<McuEvents> => {
  const raw = await request<any>("/api/mcu/events");
  return {
    events: (raw.entries ?? []).map((entry: any) => ({
      timestamp: entry.timestamp ?? "",
      type: entry.tag || entry.level || "event",
      data: entry.message ?? "",
    })),
  };
};

export const batteryHistory = (hours?: number) =>
  request<BatteryHistory>(withQuery("/api/battery/history", { hours }));
export const batterySummary = () => request<BatterySummary>("/api/battery/summary");
export const batteryHistoryClear = () => deleteJson<{ success: boolean }>("/api/battery/history");
