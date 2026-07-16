import { getDeviceStatus, listDevices, scanForDevices } from "../adb.js";

async function main() {
  console.log("[scan-adb] probing local subnets for port 5555...");
  const found = await scanForDevices();
  console.log("[scan-adb] open ADB ports:", found.length ? found : "(none)");
  const devices = await listDevices();
  console.log("[scan-adb] adb devices:", JSON.stringify(devices, null, 2));
  console.log("[scan-adb] status:", JSON.stringify(await getDeviceStatus(), null, 2));
}

main().catch((error) => {
  console.error("[scan-adb] failed:", error);
  process.exit(1);
});
