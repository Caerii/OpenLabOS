import { invoke } from "@tauri-apps/api/core";

export interface DesktopCommandOutput {
  ok: boolean;
  stdout: string;
  stderr: string;
}

export interface DesktopAdbDevice {
  serial: string;
  state: string;
  model?: string | null;
  product?: string | null;
  transport_id?: string | null;
  details: string[];
}

export interface DesktopAdbDevicesStatus {
  ok: boolean;
  adb_path: string;
  devices: DesktopAdbDevice[];
  auto_connect_target?: string | null;
  auto_connect_attempted: boolean;
  auto_connect?: DesktopCommandOutput | null;
  stdout: string;
  stderr: string;
}

export interface DesktopBatteryStatus {
  ok: boolean;
  level_percent?: number | null;
  status_code?: number | null;
  status_label?: string | null;
  voltage_mv?: number | null;
  temperature_c?: number | null;
  charge_counter_uah?: number | null;
  stdout: string;
  stderr: string;
}

export interface DesktopThermalZone {
  zone: string;
  label: string;
  raw: number;
  celsius: number;
}

export interface DesktopThermalStatus {
  ok: boolean;
  zones: DesktopThermalZone[];
  hottest?: DesktopThermalZone | null;
  stdout: string;
  stderr: string;
}

export interface DesktopNativeVideoFile {
  device_path: string;
  name: string;
  size_bytes?: number | null;
  modified_unix_seconds?: number | null;
}

export interface DesktopNativeVideoInventory {
  ok: boolean;
  serial?: string | null;
  files: DesktopNativeVideoFile[];
  stdout: string;
  stderr: string;
}

export interface DesktopNativeVideoImportRequest {
  serial?: string | null;
  device_paths: string[];
  destination_dir?: string | null;
}

export interface DesktopImportedNativeVideo {
  device_path: string;
  local_path: string;
  size_bytes: number;
  sha256: string;
}

export interface DesktopNativeVideoImportResult {
  ok: boolean;
  destination_dir: string;
  imported: DesktopImportedNativeVideo[];
  errors: string[];
}

export interface DesktopPowerSampleRequest {
  serial?: string | null;
  duration_ms?: number | null;
  interval_ms?: number | null;
  profile_label?: string | null;
}

export interface DesktopPowerSample {
  timestamp_unix_ms: number;
  elapsed_ms: number;
  battery: DesktopBatteryStatus;
  hottest_thermal_zone?: DesktopThermalZone | null;
}

export interface DesktopPowerSampleResult {
  ok: boolean;
  serial?: string | null;
  profile_label?: string | null;
  duration_ms: number;
  interval_ms: number;
  artifact_path?: string | null;
  samples: DesktopPowerSample[];
  errors: string[];
}

export interface DesktopHealth {
  app: string;
  native_shell: boolean;
  adb_available: boolean;
  adb_version?: string | null;
  default_adb_target?: string | null;
  labos_api_running: boolean;
}

export interface LabosApiStatus {
  running: boolean;
  managed_by_desktop: boolean;
  port: number;
  pid?: number | null;
  server_entry?: string | null;
  error?: string | null;
}

export function isDesktopRuntime() {
  try {
    const { protocol, hostname } = window.location;
    return protocol === "tauri:" || hostname === "tauri.localhost" || hostname.endsWith(".tauri.localhost");
  } catch {
    return false;
  }
}

async function desktopInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T | null> {
  if (!isDesktopRuntime()) return null;
  return invoke<T>(command, args);
}

export function desktopHealth() {
  return desktopInvoke<DesktopHealth>("desktop_health");
}

export function desktopLabosApiStatus(port = 3847) {
  return desktopInvoke<LabosApiStatus>("labos_api_status", { port });
}

export function desktopLabosApiStart(port = 3847) {
  return desktopInvoke<LabosApiStatus>("labos_api_start", { port });
}

export function desktopLabosApiStop() {
  return desktopInvoke<LabosApiStatus>("labos_api_stop");
}

export function desktopAdbDevices() {
  return desktopInvoke<DesktopCommandOutput>("adb_devices");
}

export function desktopAdbDevicesStatus() {
  return desktopInvoke<DesktopAdbDevicesStatus>("adb_devices_status");
}

export function desktopAdbBatteryStatus(serial?: string) {
  return desktopInvoke<DesktopBatteryStatus>("adb_battery_status", { serial });
}

export function desktopAdbThermalStatus(serial?: string) {
  return desktopInvoke<DesktopThermalStatus>("adb_thermal_status", { serial });
}

export function desktopAdbConnect(target: string) {
  return desktopInvoke<DesktopCommandOutput>("adb_connect", { target });
}

export function desktopNativeVideoInventory(serial?: string) {
  return desktopInvoke<DesktopNativeVideoInventory>("adb_native_video_inventory", { serial });
}

export function desktopImportNativeVideos(request: DesktopNativeVideoImportRequest) {
  return desktopInvoke<DesktopNativeVideoImportResult>("adb_import_native_videos", { request });
}

export function desktopPowerSample(request: DesktopPowerSampleRequest) {
  return desktopInvoke<DesktopPowerSampleResult>("adb_power_sample", { request });
}
