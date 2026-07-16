package com.openlab.labos.core.settings;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.Arrays;

/**
 * SharedPreferences-backed settings manager for LabOS Glass.
 *
 * Stores user-configurable device settings such as photo/video resolution,
 * camera FOV, audio options, and MCU firmware version. All writes use
 * {@code commit()} for immediate persistence.
 */
public class LabOsSettings {

    private static final String TAG = "LabOS.Settings";
    private static final String PREFS_NAME = "labos_settings";

    // Photo
    private static final String KEY_PHOTO_RESOLUTION = "photo_resolution";

    // Video
    private static final String KEY_VIDEO_WIDTH = "video_width";
    private static final String KEY_VIDEO_HEIGHT = "video_height";
    private static final String KEY_VIDEO_FPS = "video_fps";
    private static final String KEY_MAX_RECORDING_TIME_SECONDS = "max_recording_time_seconds";

    // Camera
    private static final String KEY_CAMERA_FOV = "camera_fov";
    private static final String KEY_CAMERA_LED_ON_CAPTURE = "camera_led_on_capture";

    // Audio
    private static final String KEY_MIC_ENABLED = "mic_enabled";
    private static final String KEY_VAD_ENABLED = "vad_enabled";
    private static final String KEY_AUDIO_VOLUME = "audio_volume";
    private static final String KEY_I2S_KEEP_OPEN_MS = "i2s_keep_open_ms";

    // Gallery
    private static final String KEY_GALLERY_MODE = "gallery_mode";

    // Camera tuning
    private static final String KEY_JPEG_QUALITY = "jpeg_quality";
    private static final String KEY_CAMERA_KEEP_ALIVE_MS = "camera_keep_alive_ms";
    private static final String KEY_VIDEO_BITRATE = "video_bitrate";
    private static final String KEY_STREAM_WIDTH = "stream_width";
    private static final String KEY_STREAM_HEIGHT = "stream_height";
    private static final String KEY_STREAM_JPEG_QUALITY = "stream_jpeg_quality";
    private static final String KEY_STREAM_FPS = "stream_fps";

    // MCU / UART
    private static final String KEY_MCU_FIRMWARE_VERSION = "mcu_firmware_version";
    private static final String KEY_SERIAL_PORT = "serial_port";
    private static final String KEY_BAUD_RATE = "baud_rate";
    private static final String KEY_NORMAL_POLL_MS = "normal_poll_ms";
    private static final String KEY_FAST_POLL_MS = "fast_poll_ms";

    // LED
    private static final String KEY_PHOTO_FLASH_MS = "photo_flash_ms";
    private static final String KEY_LED_BRIGHTNESS = "led_brightness";

    // System / boot
    private static final String KEY_BOOT_CHIME_DELAY_MS = "boot_chime_delay_ms";
    private static final String KEY_CAMERA_WARMUP_DELAY_MS = "camera_warmup_delay_ms";
    private static final String KEY_LOW_BATTERY_THRESHOLD = "low_battery_threshold";
    private static final String KEY_LOW_BATTERY_RESET = "low_battery_reset";

    /** Supported FOV values for the K900 camera sensor. 118 = full frame (no ROI). */
    private static final int[] SUPPORTED_FOV = {82, 92, 102, 118};
    private static final int DEFAULT_FOV = 118;

    // Baud rate whitelist
    private static final int[] ALLOWED_BAUD_RATES = {115200, 230400, 460800, 921600};

    // Defaults
    private static final String DEFAULT_PHOTO_RESOLUTION = "large";
    private static final int DEFAULT_VIDEO_WIDTH = 1280;
    private static final int DEFAULT_VIDEO_HEIGHT = 720;
    private static final int DEFAULT_VIDEO_FPS = 15;
    private static final int DEFAULT_MAX_RECORDING_TIME_SECONDS = 600; // 10 minutes
    private static final boolean DEFAULT_CAMERA_LED = true;
    private static final boolean DEFAULT_MIC_ENABLED = true;
    private static final boolean DEFAULT_VAD_ENABLED = false;
    private static final boolean DEFAULT_GALLERY_MODE = true;
    private static final float DEFAULT_AUDIO_VOLUME = 0.3f;
    private static final int DEFAULT_I2S_KEEP_OPEN_MS = 2000;
    private static final int DEFAULT_JPEG_QUALITY = 80;
    private static final int DEFAULT_CAMERA_KEEP_ALIVE_MS = 5000;
    private static final int DEFAULT_VIDEO_BITRATE = 4_000_000;
    private static final int DEFAULT_STREAM_WIDTH = 480;
    private static final int DEFAULT_STREAM_HEIGHT = 360;
    private static final int DEFAULT_STREAM_JPEG_QUALITY = 45;
    private static final int DEFAULT_STREAM_FPS = 6;
    private static final String DEFAULT_SERIAL_PORT = "/dev/ttyS1";
    private static final int DEFAULT_BAUD_RATE = 460800;
    private static final int DEFAULT_NORMAL_POLL_MS = 10;
    private static final int DEFAULT_FAST_POLL_MS = 2;
    private static final int DEFAULT_PHOTO_FLASH_MS = 300;
    private static final int DEFAULT_LED_BRIGHTNESS = 100;
    private static final int DEFAULT_BOOT_CHIME_DELAY_MS = 1500;
    private static final int DEFAULT_CAMERA_WARMUP_DELAY_MS = 3000;
    private static final int DEFAULT_LOW_BATTERY_THRESHOLD = 10;
    private static final int DEFAULT_LOW_BATTERY_RESET = 20;

    private final SharedPreferences mPrefs;

    public LabOsSettings(Context context) {
        mPrefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        Log.d(TAG, "LabOsSettings initialized");
    }

    // ──────────────────────────────────────────────
    // Photo resolution
    // ──────────────────────────────────────────────

    /**
     * Get the photo resolution setting.
     *
     * @return one of "small", "medium", or "large" (default "large")
     */
    public String getPhotoResolution() {
        String value = mPrefs.getString(KEY_PHOTO_RESOLUTION, DEFAULT_PHOTO_RESOLUTION);
        Log.d(TAG, "getPhotoResolution: " + value);
        return value;
    }

    /**
     * Set the photo resolution.
     *
     * @param resolution "small", "medium", or "large". Invalid values fall back to "large".
     */
    public void setPhotoResolution(String resolution) {
        if (!Arrays.asList("small", "medium", "large").contains(resolution)) {
            Log.w(TAG, "Invalid photo resolution: " + resolution + ", falling back to large");
            resolution = DEFAULT_PHOTO_RESOLUTION;
        }
        Log.d(TAG, "setPhotoResolution: " + resolution);
        mPrefs.edit().putString(KEY_PHOTO_RESOLUTION, resolution).commit();
    }

    // ──────────────────────────────────────────────
    // Video resolution
    // ──────────────────────────────────────────────

    /**
     * Get the video recording width in pixels.
     *
     * @return video width (default 1280)
     */
    public int getVideoWidth() {
        return mPrefs.getInt(KEY_VIDEO_WIDTH, DEFAULT_VIDEO_WIDTH);
    }

    /**
     * Get the video recording height in pixels.
     *
     * @return video height (default 720)
     */
    public int getVideoHeight() {
        return mPrefs.getInt(KEY_VIDEO_HEIGHT, DEFAULT_VIDEO_HEIGHT);
    }

    /**
     * Get the video recording frame rate.
     *
     * @return frames per second (default 15)
     */
    public int getVideoFps() {
        return mPrefs.getInt(KEY_VIDEO_FPS, DEFAULT_VIDEO_FPS);
    }

    /**
     * Set video recording resolution and frame rate.
     *
     * @param width  video width in pixels (must be > 0)
     * @param height video height in pixels (must be > 0)
     * @param fps    frames per second (clamped to 1-60)
     */
    public void setVideoResolution(int width, int height, int fps) {
        if (width <= 0 || height <= 0) {
            Log.w(TAG, "Invalid video resolution: " + width + "x" + height + ", ignoring");
            return;
        }
        fps = Math.max(1, Math.min(60, fps));
        Log.d(TAG, "setVideoResolution: " + width + "x" + height + "@" + fps + "fps");
        mPrefs.edit()
                .putInt(KEY_VIDEO_WIDTH, width)
                .putInt(KEY_VIDEO_HEIGHT, height)
                .putInt(KEY_VIDEO_FPS, fps)
                .commit();
    }

    // ──────────────────────────────────────────────
    // Max recording time
    // ──────────────────────────────────────────────

    /**
     * Get the maximum video recording time.
     *
     * @return maximum recording duration in seconds (default 600)
     */
    public int getMaxRecordingTimeSeconds() {
        int value = mPrefs.getInt(KEY_MAX_RECORDING_TIME_SECONDS, DEFAULT_MAX_RECORDING_TIME_SECONDS);
        Log.d(TAG, "getMaxRecordingTimeSeconds: " + value);
        return value;
    }

    /**
     * Set the maximum video recording time.
     *
     * @param seconds recording limit in seconds (clamped to 10-3600)
     */
    public void setMaxRecordingTimeSeconds(int seconds) {
        seconds = Math.max(10, Math.min(3600, seconds));
        Log.d(TAG, "setMaxRecordingTimeSeconds: " + seconds);
        mPrefs.edit().putInt(KEY_MAX_RECORDING_TIME_SECONDS, seconds).commit();
    }

    // ──────────────────────────────────────────────
    // Camera FOV
    // ──────────────────────────────────────────────

    /**
     * Get the camera field-of-view setting.
     *
     * @return FOV in degrees (82, 92, 102, or 118). Default is 118 (full frame).
     */
    public int getCameraFov() {
        int value = mPrefs.getInt(KEY_CAMERA_FOV, DEFAULT_FOV);
        Log.d(TAG, "getCameraFov: " + value);
        return value;
    }

    /**
     * Set the camera field-of-view.
     *
     * @param fov one of 82, 92, 102, or 118. Invalid values fall back to 118.
     */
    public void setCameraFov(int fov) {
        boolean valid = false;
        for (int supported : SUPPORTED_FOV) {
            if (fov == supported) {
                valid = true;
                break;
            }
        }
        if (!valid) {
            Log.w(TAG, "Invalid camera FOV: " + fov + ", falling back to " + DEFAULT_FOV);
            fov = DEFAULT_FOV;
        }
        Log.d(TAG, "setCameraFov: " + fov);
        mPrefs.edit().putInt(KEY_CAMERA_FOV, fov).commit();
    }

    // ──────────────────────────────────────────────
    // Camera LED
    // ──────────────────────────────────────────────

    /**
     * Check whether the camera LED should illuminate on capture.
     *
     * @return true if the LED should be on during capture (default true)
     */
    public boolean isCameraLedOnCapture() {
        boolean value = mPrefs.getBoolean(KEY_CAMERA_LED_ON_CAPTURE, DEFAULT_CAMERA_LED);
        Log.d(TAG, "isCameraLedOnCapture: " + value);
        return value;
    }

    /**
     * Enable or disable the camera LED on capture.
     *
     * @param enabled true to illuminate the LED during capture
     */
    public void setCameraLedOnCapture(boolean enabled) {
        Log.d(TAG, "setCameraLedOnCapture: " + enabled);
        mPrefs.edit().putBoolean(KEY_CAMERA_LED_ON_CAPTURE, enabled).commit();
    }

    // ──────────────────────────────────────────────
    // Microphone
    // ──────────────────────────────────────────────

    /**
     * Check whether the microphone is enabled.
     *
     * @return true if the mic is enabled (default true)
     */
    public boolean isMicEnabled() {
        boolean value = mPrefs.getBoolean(KEY_MIC_ENABLED, DEFAULT_MIC_ENABLED);
        Log.d(TAG, "isMicEnabled: " + value);
        return value;
    }

    /**
     * Enable or disable the microphone.
     *
     * @param enabled true to enable the mic
     */
    public void setMicEnabled(boolean enabled) {
        Log.d(TAG, "setMicEnabled: " + enabled);
        mPrefs.edit().putBoolean(KEY_MIC_ENABLED, enabled).commit();
    }

    // ──────────────────────────────────────────────
    // VAD (Voice Activity Detection)
    // ──────────────────────────────────────────────

    /**
     * Check whether voice activity detection is enabled.
     *
     * @return true if VAD is enabled (default false)
     */
    public boolean isVadEnabled() {
        boolean value = mPrefs.getBoolean(KEY_VAD_ENABLED, DEFAULT_VAD_ENABLED);
        Log.d(TAG, "isVadEnabled: " + value);
        return value;
    }

    /**
     * Enable or disable voice activity detection.
     *
     * @param enabled true to enable VAD
     */
    public void setVadEnabled(boolean enabled) {
        Log.d(TAG, "setVadEnabled: " + enabled);
        mPrefs.edit().putBoolean(KEY_VAD_ENABLED, enabled).commit();
    }

    // ──────────────────────────────────────────────
    // Gallery mode
    // ──────────────────────────────────────────────

    /**
     * Check whether gallery mode is active (photos/videos saved to local gallery).
     *
     * @return true if gallery mode is active (default true)
     */
    public boolean isGalleryMode() {
        boolean value = mPrefs.getBoolean(KEY_GALLERY_MODE, DEFAULT_GALLERY_MODE);
        Log.d(TAG, "isGalleryMode: " + value);
        return value;
    }

    /**
     * Enable or disable gallery mode.
     *
     * @param enabled true to save captures to the local gallery
     */
    public void setGalleryMode(boolean enabled) {
        Log.d(TAG, "setGalleryMode: " + enabled);
        mPrefs.edit().putBoolean(KEY_GALLERY_MODE, enabled).commit();
    }

    // ──────────────────────────────────────────────
    // MCU firmware version
    // ──────────────────────────────────────────────

    /**
     * Get the cached MCU (BES2700) firmware version string.
     *
     * @return firmware version (e.g. "17.26.1.14"), or empty string if unknown
     */
    public String getMcuFirmwareVersion() {
        String value = mPrefs.getString(KEY_MCU_FIRMWARE_VERSION, "");
        Log.d(TAG, "getMcuFirmwareVersion: " + value);
        return value;
    }

    /**
     * Cache the MCU firmware version received from the BES2700.
     *
     * @param version firmware version string; null/empty values are ignored
     */
    public void setMcuFirmwareVersion(String version) {
        if (version == null || version.isEmpty()) {
            Log.w(TAG, "Attempted to set empty MCU firmware version, ignoring");
            return;
        }
        Log.i(TAG, "setMcuFirmwareVersion: " + version);
        mPrefs.edit().putString(KEY_MCU_FIRMWARE_VERSION, version).commit();
    }

    // ──────────────────────────────────────────────
    // Audio volume
    // ──────────────────────────────────────────────

    public float getAudioVolume() {
        return mPrefs.getFloat(KEY_AUDIO_VOLUME, DEFAULT_AUDIO_VOLUME);
    }

    public void setAudioVolume(float volume) {
        volume = Math.max(0.0f, Math.min(1.0f, volume));
        Log.d(TAG, "setAudioVolume: " + volume);
        mPrefs.edit().putFloat(KEY_AUDIO_VOLUME, volume).commit();
    }

    // ──────────────────────────────────────────────
    // I2S keep-open duration
    // ──────────────────────────────────────────────

    public int getI2sKeepOpenMs() {
        return mPrefs.getInt(KEY_I2S_KEEP_OPEN_MS, DEFAULT_I2S_KEEP_OPEN_MS);
    }

    public void setI2sKeepOpenMs(int ms) {
        ms = Math.max(500, Math.min(10000, ms));
        Log.d(TAG, "setI2sKeepOpenMs: " + ms);
        mPrefs.edit().putInt(KEY_I2S_KEEP_OPEN_MS, ms).commit();
    }

    // ──────────────────────────────────────────────
    // JPEG quality
    // ──────────────────────────────────────────────

    public int getJpegQuality() {
        return mPrefs.getInt(KEY_JPEG_QUALITY, DEFAULT_JPEG_QUALITY);
    }

    public void setJpegQuality(int quality) {
        quality = Math.max(10, Math.min(100, quality));
        Log.d(TAG, "setJpegQuality: " + quality);
        mPrefs.edit().putInt(KEY_JPEG_QUALITY, quality).commit();
    }

    // ──────────────────────────────────────────────
    // Camera keep-alive
    // ──────────────────────────────────────────────

    public int getCameraKeepAliveMs() {
        return mPrefs.getInt(KEY_CAMERA_KEEP_ALIVE_MS, DEFAULT_CAMERA_KEEP_ALIVE_MS);
    }

    public void setCameraKeepAliveMs(int ms) {
        ms = Math.max(1000, Math.min(60000, ms));
        Log.d(TAG, "setCameraKeepAliveMs: " + ms);
        mPrefs.edit().putInt(KEY_CAMERA_KEEP_ALIVE_MS, ms).commit();
    }

    // ──────────────────────────────────────────────
    // Video bitrate
    // ──────────────────────────────────────────────

    public int getVideoBitrate() {
        return mPrefs.getInt(KEY_VIDEO_BITRATE, DEFAULT_VIDEO_BITRATE);
    }

    public void setVideoBitrate(int bitrate) {
        bitrate = Math.max(1_000_000, Math.min(50_000_000, bitrate));
        Log.d(TAG, "setVideoBitrate: " + bitrate);
        mPrefs.edit().putInt(KEY_VIDEO_BITRATE, bitrate).commit();
    }

    public int getStreamWidth() {
        return mPrefs.getInt(KEY_STREAM_WIDTH, DEFAULT_STREAM_WIDTH);
    }

    public int getStreamHeight() {
        return mPrefs.getInt(KEY_STREAM_HEIGHT, DEFAULT_STREAM_HEIGHT);
    }

    public int getStreamJpegQuality() {
        return mPrefs.getInt(KEY_STREAM_JPEG_QUALITY, DEFAULT_STREAM_JPEG_QUALITY);
    }

    public int getStreamFps() {
        return mPrefs.getInt(KEY_STREAM_FPS, DEFAULT_STREAM_FPS);
    }

    public void setStreamConfig(int width, int height, int jpegQuality, int fps) {
        width = Math.max(240, Math.min(1280, width));
        height = Math.max(180, Math.min(720, height));
        jpegQuality = Math.max(20, Math.min(90, jpegQuality));
        fps = Math.max(1, Math.min(15, fps));
        Log.d(TAG, "setStreamConfig: " + width + "x" + height + "@" + fps + "fps Q" + jpegQuality);
        mPrefs.edit()
                .putInt(KEY_STREAM_WIDTH, width)
                .putInt(KEY_STREAM_HEIGHT, height)
                .putInt(KEY_STREAM_JPEG_QUALITY, jpegQuality)
                .putInt(KEY_STREAM_FPS, fps)
                .commit();
    }

    // ──────────────────────────────────────────────
    // Serial port / UART
    // ──────────────────────────────────────────────

    public String getSerialPort() {
        return mPrefs.getString(KEY_SERIAL_PORT, DEFAULT_SERIAL_PORT);
    }

    public void setSerialPort(String port) {
        if (port == null || port.isEmpty()) {
            Log.w(TAG, "Invalid serial port, ignoring");
            return;
        }
        Log.d(TAG, "setSerialPort: " + port);
        mPrefs.edit().putString(KEY_SERIAL_PORT, port).commit();
    }

    public int getBaudRate() {
        return mPrefs.getInt(KEY_BAUD_RATE, DEFAULT_BAUD_RATE);
    }

    public void setBaudRate(int rate) {
        boolean valid = false;
        for (int allowed : ALLOWED_BAUD_RATES) {
            if (rate == allowed) { valid = true; break; }
        }
        if (!valid) {
            Log.w(TAG, "Invalid baud rate: " + rate + ", falling back to " + DEFAULT_BAUD_RATE);
            rate = DEFAULT_BAUD_RATE;
        }
        Log.d(TAG, "setBaudRate: " + rate);
        mPrefs.edit().putInt(KEY_BAUD_RATE, rate).commit();
    }

    public int getNormalPollMs() {
        return mPrefs.getInt(KEY_NORMAL_POLL_MS, DEFAULT_NORMAL_POLL_MS);
    }

    public void setNormalPollMs(int ms) {
        ms = Math.max(1, Math.min(100, ms));
        Log.d(TAG, "setNormalPollMs: " + ms);
        mPrefs.edit().putInt(KEY_NORMAL_POLL_MS, ms).commit();
    }

    public int getFastPollMs() {
        return mPrefs.getInt(KEY_FAST_POLL_MS, DEFAULT_FAST_POLL_MS);
    }

    public void setFastPollMs(int ms) {
        ms = Math.max(1, Math.min(50, ms));
        Log.d(TAG, "setFastPollMs: " + ms);
        mPrefs.edit().putInt(KEY_FAST_POLL_MS, ms).commit();
    }

    // ──────────────────────────────────────────────
    // LED
    // ──────────────────────────────────────────────

    public int getPhotoFlashMs() {
        return mPrefs.getInt(KEY_PHOTO_FLASH_MS, DEFAULT_PHOTO_FLASH_MS);
    }

    public void setPhotoFlashMs(int ms) {
        ms = Math.max(50, Math.min(2000, ms));
        Log.d(TAG, "setPhotoFlashMs: " + ms);
        mPrefs.edit().putInt(KEY_PHOTO_FLASH_MS, ms).commit();
    }

    public int getLedBrightness() {
        return mPrefs.getInt(KEY_LED_BRIGHTNESS, DEFAULT_LED_BRIGHTNESS);
    }

    public void setLedBrightness(int brightness) {
        brightness = Math.max(0, Math.min(255, brightness));
        Log.d(TAG, "setLedBrightness: " + brightness);
        mPrefs.edit().putInt(KEY_LED_BRIGHTNESS, brightness).commit();
    }

    // ──────────────────────────────────────────────
    // System / boot
    // ──────────────────────────────────────────────

    public int getBootChimeDelayMs() {
        return mPrefs.getInt(KEY_BOOT_CHIME_DELAY_MS, DEFAULT_BOOT_CHIME_DELAY_MS);
    }

    public void setBootChimeDelayMs(int ms) {
        ms = Math.max(0, Math.min(10000, ms));
        Log.d(TAG, "setBootChimeDelayMs: " + ms);
        mPrefs.edit().putInt(KEY_BOOT_CHIME_DELAY_MS, ms).commit();
    }

    public int getCameraWarmupDelayMs() {
        return mPrefs.getInt(KEY_CAMERA_WARMUP_DELAY_MS, DEFAULT_CAMERA_WARMUP_DELAY_MS);
    }

    public void setCameraWarmupDelayMs(int ms) {
        ms = Math.max(0, Math.min(15000, ms));
        Log.d(TAG, "setCameraWarmupDelayMs: " + ms);
        mPrefs.edit().putInt(KEY_CAMERA_WARMUP_DELAY_MS, ms).commit();
    }

    public int getLowBatteryThreshold() {
        return mPrefs.getInt(KEY_LOW_BATTERY_THRESHOLD, DEFAULT_LOW_BATTERY_THRESHOLD);
    }

    public void setLowBatteryThreshold(int percent) {
        percent = Math.max(5, Math.min(50, percent));
        Log.d(TAG, "setLowBatteryThreshold: " + percent);
        mPrefs.edit().putInt(KEY_LOW_BATTERY_THRESHOLD, percent).commit();
    }

    public int getLowBatteryReset() {
        return mPrefs.getInt(KEY_LOW_BATTERY_RESET, DEFAULT_LOW_BATTERY_RESET);
    }

    public void setLowBatteryReset(int percent) {
        int threshold = getLowBatteryThreshold();
        percent = Math.max(threshold + 5, Math.min(60, percent));
        Log.d(TAG, "setLowBatteryReset: " + percent);
        mPrefs.edit().putInt(KEY_LOW_BATTERY_RESET, percent).commit();
    }

    // ──────────────────────────────────────────────
    // Button / Gesture mapping
    // ──────────────────────────────────────────────

    private static final String KEY_BUTTON_MAP_PREFIX = "button_action_";

    public String getButtonAction(String buttonId, boolean isLongPress) {
        String key = KEY_BUTTON_MAP_PREFIX + buttonId + (isLongPress ? "_long" : "_short");
        return mPrefs.getString(key, getDefaultButtonAction(buttonId, isLongPress));
    }

    public void setButtonAction(String buttonId, boolean isLongPress, String action) {
        String key = KEY_BUTTON_MAP_PREFIX + buttonId + (isLongPress ? "_long" : "_short");
        mPrefs.edit().putString(key, action).commit();
        Log.i(TAG, "Button mapping: " + key + " → " + action);
    }

    private String getDefaultButtonAction(String buttonId, boolean isLongPress) {
        if ("camera".equals(buttonId)) return isLongPress ? "toggle_video" : "take_photo";
        if ("power".equals(buttonId)) return "announce_battery";
        return "none";
    }

    // ──────────────────────────────────────────────
    // Bulk access
    // ──────────────────────────────────────────────

    /**
     * Return every setting as a single JSONObject, useful for diagnostics
     * or sending the full configuration to a remote client.
     *
     * @return JSONObject containing all current settings
     */
    public JSONObject getAll() {
        JSONObject json = new JSONObject();
        try {
            // Photo / Video
            json.put("photo_resolution", getPhotoResolution());
            json.put("video_width", getVideoWidth());
            json.put("video_height", getVideoHeight());
            json.put("video_fps", getVideoFps());
            json.put("max_recording_time_seconds", getMaxRecordingTimeSeconds());
            json.put("video_bitrate", getVideoBitrate());
            // Camera
            json.put("camera_fov", getCameraFov());
            json.put("camera_led_on_capture", isCameraLedOnCapture());
            json.put("jpeg_quality", getJpegQuality());
            json.put("camera_keep_alive_ms", getCameraKeepAliveMs());
            json.put("stream_width", getStreamWidth());
            json.put("stream_height", getStreamHeight());
            json.put("stream_jpeg_quality", getStreamJpegQuality());
            json.put("stream_fps", getStreamFps());
            // Audio
            json.put("audio_volume", (double) getAudioVolume());
            json.put("i2s_keep_open_ms", getI2sKeepOpenMs());
            json.put("mic_enabled", isMicEnabled());
            json.put("vad_enabled", isVadEnabled());
            // MCU / UART
            json.put("serial_port", getSerialPort());
            json.put("baud_rate", getBaudRate());
            json.put("normal_poll_ms", getNormalPollMs());
            json.put("fast_poll_ms", getFastPollMs());
            json.put("mcu_firmware_version", getMcuFirmwareVersion());
            // LED
            json.put("photo_flash_ms", getPhotoFlashMs());
            json.put("led_brightness", getLedBrightness());
            // System
            json.put("boot_chime_delay_ms", getBootChimeDelayMs());
            json.put("camera_warmup_delay_ms", getCameraWarmupDelayMs());
            json.put("low_battery_threshold", getLowBatteryThreshold());
            json.put("low_battery_reset", getLowBatteryReset());
            json.put("gallery_mode", isGalleryMode());
            // Button mappings
            JSONObject buttonActions = new JSONObject();
            buttonActions.put("camera_short", getButtonAction("camera", false));
            buttonActions.put("camera_long", getButtonAction("camera", true));
            buttonActions.put("power_short", getButtonAction("power", false));
            json.put("button_actions", buttonActions);
        } catch (JSONException e) {
            Log.e(TAG, "Error building settings JSON", e);
        }
        return json;
    }

    /**
     * Apply a partial settings update from a JSON object.
     * Only keys present in the JSON will be updated.
     */
    public void setFromJson(JSONObject json) {
        // Photo / Video
        if (json.has("photo_resolution")) setPhotoResolution(json.optString("photo_resolution", DEFAULT_PHOTO_RESOLUTION));
        if (json.has("video_width") || json.has("video_height") || json.has("video_fps")) {
            setVideoResolution(
                    json.optInt("video_width", getVideoWidth()),
                    json.optInt("video_height", getVideoHeight()),
                    json.optInt("video_fps", getVideoFps()));
        }
        if (json.has("max_recording_time_seconds")) setMaxRecordingTimeSeconds(json.optInt("max_recording_time_seconds", DEFAULT_MAX_RECORDING_TIME_SECONDS));
        if (json.has("video_bitrate")) setVideoBitrate(json.optInt("video_bitrate", DEFAULT_VIDEO_BITRATE));
        // Camera
        if (json.has("camera_fov")) setCameraFov(json.optInt("camera_fov", DEFAULT_FOV));
        if (json.has("camera_led_on_capture")) setCameraLedOnCapture(json.optBoolean("camera_led_on_capture", DEFAULT_CAMERA_LED));
        if (json.has("jpeg_quality")) setJpegQuality(json.optInt("jpeg_quality", DEFAULT_JPEG_QUALITY));
        if (json.has("camera_keep_alive_ms")) setCameraKeepAliveMs(json.optInt("camera_keep_alive_ms", DEFAULT_CAMERA_KEEP_ALIVE_MS));
        if (json.has("stream_width") || json.has("stream_height") || json.has("stream_jpeg_quality") || json.has("stream_fps")) {
            setStreamConfig(
                    json.optInt("stream_width", getStreamWidth()),
                    json.optInt("stream_height", getStreamHeight()),
                    json.optInt("stream_jpeg_quality", getStreamJpegQuality()),
                    json.optInt("stream_fps", getStreamFps()));
        }
        // Audio
        if (json.has("audio_volume")) setAudioVolume((float) json.optDouble("audio_volume", DEFAULT_AUDIO_VOLUME));
        if (json.has("i2s_keep_open_ms")) setI2sKeepOpenMs(json.optInt("i2s_keep_open_ms", DEFAULT_I2S_KEEP_OPEN_MS));
        if (json.has("mic_enabled")) setMicEnabled(json.optBoolean("mic_enabled", DEFAULT_MIC_ENABLED));
        if (json.has("vad_enabled")) setVadEnabled(json.optBoolean("vad_enabled", DEFAULT_VAD_ENABLED));
        // MCU / UART
        if (json.has("serial_port")) setSerialPort(json.optString("serial_port", DEFAULT_SERIAL_PORT));
        if (json.has("baud_rate")) setBaudRate(json.optInt("baud_rate", DEFAULT_BAUD_RATE));
        if (json.has("normal_poll_ms")) setNormalPollMs(json.optInt("normal_poll_ms", DEFAULT_NORMAL_POLL_MS));
        if (json.has("fast_poll_ms")) setFastPollMs(json.optInt("fast_poll_ms", DEFAULT_FAST_POLL_MS));
        // LED
        if (json.has("photo_flash_ms")) setPhotoFlashMs(json.optInt("photo_flash_ms", DEFAULT_PHOTO_FLASH_MS));
        if (json.has("led_brightness")) setLedBrightness(json.optInt("led_brightness", DEFAULT_LED_BRIGHTNESS));
        // System
        if (json.has("boot_chime_delay_ms")) setBootChimeDelayMs(json.optInt("boot_chime_delay_ms", DEFAULT_BOOT_CHIME_DELAY_MS));
        if (json.has("camera_warmup_delay_ms")) setCameraWarmupDelayMs(json.optInt("camera_warmup_delay_ms", DEFAULT_CAMERA_WARMUP_DELAY_MS));
        if (json.has("low_battery_threshold")) setLowBatteryThreshold(json.optInt("low_battery_threshold", DEFAULT_LOW_BATTERY_THRESHOLD));
        if (json.has("low_battery_reset")) setLowBatteryReset(json.optInt("low_battery_reset", DEFAULT_LOW_BATTERY_RESET));
        if (json.has("gallery_mode")) setGalleryMode(json.optBoolean("gallery_mode", DEFAULT_GALLERY_MODE));
        // Button mappings
        if (json.has("button_actions")) {
            JSONObject actions = json.optJSONObject("button_actions");
            if (actions != null) {
                if (actions.has("camera_short")) setButtonAction("camera", false, actions.optString("camera_short"));
                if (actions.has("camera_long")) setButtonAction("camera", true, actions.optString("camera_long"));
                if (actions.has("power_short")) setButtonAction("power", false, actions.optString("power_short"));
            }
        }
        Log.i(TAG, "Applied settings update from JSON");
    }
}
