/**
 * ADB (Android Debug Bridge) wrapper for communicating with connected devices.
 *
 * Supports multi-device targeting via setTargetDevice() — when set, all commands
 * automatically prepend `-s <serial>` so you can have multiple devices (e.g. Quest 3
 * + HMD-class glasses) connected simultaneously and route commands to the right one.
 *
 * Global commands (devices, connect, disconnect) skip the -s flag since they
 * operate on the ADB server itself, not a specific device.
 */
import { execFile, spawn } from "child_process";
import { existsSync } from "fs";
import net from "net";
import path from "path";
import { networkInterfaces } from "os";

/** Known ADB binary locations — checked in order, first existing path wins */
const ADB_CANDIDATES = [
  "adb",
  "C:\\Users\\locke\\AppData\\Local\\Android\\Sdk\\platform-tools\\adb.exe",
  "C:\\Android\\platform-tools\\adb.exe",
  "C:\\Program Files\\Android\\platform-tools\\adb.exe",
  path.join(process.env.LOCALAPPDATA || "", "Android", "Sdk", "platform-tools", "adb.exe"),
  path.join(process.env.ANDROID_HOME || "", "platform-tools", "adb.exe"),
  path.join(process.env.ANDROID_SDK_ROOT || "", "platform-tools", "adb.exe"),
];

let resolvedAdbPath: string | null = null;

// Target device serial — when set, all adb commands use -s <serial>
let targetDevice: string | null = null;
let lastKnownTcpDevice: string | null = null;

function tcpSerialFor(value: string | null | undefined) {
  if (!value) return null;
  const match = value.match(/^(\d{1,3}(?:\.\d{1,3}){3})(?::(\d+))?$/);
  if (!match) return null;
  return `${match[1]}:${match[2] || "5555"}`;
}

function rememberTcpDevice(value: string | null | undefined) {
  const serial = tcpSerialFor(value);
  if (serial) lastKnownTcpDevice = serial;
}

function ipFromSerial(serial: string | undefined) {
  return tcpSerialFor(serial)?.split(":")[0];
}

function isRecoverableTargetError(message: string) {
  return /device .*offline|device offline|not found|no devices\/emulators|cannot connect|closed|failed to get feature set|device unauthorized/i.test(message);
}

function runAdb(finalArgs: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const adbPath = findAdb();
    const env = { ...process.env, MSYS_NO_PATHCONV: "1" };

    execFile(adbPath, finalArgs, { timeout: timeoutMs, env, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        const msg = stderr?.trim() || err.message;
        reject(new Error(`adb ${finalArgs.join(" ")} failed: ${msg}`));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

export function findAdb(): string {
  if (resolvedAdbPath) return resolvedAdbPath;

  for (const candidate of ADB_CANDIDATES) {
    if (candidate === "adb") continue;
    if (existsSync(candidate)) {
      resolvedAdbPath = candidate;
      console.log(`[ADB] Found at: ${candidate}`);
      return resolvedAdbPath;
    }
  }

  resolvedAdbPath = "adb";
  return resolvedAdbPath;
}

export function setTargetDevice(serial: string | null) {
  targetDevice = serial ? tcpSerialFor(serial) || serial : null;
  rememberTcpDevice(targetDevice);
  console.log(`[ADB] Target device: ${targetDevice || "(auto)"}`);
}

export function getTargetDevice(): string | null {
  return targetDevice;
}

export async function adb(args: string[], timeoutMs = 15000): Promise<string> {
  // Prepend -s <serial> if a target device is set.
  // Global commands operate on the ADB server itself, not a specific device.
  const globalCommands = ["devices", "connect", "disconnect", "start-server", "kill-server", "version"];
  const isGlobal = globalCommands.includes(args[0]);
  const finalArgs = (targetDevice && !isGlobal) ? ["-s", targetDevice, ...args] : args;

  try {
    const output = await runAdb(finalArgs, timeoutMs);
    if (args[0] === "connect" && args[1]) rememberTcpDevice(args[1]);
    return output;
  } catch (error: any) {
    const message = error?.message || String(error);
    const reconnectTarget = tcpSerialFor(targetDevice);
    if (!isGlobal && reconnectTarget && isRecoverableTargetError(message)) {
      await runAdb(["connect", reconnectTarget], 10_000).catch(() => "");
      return runAdb(finalArgs, timeoutMs);
    }
    throw error;
  }
}

export function adbShell(command: string, timeoutMs = 15000): Promise<string> {
  return adb(["shell", command], timeoutMs);
}

export function adbStream(args: string[], onData: (line: string) => void, onError: (err: Error) => void): () => void {
  const adbPath = findAdb();
  const env = { ...process.env, MSYS_NO_PATHCONV: "1" };

  const globalCommands = ["devices", "connect", "disconnect", "start-server", "kill-server", "version"];
  const isGlobal = globalCommands.includes(args[0]);
  const finalArgs = (targetDevice && !isGlobal) ? ["-s", targetDevice, ...args] : args;

  const proc = spawn(adbPath, finalArgs, { env });

  let buffer = "";
  proc.stdout.on("data", (chunk: Buffer) => {
    buffer += chunk.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      onData(line);
    }
  });

  proc.stderr.on("data", (chunk: Buffer) => {
    onError(new Error(chunk.toString().trim()));
  });

  proc.on("error", onError);

  return () => {
    proc.kill();
  };
}

export interface AdbDevice {
  serial: string;
  status: string;
  model?: string;
  product?: string;
}

/**
 * List all connected ADB devices with model info.
 */
export async function listDevices(): Promise<AdbDevice[]> {
  const output = await adb(["devices", "-l"], 5000);
  const devices: AdbDevice[] = [];
  const lines = output.split("\n").slice(1).filter((l) => l.trim());
  for (const line of lines) {
    const parts = line.split(/\s+/);
    const serial = parts[0];
    const status = parts[1];
    if (!serial || !status) continue;

    let model: string | undefined;
    let product: string | undefined;
    for (const part of parts.slice(2)) {
      if (part.startsWith("model:")) model = part.split(":")[1];
      if (part.startsWith("product:")) product = part.split(":")[1];
    }
    devices.push({ serial, status, model, product });
  }
  return devices;
}

export async function getDeviceStatus(): Promise<{ connected: boolean; device?: string; ip?: string; devices?: AdbDevice[]; targetDevice?: string | null }> {
  try {
    let devices = await listDevices();
    let online = devices.filter((d) => d.status === "device");

    // If a target is set, check it's still connected
    if (targetDevice) {
      const target = online.find((d) => d.serial === targetDevice);
      if (target) {
        rememberTcpDevice(target.serial);
        return { connected: true, device: target.serial, ip: ipFromSerial(target.serial), devices, targetDevice };
      }
      const reconnectTarget = tcpSerialFor(targetDevice);
      if (reconnectTarget) {
        await runAdb(["connect", reconnectTarget], 10_000).catch(() => "");
        devices = await listDevices();
        online = devices.filter((d) => d.status === "device");
        const recoveredTarget = online.find((d) => d.serial === reconnectTarget);
        if (recoveredTarget) {
          setTargetDevice(recoveredTarget.serial);
          return { connected: true, device: recoveredTarget.serial, ip: ipFromSerial(recoveredTarget.serial), devices, targetDevice };
        }
      }
      if (online.length === 1) {
        setTargetDevice(online[0].serial);
        return { connected: true, device: online[0].serial, ip: ipFromSerial(online[0].serial), devices, targetDevice };
      }
      // Target device disconnected
      return { connected: false, devices, targetDevice };
    }

    // No target set — if exactly one device, use it; otherwise show picker
    if (!online.length && lastKnownTcpDevice) {
      await runAdb(["connect", lastKnownTcpDevice], 10_000).catch(() => "");
      devices = await listDevices();
      online = devices.filter((d) => d.status === "device");
    }

    if (online.length === 1) {
      rememberTcpDevice(online[0].serial);
      return { connected: true, device: online[0].serial, ip: ipFromSerial(online[0].serial), devices, targetDevice: null };
    }
    if (online.length > 1) {
      // Multiple devices, none selected — report disconnected so UI shows picker
      return { connected: false, devices, targetDevice: null };
    }
    return { connected: false, devices, targetDevice: null };
  } catch {
    return { connected: false, devices: [], targetDevice: null };
  }
}

export async function getDeviceInfo(): Promise<Record<string, string>> {
  const props: Record<string, string> = {};
  try {
    const [model, version, serial, sdk, brand, product, battery, ip] = await Promise.all([
      adbShell("getprop ro.product.model").catch(() => "unknown"),
      adbShell("getprop ro.build.version.release").catch(() => "unknown"),
      adbShell("getprop ro.serialno").catch(() => "unknown"),
      adbShell("getprop ro.build.version.sdk").catch(() => "unknown"),
      adbShell("getprop ro.product.brand").catch(() => "unknown"),
      adbShell("getprop ro.product.name").catch(() => "unknown"),
      adbShell("dumpsys battery").catch(() => ""),
      adbShell("ip route | grep 'src' | head -1").catch(() => ""),
    ]);

    props.model = model;
    props.androidVersion = version;
    props.serial = serial;
    props.sdkVersion = sdk;
    props.brand = brand;
    props.product = product;

    const levelMatch = battery.match(/level:\s*(\d+)/);
    if (levelMatch) props.batteryLevel = levelMatch[1];
    const statusMatch = battery.match(/status:\s*(\d+)/);
    if (statusMatch) {
      const statusMap: Record<string, string> = { "1": "Unknown", "2": "Charging", "3": "Discharging", "4": "Not charging", "5": "Full" };
      props.batteryStatus = statusMap[statusMatch[1]] || "Unknown";
    }

    const ipMatch = ip.match(/src\s+([\d.]+)/);
    if (ipMatch) props.ipAddress = ipMatch[1];

    const uptime = await adbShell("uptime").catch(() => "");
    if (uptime) props.uptime = uptime.split(",")[0].replace("up", "").trim();
  } catch (e) {
    props.error = String(e);
  }
  return props;
}

export function getLocalSubnets(): string[] {
  const subnets = new Set<string>();
  const interfaces = networkInterfaces();
  for (const iface of Object.values(interfaces)) {
    if (!iface) continue;
    for (const addr of iface) {
      if (addr.family === "IPv4" && !addr.internal) {
        const parts = addr.address.split(".");
        subnets.add(`${parts[0]}.${parts[1]}.${parts[2]}`);
      }
    }
  }
  subnets.add("192.168.0");
  subnets.add("192.168.1");
  subnets.add("192.168.50");
  return Array.from(subnets);
}

function probePort(ip: string, port: number, timeoutMs = 800): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("timeout", () => { socket.destroy(); resolve(false); });
    socket.once("error", () => { socket.destroy(); resolve(false); });
    socket.connect(port, ip);
  });
}

export async function scanForDevices(): Promise<string[]> {
  const subnets = getLocalSubnets();
  const found: string[] = [];

  for (const subnet of subnets) {
    const batch: Promise<void>[] = [];
    for (let i = 1; i < 255; i++) {
      const ip = `${subnet}.${i}`;
      batch.push(
        probePort(ip, 5555, 800).then((open) => {
          if (open) found.push(ip);
        })
      );
    }
    await Promise.all(batch);
  }

  for (const ip of found) {
    try {
      await adb(["connect", `${ip}:5555`], 5000);
    } catch {
      // Port was open but ADB handshake failed
    }
  }

  return found;
}
