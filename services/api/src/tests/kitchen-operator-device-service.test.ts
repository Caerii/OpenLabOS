import assert from "node:assert/strict";
import { getLabOSFeatureFlags } from "../config/features.js";
import {
  ipFromDeviceStatus,
  KitchenOperatorDeviceService,
  type OperatorDeviceServicePorts,
} from "../ai/kitchen/application/operator-device-service.js";

function basePorts(overrides: Partial<OperatorDeviceServicePorts> = {}): OperatorDeviceServicePorts {
  let connected = false;
  const stats = { connected: false, totalButtonPresses: 0 };
  return {
    featureFlags: () => getLabOSFeatureFlags({
      LABOS_BUTTON_CONFIRM_ENABLED: "true",
      LABOS_CONFIRM_STEP_VALIDATION_ENABLED: "false",
      LABOS_REALTIME_SUPERVISOR_ENABLED: "false",
      LABOS_HANDS_FREE_ENABLED: "false",
    }),
    getDeviceStatus: async () => ({ connected: true, device: "192.168.50.122:5555", ip: "192.168.50.122" }),
    getLabosStatus: async () => ({ isInstalled: true, isRunning: true }),
    previewHealthSnapshot: async () => ({
      frameReachable: true,
      streaming: true,
      frameCount: 4,
      frameBytes: 2048,
      fps: 12.5,
    }),
    refreshNativeRecordingStatus: async () => ({
      state: { active: true, activeVideoPath: "/storage/emulated/0/LabOS/media/run.mp4" },
      health: { recording: true },
    }),
    getButtonConfirmStatus: async () => ({
      mapped: true,
      sensorBridgeConnected: true,
      mappings: { camera_short: "protocol_confirm_step" },
    }),
    enableWifiProxy: async (ip, token) => ({ ip, token }),
    getToken: () => "token-1",
    sensorBridge: {
      get connected() {
        return connected;
      },
      connect: () => {
        connected = true;
        stats.connected = true;
      },
      getStats: () => stats,
    },
    sleep: async () => undefined,
    ...overrides,
  };
}

async function main() {
  assert.equal(ipFromDeviceStatus({ connected: true, ip: "10.0.0.2" }), "10.0.0.2");
  assert.equal(ipFromDeviceStatus({ connected: true, device: "192.168.50.122:5555" }), "192.168.50.122");
  assert.equal(ipFromDeviceStatus({
    connected: true,
    devices: [{ serial: "192.168.50.123:5555", status: "device" }],
  }), "192.168.50.123");
  assert.equal(ipFromDeviceStatus({ connected: false, device: "usb-serial" }), "");

  {
    const calls: string[] = [];
    const service = new KitchenOperatorDeviceService(basePorts({
      getDeviceStatus: async () => ({ connected: false, devices: [] }),
      enableWifiProxy: async () => {
        calls.push("enableWifiProxy");
        return {};
      },
      sensorBridge: {
        connected: false,
        connect: () => calls.push("connect"),
        getStats: () => ({ connected: false }),
      },
    }));
    const result = await service.ensureButtonConfirmBridge();
    assert.equal(result.connected, false);
    assert.equal(result.reason, "no_glasses_ip");
    assert.deepEqual(calls, []);
  }

  {
    const calls: string[] = [];
    let connected = false;
    const service = new KitchenOperatorDeviceService(basePorts({
      getToken: () => "token-2",
      enableWifiProxy: async (ip, token) => {
        calls.push(`enable:${ip}:${token}`);
        return { ok: true };
      },
      sensorBridge: {
        get connected() {
          return connected;
        },
        connect: (opts) => {
          calls.push(`connect:${opts?.host}:${opts?.token}`);
          connected = true;
        },
        getStats: () => ({ connected }),
      },
    }));
    const result = await service.ensureButtonConfirmBridge();
    assert.equal(result.connected, true);
    assert.equal(result.ip, "192.168.50.122");
    assert.deepEqual(calls, [
      "enable:192.168.50.122:token-2",
      "connect:192.168.50.122:token-2",
    ]);
  }

  {
    const service = new KitchenOperatorDeviceService(basePorts());
    const readiness = await service.readiness();
    assert.equal(readiness.ready, true);
    assert.equal(readiness.summary.glassesConnected, true);
    assert.equal(readiness.summary.labosReady, true);
    assert.equal(readiness.summary.previewReady, true);
    assert.equal(readiness.summary.recordingActive, true);
    assert.equal(readiness.summary.buttonConfirmReady, true);
  }

  {
    const service = new KitchenOperatorDeviceService(basePorts({
      previewHealthSnapshot: async () => ({
        frameReachable: false,
        streaming: false,
        frameCount: 0,
        frameBytes: 0,
        fps: 0,
        previewStatus: "server_unreachable",
        previewDetail: "Preview server did not answer /health: Empty reply from server.",
      }),
    }));
    const readiness = await service.readiness();
    assert.equal(readiness.ready, false);
    assert.equal(readiness.blockers[0]?.id, "preview");
    assert.equal(readiness.blockers[0]?.detail, "Preview server did not answer /health: Empty reply from server.");
  }

  {
    let connected = false;
    const calls: string[] = [];
    const service = new KitchenOperatorDeviceService(basePorts({
      getButtonConfirmStatus: async () => ({
        mapped: true,
        sensorBridgeConnected: connected,
        mappings: { camera_short: "protocol_confirm_step" },
      }),
      enableWifiProxy: async (ip, token) => {
        calls.push(`enable:${ip}:${token}`);
        return { ok: true };
      },
      sensorBridge: {
        get connected() {
          return connected;
        },
        connect: (opts) => {
          calls.push(`connect:${opts?.host}:${opts?.token}`);
          connected = true;
        },
        getStats: () => ({ connected }),
      },
    }));
    const readiness = await service.readiness();
    assert.equal(readiness.ready, true);
    assert.equal(readiness.summary.buttonConfirmReady, true);
    assert.deepEqual(calls, [
      "enable:192.168.50.122:token-1",
      "connect:192.168.50.122:token-1",
    ]);
  }

  {
    const service = new KitchenOperatorDeviceService(basePorts({
      getButtonConfirmStatus: async () => ({
        mapped: true,
        sensorBridgeConnected: false,
        mappings: { camera_short: "protocol_confirm_step" },
      }),
      sensorBridge: {
        connected: false,
        connect: () => undefined,
        getStats: () => ({ connected: false }),
      },
    }));
    const readiness = await service.readiness();
    assert.equal(readiness.ready, false);
    assert.equal(readiness.blockers[0]?.id, "button-confirm");
    assert.equal(readiness.blockers[0]?.recoveryAction, "reconnect_button");
  }

  console.log("[kitchen-operator-device-service] all checks passed");
}

await main();
