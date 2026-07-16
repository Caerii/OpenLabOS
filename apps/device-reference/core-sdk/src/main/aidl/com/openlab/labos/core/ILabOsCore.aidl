package com.openlab.labos.core;

import com.openlab.labos.core.ILabOsCallback;
import com.openlab.labos.core.McuCommand;

/**
 * Primary AIDL interface exposed by LabOS core service.
 * Satellite APKs bind to this to access MCU, hardware, settings, etc.
 */
interface ILabOsCore {

    /** Send a raw JSON command to the MCU via UART */
    boolean sendMcuCommand(in McuCommand command);

    /** Register for MCU/hardware event callbacks */
    void registerCallback(ILabOsCallback callback);

    /** Unregister callback */
    void unregisterCallback(ILabOsCallback callback);

    /** Set RGB LED: index (0-4), on/off timing in ms, count, brightness */
    void setRgbLed(int ledIndex, int onMs, int offMs, int count, int brightness);

    /** Turn off all RGB LEDs */
    void rgbOff();

    /** Turn recording LED on/off */
    void setRecordingLed(boolean on);

    /** Play an audio asset by name (e.g., "click_sound.wav") */
    void playAudioAsset(String assetName);

    /** Play an audio file by absolute path */
    void playAudioFile(String filePath);

    /** Get all settings as JSON string */
    String getSettingsJson();

    /** Update settings from partial JSON string */
    void updateSettings(String json);

    /** Reboot the device */
    void reboot();

    /** Get device status as JSON string */
    String getDeviceStatus();

    /** Get current battery percentage (-1 if unknown) */
    int getBatteryPercent();

    /** Get current battery voltage in mV */
    int getBatteryVoltage();

    /** Get WiFi status as JSON string */
    String getWifiStatus();

    /** Connect to a WiFi network */
    void connectWifi(String ssid, String password);

    /** Disconnect from current WiFi */
    void disconnectWifi();

    /** Trigger a WiFi scan */
    void scanWifi();

    /** Start continuous IMU data streaming */
    boolean startImuStream();

    /** Stop IMU data streaming */
    boolean stopImuStream();

    /** Start gesture recognition subscription */
    boolean startGestureSubscription();

    /** Stop gesture recognition subscription */
    boolean stopGestureSubscription();
}
