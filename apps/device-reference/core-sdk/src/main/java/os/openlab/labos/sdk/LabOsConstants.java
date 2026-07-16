package com.openlab.labos.sdk;

/**
 * Shared constants for inter-module communication across LabOS packages.
 */
public final class LabOsConstants {

    private LabOsConstants() {}

    // ── Core Service ─────────────────────────────
    /** Package ID of the core app */
    public static final String CORE_PACKAGE = "com.openlab.labos.core";

    /** Service class name for AIDL binding */
    public static final String CORE_SERVICE_CLASS = "com.openlab.labos.core.LabOsCoreService";

    // ── Broadcast Actions (Core → Camera) ────────
    public static final String ACTION_TAKE_PHOTO = "com.openlab.labos.camera.ACTION_TAKE_PHOTO";
    public static final String ACTION_TOGGLE_VIDEO = "com.openlab.labos.camera.ACTION_TOGGLE_VIDEO";
    public static final String ACTION_START_VIDEO = "com.openlab.labos.camera.ACTION_START_VIDEO";
    public static final String ACTION_STOP_VIDEO = "com.openlab.labos.camera.ACTION_STOP_VIDEO";
    public static final String ACTION_START_PREVIEW = "com.openlab.labos.camera.ACTION_START_PREVIEW";
    public static final String ACTION_STOP_PREVIEW = "com.openlab.labos.camera.ACTION_STOP_PREVIEW";

    // ── Broadcast Actions (Camera → Core) ────────
    public static final String ACTION_PHOTO_SAVED = "com.openlab.labos.core.ACTION_PHOTO_SAVED";
    public static final String ACTION_VIDEO_STARTED = "com.openlab.labos.core.ACTION_VIDEO_STARTED";
    public static final String ACTION_VIDEO_SAVED = "com.openlab.labos.core.ACTION_VIDEO_SAVED";
    public static final String ACTION_CAMERA_ERROR = "com.openlab.labos.core.ACTION_CAMERA_ERROR";
    public static final String ACTION_CAPTURE_ACTIVE_STARTED = "com.openlab.labos.core.ACTION_CAPTURE_ACTIVE_STARTED";
    public static final String ACTION_CAPTURE_ACTIVE_STOPPED = "com.openlab.labos.core.ACTION_CAPTURE_ACTIVE_STOPPED";

    // ── Broadcast Actions (Dashboard IPC — legacy) ─
    public static final String ACTION_MCU_CONSOLE = "com.openlab.labos.ACTION_MCU_CONSOLE";
    public static final String ACTION_CAMERA_PREVIEW = "com.openlab.labos.ACTION_CAMERA_PREVIEW";
    public static final String ACTION_AUDIO_TEST = "com.openlab.labos.ACTION_AUDIO_TEST";
    public static final String ACTION_GET_SETTINGS = "com.openlab.labos.ACTION_GET_SETTINGS";
    public static final String ACTION_UPDATE_SETTINGS = "com.openlab.labos.ACTION_UPDATE_SETTINGS";

    // ── Extras ───────────────────────────────────
    public static final String EXTRA_PATH = "extra_path";
    public static final String EXTRA_COMMAND = "command";
    public static final String EXTRA_ACTION = "action";
    public static final String EXTRA_TEST = "test";
    public static final String EXTRA_ERROR_MESSAGE = "extra_error_message";

    // ── File Paths ───────────────────────────────
    public static final String LABOS_DIR = "/sdcard/LabOS";
    public static final String MEDIA_DIR = LABOS_DIR + "/media";
    public static final String PHOTOS_DIR = MEDIA_DIR + "/photos";
    public static final String VIDEOS_DIR = MEDIA_DIR + "/videos";
    public static final String DATA_DIR = LABOS_DIR + "/data";
    public static final String LOGS_DIR = LABOS_DIR + "/logs";

    // ── Ports ────────────────────────────────────
    public static final int PREVIEW_SERVER_PORT = 8089;
    public static final int DASHBOARD_SERVER_PORT = 8080;

    // ── Button Actions ───────────────────────────
    public static final String BUTTON_ACTION_TAKE_PHOTO = "take_photo";
    public static final String BUTTON_ACTION_TOGGLE_VIDEO = "toggle_video";
    public static final String BUTTON_ACTION_PROTOCOL_CONFIRM_STEP = "protocol_confirm_step";
    public static final String BUTTON_ACTION_TOGGLE_FLASHLIGHT = "toggle_flashlight";
    public static final String BUTTON_ACTION_ANNOUNCE_BATTERY = "announce_battery";
    public static final String BUTTON_ACTION_NONE = "none";
}
