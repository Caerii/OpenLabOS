import assert from "node:assert/strict";
import { SensorBridge } from "../ai/sensor-bridge";

async function main() {
  const bridge = new SensorBridge();
  const warnings: string[] = [];
  const unhandled: unknown[] = [];
  const originalWarn = console.warn;
  const onUnhandled = (error: unknown) => {
    unhandled.push(error);
  };

  console.warn = (message?: unknown) => {
    warnings.push(String(message));
  };
  process.on("unhandledRejection", onUnhandled);

  try {
    (bridge as any).sendImuStart = () => Promise.reject(new Error("MCU command timeout"));
    (bridge as any).requestImuStart("test");
    await new Promise((resolve) => setTimeout(resolve, 10));
  } finally {
    process.off("unhandledRejection", onUnhandled);
    console.warn = originalWarn;
  }

  assert.equal(unhandled.length, 0);
  assert.equal(bridge.snapshot().mcuConnected, false);
  assert.ok(warnings.some((line) => line.includes("IMU keepalive failed during test")));

  console.log("[sensor-bridge-keepalive] all checks passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
