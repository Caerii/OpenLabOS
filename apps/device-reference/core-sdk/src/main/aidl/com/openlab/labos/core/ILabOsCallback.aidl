package com.openlab.labos.core;

import com.openlab.labos.core.McuEvent;

/**
 * Callback interface for receiving events from LabOS core service.
 * Implemented by satellite APKs (camera, dashboard, devtools) that need
 * to react to hardware events.
 */
interface ILabOsCallback {

    /** MCU connection state changed */
    void onConnectionStateChanged(boolean connected);

    /** Button press on the glasses */
    void onButtonPress(String buttonId, boolean isLongPress);

    /** Battery level update from MCU */
    void onBatteryUpdate(int percentage, int voltage);

    /** IMU sensor data (accel[3] + gyro[3]) */
    void onImuData(in float[] accel, in float[] gyro);

    /** Head gesture detected */
    void onGesture(String gesture);

    /** Raw MCU event (JSON string) */
    void onMcuEvent(in com.openlab.labos.core.McuEvent event);
}
