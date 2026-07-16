package com.openlab.labos.core.ipc;

import android.util.Log;

import com.openlab.labos.core.ILabOsCallback;
import com.openlab.labos.core.ILabOsCore;
import com.openlab.labos.core.LabOsService;
import com.openlab.labos.core.McuCommand;

import org.json.JSONObject;

/**
 * AIDL stub implementation for ILabOsCore.
 * Delegates all calls to the LabOsService instance.
 * This is the binder returned to satellite APKs when they bind to the core service.
 */
public class CoreServiceBinder extends ILabOsCore.Stub {

    private static final String TAG = "LabOS.Binder";
    private final LabOsService mService;
    private final McuEventDispatcher mDispatcher;

    public CoreServiceBinder(LabOsService service, McuEventDispatcher dispatcher) {
        mService = service;
        mDispatcher = dispatcher;
    }

    // ── MCU Proxy ────────────────────────────────

    @Override
    public boolean sendMcuCommand(McuCommand command) {
        try {
            if (mService.getMcu() == null || !mService.getMcu().isConnected()) return false;
            JSONObject json = new JSONObject(command.getJsonPayload());
            mService.getMcu().sendJson(json);
            return true;
        } catch (Exception e) {
            Log.e(TAG, "sendMcuCommand failed", e);
            return false;
        }
    }

    @Override
    public void registerCallback(ILabOsCallback callback) {
        mDispatcher.registerCallback(callback);
    }

    @Override
    public void unregisterCallback(ILabOsCallback callback) {
        mDispatcher.unregisterCallback(callback);
    }

    // ── Hardware Control ─────────────────────────

    @Override
    public void setRgbLed(int ledIndex, int onMs, int offMs, int count, int brightness) {
        if (mService.getLed() != null) {
            mService.getLed().setRgbLed(ledIndex, onMs, offMs, count, brightness);
        }
    }

    @Override
    public void rgbOff() {
        if (mService.getLed() != null) mService.getLed().rgbOff();
    }

    @Override
    public void setRecordingLed(boolean on) {
        if (mService.getLed() != null) mService.getLed().setRecordingLed(on);
    }

    @Override
    public void playAudioAsset(String assetName) {
        if (mService.getAudio() != null) mService.getAudio().playAsset(assetName);
    }

    @Override
    public void playAudioFile(String filePath) {
        if (mService.getAudio() != null) mService.getAudio().playFile(filePath);
    }

    // ── Settings ─────────────────────────────────

    @Override
    public String getSettingsJson() {
        try {
            return mService.getSettings().getAll().toString();
        } catch (Exception e) {
            return "{}";
        }
    }

    @Override
    public void updateSettings(String json) {
        try {
            mService.getSettings().setFromJson(new JSONObject(json));
        } catch (Exception e) {
            Log.e(TAG, "updateSettings failed", e);
        }
    }

    // ── System ───────────────────────────────────

    @Override
    public void reboot() {
        try {
            com.openlab.labos.core.hardware.SysControl.reboot(mService);
        } catch (Exception e) {
            Log.e(TAG, "reboot failed", e);
        }
    }

    @Override
    public String getDeviceStatus() {
        try {
            JSONObject status = new JSONObject();
            status.put("mcuConnected", mService.getMcu() != null && mService.getMcu().isConnected());
            status.put("batteryPercent", getBatteryPercent());
            return status.toString();
        } catch (Exception e) {
            return "{\"error\":\"" + e.getMessage() + "\"}";
        }
    }

    @Override
    public int getBatteryPercent() {
        return mService.getLastBatteryPercent();
    }

    @Override
    public int getBatteryVoltage() {
        return mService.getLastBatteryVoltage();
    }

    // ── WiFi ─────────────────────────────────────

    @Override
    public String getWifiStatus() {
        if (mService.getWifi() != null) {
            return mService.getWifi().getWifiStatus().toString();
        }
        return "{}";
    }

    @Override
    public void connectWifi(String ssid, String password) {
        if (mService.getWifi() != null) {
            mService.getWifi().connectToWifi(ssid, password);
        }
    }

    @Override
    public void disconnectWifi() {
        if (mService.getWifi() != null) {
            mService.getWifi().disconnectWifi();
        }
    }

    @Override
    public void scanWifi() {
        if (mService.getWifi() != null) {
            mService.getWifi().scanWifi(null);
        }
    }

    // ── IMU / Sensors ────────────────────────────

    @Override
    public boolean startImuStream() {
        if (mService.getImu() != null) {
            mService.getImu().startStreaming();
            return true;
        }
        return false;
    }

    @Override
    public boolean stopImuStream() {
        if (mService.getImu() != null) {
            mService.getImu().stopStreaming();
            return true;
        }
        return false;
    }

    @Override
    public boolean startGestureSubscription() {
        if (mService.getImu() != null) {
            mService.getImu().startGestureSubscription();
            return true;
        }
        return false;
    }

    @Override
    public boolean stopGestureSubscription() {
        if (mService.getImu() != null) {
            mService.getImu().stopGestureSubscription();
            return true;
        }
        return false;
    }
}
