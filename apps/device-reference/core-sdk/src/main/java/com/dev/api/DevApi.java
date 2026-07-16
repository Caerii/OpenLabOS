package com.dev.api;

/**
 * High-level API for K900 device control.
 * This class MUST remain in com.dev.api package to work with XyDev JNI bindings.
 * Provides simplified methods for controlling K900 hardware features.
 */
public class DevApi {
    private static final int CMD_SET_LED_ON = 101;
    private static final int CMD_SET_SCREEN_ON = 102;
    private static final int CMD_SET_MIC_ON = 103;
    private static final int CMD_SET_LED_CONTROL = 104;
    private static final int CMD_SET_ROI_FOV = 106;

    /** ROI position for camera FOV */
    public static final int ROI_POSITION_CENTER = 0;
    public static final int ROI_POSITION_BOTTOM = 1;
    public static final int ROI_POSITION_TOP = 2;

    /** Control the recording LED */
    public static void setLedOn(boolean bOn) {
        XyDev.setInt(CMD_SET_LED_ON, bOn ? 1 : 0);
    }

    /** Control the screen power */
    public static void setScreenOn(boolean bOn) {
        XyDev.setInt(CMD_SET_SCREEN_ON, bOn ? 1 : 0);
    }

    /** Control the microphone (MTK chipset specific) */
    public static void setMtkMicOn(boolean bOn) {
        XyDev.setInt(CMD_SET_MIC_ON, bOn ? 1 : 0);
    }

    /** Set LED custom brightness with duration */
    public static void setLedCustomBright(int percent, int showTime) {
        long v = ((showTime & 0xFFFF) << 8) | (percent & 0xFF);
        XyDev.setLong(CMD_SET_LED_CONTROL, v);
    }

    /** Set camera FOV and ROI position. Caller must restart camera HAL after. */
    public static void setCameraFov(int fov, int roiPosition) {
        int v = ((roiPosition & 0xFF) << 8) | (fov & 0xFF);
        XyDev.setInt(CMD_SET_ROI_FOV, v);
    }
}
