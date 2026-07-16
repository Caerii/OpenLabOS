package com.openlab.labos.core.ble;

import org.json.JSONObject;

/**
 * Listener interface for events from the the HMD-class device MCU.
 *
 * Implement this to receive hardware events: button presses, battery updates,
 * IMU sensor data, and connection state changes.
 */
public interface McuEventListener {

    /** MCU serial connection established */
    void onMcuConnected();

    /** MCU serial connection lost */
    void onMcuDisconnected();

    /** Button press event from the glasses */
    void onButtonPress(String buttonId, boolean isLongPress);

    /** Battery status update */
    void onBatteryUpdate(int percentage, int voltage);

    /** IMU sensor data (accelerometer + gyroscope) */
    void onImuData(float accelX, float accelY, float accelZ,
                   float gyroX, float gyroY, float gyroZ);

    /** Head gesture detected (nod, shake, head_up, head_down, tilt_left, tilt_right) */
    void onGesture(String gesture);

    /** Power/left button press — typically triggers battery announcement */
    void onPowerButton();

    /** Raw JSON command received from MCU (for unhandled/custom commands) */
    void onRawCommand(JSONObject json);
}
