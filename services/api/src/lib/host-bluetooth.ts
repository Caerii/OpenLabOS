import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type HostBluetoothDevice = {
  name: string;
  instanceId: string;
  status: string;
  className: string;
  connected: boolean;
};

export type HostBluetoothStatus = {
  platform: NodeJS.Platform;
  supported: boolean;
  message: string;
  devices: HostBluetoothDevice[];
};

export type OpenHostBluetoothSettingsResult = {
  success: boolean;
  message: string;
};

function normalizeArray<T>(value: T | T[] | null | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function isConnectedStatus(status: string) {
  return /^ok$/i.test(status) || /connected/i.test(status);
}

async function runPowerShell(command: string, timeout = 12000) {
  const { stdout } = await execFileAsync(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command],
    { timeout, windowsHide: true },
  );
  return stdout.trim();
}

export async function getHostBluetoothStatus(): Promise<HostBluetoothStatus> {
  if (process.platform !== "win32") {
    return {
      platform: process.platform,
      supported: false,
      message: "Host Bluetooth controls are currently implemented for Windows desktops.",
      devices: [],
    };
  }

  try {
    const output = await runPowerShell(
      "Get-PnpDevice -Class Bluetooth -ErrorAction SilentlyContinue | " +
        "Select-Object FriendlyName,InstanceId,Status,Class | ConvertTo-Json -Compress -Depth 3",
    );
    const parsed = output ? JSON.parse(output) : [];
    const devices = normalizeArray<Record<string, unknown>>(parsed).map((item) => {
      const status = String(item.Status || "Unknown");
      return {
        name: String(item.FriendlyName || "Bluetooth device"),
        instanceId: String(item.InstanceId || ""),
        status,
        className: String(item.Class || "Bluetooth"),
        connected: isConnectedStatus(status),
      };
    });

    return {
      platform: process.platform,
      supported: true,
      message: "Windows Bluetooth devices known to the desktop.",
      devices,
    };
  } catch (error: any) {
    return {
      platform: process.platform,
      supported: false,
      message: `Unable to query host Bluetooth: ${error?.message || error}`,
      devices: [],
    };
  }
}

export async function openHostBluetoothSettings(): Promise<OpenHostBluetoothSettingsResult> {
  if (process.platform !== "win32") {
    return {
      success: false,
      message: "Opening Bluetooth settings is currently implemented for Windows desktops.",
    };
  }

  const attempts = [
    "Start-Process 'ms-settings:bluetooth'",
    "Start-Process explorer.exe 'ms-settings:bluetooth'",
  ];
  let lastError = "";
  for (const command of attempts) {
    try {
      await runPowerShell(command, 5000);
      return {
        success: true,
        message: "Opened Windows Bluetooth settings on the LabOS host desktop.",
      };
    } catch (error: any) {
      lastError = error?.message || String(error);
    }
  }

  return {
    success: false,
    message: `Could not open Windows Bluetooth settings automatically: ${lastError}`,
  };
}
