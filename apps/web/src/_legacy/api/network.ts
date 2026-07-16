import { postJson, request } from "./core";

export interface WifiStatus {
  connected: boolean;
  ssid: string;
  signalStrength: number;
  frequencyMHz: number;
  linkSpeedMbps: number;
  ipAddress: string;
}

export interface BluetoothStatus {
  enabled: boolean;
  deviceName: string;
  macAddress: string;
  connectedDevices: { name: string; address: string }[];
}

export interface ConnectivityInfo {
  internetReachable: boolean;
  pingLatencyMs: number;
}

export interface HostBluetoothDevice {
  name: string;
  instanceId: string;
  status: string;
  className: string;
  connected: boolean;
}

export interface HostBluetoothStatus {
  platform: string;
  supported: boolean;
  message: string;
  devices: HostBluetoothDevice[];
}

export const fetchWifiStatus = async (): Promise<WifiStatus> => {
  const raw = await request<any>("/api/network/wifi");
  return {
    connected: raw.state?.includes("CONNECTED") ?? false,
    ssid: raw.ssid ?? "",
    signalStrength: raw.rssi ?? 0,
    frequencyMHz: raw.frequency ?? 0,
    linkSpeedMbps: raw.linkSpeedMbps ?? 0,
    ipAddress: raw.ipAddress ?? "",
  };
};

export const fetchBluetoothStatus = async (): Promise<BluetoothStatus> => {
  const raw = await request<any>("/api/network/bluetooth");
  return {
    enabled: raw.enabled ?? false,
    deviceName: raw.name ?? "",
    macAddress: raw.address ?? "",
    connectedDevices: (raw.connectedDevices ?? []).map((device: any) =>
      typeof device === "string"
        ? { name: device, address: "" }
        : { name: device.name ?? "", address: device.address ?? "" },
    ),
  };
};

export const fetchConnectivity = async (): Promise<ConnectivityInfo> => {
  const raw = await request<any>("/api/network/connectivity");
  return {
    internetReachable: raw.connected ?? false,
    pingLatencyMs: raw.latencyMs ?? -1,
  };
};

export const fetchHostBluetoothStatus = () =>
  request<HostBluetoothStatus>("/api/network/host/bluetooth");

export const openHostBluetoothSettings = () =>
  postJson<{ success: boolean; message: string }>("/api/network/host/bluetooth/open-settings");

export const scanHostBluetooth = () =>
  postJson<{ success: boolean; status: HostBluetoothStatus; message: string }>("/api/network/host/bluetooth/scan");
