package com.openlab.labos.core;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.os.Binder;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.util.Log;

import com.openlab.labos.core.audio.AudioController;
import com.openlab.labos.core.ble.McuConnection;
import com.openlab.labos.core.ble.McuEventListener;
import com.openlab.labos.core.hardware.LedController;
import com.openlab.labos.core.ipc.CoreServiceBinder;
import com.openlab.labos.core.ipc.McuEventDispatcher;
import com.openlab.labos.core.sensors.ImuManager;
import com.openlab.labos.core.settings.LabOsSettings;
import com.openlab.labos.core.storage.FileManager;
import com.openlab.labos.core.storage.GalleryManager;

import org.json.JSONObject;

import java.io.File;
import java.io.FileWriter;
import java.io.PrintWriter;

/**
 * LabOS foreground service — the persistent runtime.
 *
 * Central orchestrator for all hardware subsystems:
 * - MCU UART connection (K900 protocol)
 * - Camera capture (photo + video)
 * - Audio playback (I2S, shutter sounds, boot chime)
 * - LED control (recording indicator + RGB LEDs)
 * - IMU sensor management
 * - File/gallery management
 * - Settings persistence
 *
 * Starts automatically on boot via BootReceiver.
 */
public class LabOsService extends Service implements McuEventListener {

    private static final String TAG = "LabOS.Service";
    private static final String CHANNEL_ID = "labos_service";
    private static final int NOTIFICATION_ID = 1;

    private static volatile LabOsService sInstance;

    /** Get the running service instance (for BroadcastReceivers). */
    public static LabOsService getInstance() {
        return sInstance;
    }

    private static final String ASSET_BOOT = "system_ready.wav";
    private static final String ASSET_CONNECTED = "connected.wav";
    private static final String ASSET_DISCONNECTED = "disconnected.wav";
    private static final String ASSET_BATTERY_LOW = "battery_low.wav";

    private final IBinder mLocalBinder = new LocalBinder();
    private final Handler mMainHandler = new Handler(Looper.getMainLooper());

    // ── AIDL for satellite APKs ─────────────────────
    private McuEventDispatcher mEventDispatcher;
    private CoreServiceBinder mAidlBinder;

    // ── Subsystems ──────────────────────────────────
    private McuConnection mMcu;
    private AudioController mAudio;
    private LedController mLed;
    private ImuManager mImu;
    private LabOsSettings mSettings;
    private FileManager mFileManager;
    private GalleryManager mGallery;
    private com.openlab.labos.core.network.WifiController mWifi;
    private android.content.BroadcastReceiver mCameraResultReceiver;
    private boolean mCameraPreviewActive = false;
    private boolean mCameraVideoActive = false;

    private McuEventListener mExternalListener;
    private int mLastBatteryPct = -1;
    private int mLastBatteryVoltage = -1;
    private boolean mLowBatteryWarned = false;

    public class LocalBinder extends Binder {
        public LabOsService getService() {
            return LabOsService.this;
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        Log.i(TAG, "LabOS Service created");
        sInstance = this;
        com.openlab.labos.sdk.CrashReporter.install("core-app");

        createNotificationChannel();
        startForeground(NOTIFICATION_ID, buildNotification("Starting..."));

        // Ensure camera is enabled (device-owner may have disabled it)
        ensureCameraEnabled();

        // Settings (load first, others may depend on it)
        mSettings = new LabOsSettings(this);

        // File management
        mFileManager = new FileManager();
        mFileManager.ensureDirectories();
        mGallery = new GalleryManager(mFileManager);

        // WiFi controller
        mWifi = new com.openlab.labos.core.network.WifiController(this);

        // Event dispatcher (routes MCU events to local + remote AIDL clients)
        mEventDispatcher = new McuEventDispatcher(this);
        mAidlBinder = new CoreServiceBinder(this, mEventDispatcher);

        // MCU connection
        mMcu = new McuConnection(mSettings);
        mMcu.addListener(mEventDispatcher);

        // Audio (needs MCU for I2S path control)
        mAudio = new AudioController(this, mMcu, mSettings);

        // LEDs (needs MCU for RGB commands)
        mLed = new LedController(mMcu, mSettings);

        // IMU manager (needs MCU for streaming commands)
        mImu = new ImuManager(mMcu);

        // Register receiver for camera module results (photo saved, video events)
        registerCameraResultReceiver();
    }

    private boolean mLastI2sPlaying = false;

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Log.i(TAG, "LabOS Service started");

        // Handle I2S audio state from BT audio broadcast receiver
        if (intent != null && "com.openlab.labos.ACTION_I2S_AUDIO_STATE".equals(intent.getAction())) {
            boolean playing = intent.getBooleanExtra("extra_i2s_playing", false);
            handleExternalI2SAudioState(playing);
            return START_STICKY;
        }

        // Connect to MCU if not already connected
        if (!mMcu.isConnected()) {
            boolean connected = mMcu.connect();
            updateNotification(connected ? "Connected to MCU" : "MCU connection failed");

            if (connected) {
                // Play boot chime after a short delay to let I2S settle
                mMainHandler.postDelayed(() -> {
                    mAudio.playAsset(ASSET_BOOT);
                    Log.i(TAG, "Boot chime played");
                }, mSettings.getBootChimeDelayMs());

                // Enable mic and VAD if settings say so
                if (mSettings.isMicEnabled()) mAudio.setMicEnabled(true);
                if (mSettings.isVadEnabled()) mAudio.setVadEnabled(true);

                // Start camera module service so it can pre-warm
                mMainHandler.postDelayed(() -> {
                    sendCameraBroadcast("com.openlab.labos.camera.ACTION_START_PREVIEW");
                    // Stop immediately — just triggers the service to start + warm up
                    mMainHandler.postDelayed(() ->
                        sendCameraBroadcast("com.openlab.labos.camera.ACTION_STOP_PREVIEW"),
                        500);
                }, mSettings.getCameraWarmupDelayMs());
            }
        }

        return START_STICKY; // Restart if killed
    }

    @Override
    public IBinder onBind(Intent intent) {
        // Check if binding from a remote process (AIDL) vs local activity
        String action = intent != null ? intent.getAction() : null;
        if ("com.openlab.labos.core.BIND_AIDL".equals(action)) {
            Log.i(TAG, "Remote AIDL client bound");
            return mAidlBinder;
        }
        return mLocalBinder;
    }

    @Override
    public void onDestroy() {
        Log.i(TAG, "LabOS Service destroyed");
        sInstance = null;
        if (mCameraResultReceiver != null) {
            try { unregisterReceiver(mCameraResultReceiver); } catch (Exception ignored) {}
        }
        if (mAudio != null) mAudio.release();
        if (mLed != null) mLed.release();
        if (mWifi != null) mWifi.shutdown();
        if (mImu != null) mImu.shutdown();
        if (mMcu != null) mMcu.disconnect();
        super.onDestroy();
    }

    // ──────────────────────────────────────────────
    // Public API for bound components
    // ──────────────────────────────────────────────

    /** Get the MCU connection for sending commands */
    public McuConnection getMcu() { return mMcu; }

    /** Get the audio controller */
    public AudioController getAudio() { return mAudio; }

    /** Get the LED controller */
    public LedController getLed() { return mLed; }

    /** Get the IMU manager */
    public ImuManager getImu() { return mImu; }

    /** Get the settings manager */
    public LabOsSettings getSettings() { return mSettings; }

    /** Get the file manager */
    public FileManager getFileManager() { return mFileManager; }

    /** Get the gallery manager */
    public GalleryManager getGallery() { return mGallery; }

    /** Get the last known battery percentage (-1 if unknown) */
    public int getLastBatteryPercent() { return mLastBatteryPct; }

    /** Get the last known battery voltage in mV (-1 if unknown) */
    public int getLastBatteryVoltage() { return mLastBatteryVoltage; }

    /** Get the WiFi controller */
    public com.openlab.labos.core.network.WifiController getWifi() { return mWifi; }

    /** Set a listener that the activity can use to receive events */
    public void setEventListener(McuEventListener listener) {
        mExternalListener = listener;
    }

    // ──────────────────────────────────────────────
    // McuEventListener — orchestrate subsystems + forward events
    // ──────────────────────────────────────────────

    @Override
    public void onMcuConnected() {
        Log.i(TAG, "MCU connected");
        updateNotification("MCU connected");
        mAudio.playAsset(ASSET_CONNECTED);
        if (mExternalListener != null) mExternalListener.onMcuConnected();
    }

    @Override
    public void onMcuDisconnected() {
        Log.w(TAG, "MCU disconnected");
        updateNotification("MCU disconnected");
        mAudio.playAsset(ASSET_DISCONNECTED);
        mLed.rgbOff();
        mCameraPreviewActive = false;
        mCameraVideoActive = false;
        mLed.setRecordingLed(false);
        if (mExternalListener != null) mExternalListener.onMcuDisconnected();
    }

    @Override
    public void onButtonPress(String buttonId, boolean isLongPress) {
        Log.d(TAG, "Button: " + buttonId + " long=" + isLongPress);

        String action = mSettings.getButtonAction(buttonId, isLongPress);
        executeButtonAction(action);

        if (mExternalListener != null) mExternalListener.onButtonPress(buttonId, isLongPress);
    }

    private void executeButtonAction(String action) {
        if (action == null || "none".equals(action)) return;

        switch (action) {
            case "take_photo":
                sendCameraBroadcast("com.openlab.labos.camera.ACTION_TAKE_PHOTO");
                break;
            case "toggle_video":
                sendCameraBroadcast("com.openlab.labos.camera.ACTION_TOGGLE_VIDEO");
                break;
            case "protocol_confirm_step":
                // The dashboard consumes the button event stream and confirms
                // the active protocol step server-side. Keep this local action
                // as an intentional no-op so it does not take a photo/video.
                Log.i(TAG, "Protocol confirm step button press forwarded to dashboard");
                break;
            case "toggle_flashlight":
                mLed.flashRgbForPhoto();
                break;
            case "announce_battery":
                announceBattery();
                break;
            default:
                Log.w(TAG, "Unknown button action: " + action);
                break;
        }
    }

    @Override
    public void onBatteryUpdate(int percentage, int voltage) {
        Log.d(TAG, "Battery: " + percentage + "% " + voltage + "mV");
        mLastBatteryPct = percentage;
        mLastBatteryVoltage = voltage;

        if (percentage >= 0) {
            updateNotification("MCU connected | Battery: " + percentage + "%");

            // Low battery warning (once per charge cycle)
            if (percentage <= mSettings.getLowBatteryThreshold() && !mLowBatteryWarned) {
                mLowBatteryWarned = true;
                mAudio.playAsset(ASSET_BATTERY_LOW);
                Log.w(TAG, "Low battery warning: " + percentage + "%");
            } else if (percentage > mSettings.getLowBatteryReset()) {
                mLowBatteryWarned = false;
            }
        }

        // Log battery data for history chart
        appendBatteryLog(percentage, voltage);

        if (mExternalListener != null) mExternalListener.onBatteryUpdate(percentage, voltage);
    }

    private void appendBatteryLog(int percentage, int voltage) {
        if (percentage < 0) return;
        try {
            File logFile = new File(android.os.Environment.getExternalStorageDirectory(),
                    "LabOS/.battery_log.csv");
            logFile.getParentFile().mkdirs();
            try (PrintWriter pw = new PrintWriter(new FileWriter(logFile, true))) {
                pw.println(System.currentTimeMillis() + "," + percentage + "," + voltage);
            }
        } catch (Exception e) {
            Log.e(TAG, "Battery log write failed", e);
        }
    }

    @Override
    public void onImuData(float accelX, float accelY, float accelZ,
                          float gyroX, float gyroY, float gyroZ) {
        if (mExternalListener != null) {
            mExternalListener.onImuData(accelX, accelY, accelZ, gyroX, gyroY, gyroZ);
        }
    }

    @Override
    public void onGesture(String gesture) {
        Log.d(TAG, "Gesture: " + gesture);
        if (mExternalListener != null) mExternalListener.onGesture(gesture);
    }

    @Override
    public void onPowerButton() {
        Log.d(TAG, "Power button pressed — announcing battery");
        announceBattery();
        if (mExternalListener != null) mExternalListener.onPowerButton();
    }

    @Override
    public void onRawCommand(JSONObject json) {
        if (mExternalListener != null) mExternalListener.onRawCommand(json);
    }

    // ──────────────────────────────────────────────
    // Battery voice announcement
    // ──────────────────────────────────────────────

    /**
     * Announce battery percentage via pre-recorded audio.
     * Rounds to nearest 10% and plays battery/XX.mp3.
     */
    private void announceBattery() {
        int pct = mLastBatteryPct;

        // If we don't have a reading yet, request one from MCU
        if (pct < 0) {
            Log.d(TAG, "No battery reading yet, requesting from MCU");
            try {
                JSONObject cmd = new JSONObject();
                cmd.put("C", "mh_batv");
                cmd.put("V", 1);
                cmd.put("B", "");
                mMcu.sendJson(cmd);
            } catch (Exception e) {
                Log.e(TAG, "Failed to request battery", e);
            }
            // Play a click to acknowledge the press even if we can't announce yet
            mAudio.playError();
            return;
        }

        // Round to nearest 10, clamp to 10-100
        int rounded = Math.max(10, Math.min(100, ((pct + 5) / 10) * 10));
        String asset = "battery/" + rounded + ".mp3";
        Log.i(TAG, "Announcing battery: " + pct + "% → " + asset);
        mAudio.playAsset(asset);
    }

    // ──────────────────────────────────────────────
    // Bluetooth audio I2S path management
    // ──────────────────────────────────────────────

    /**
     * Open or close the I2S speaker path for external Bluetooth audio.
     * Called when the ODM firmware detects BT A2DP audio starting/stopping.
     */
    private void handleExternalI2SAudioState(boolean playing) {
        if (playing == mLastI2sPlaying) {
            Log.d(TAG, "I2S state unchanged, skipping");
            return;
        }
        mLastI2sPlaying = playing;

        Log.i(TAG, "BT audio I2S: " + (playing ? "OPEN" : "CLOSE"));

        try {
            JSONObject cmd = new JSONObject();
            cmd.put("C", playing ? "mh_starti2s" : "mh_stopi2s");
            cmd.put("V", 1);
            cmd.put("B", new JSONObject());
            mMcu.sendJson(cmd);
        } catch (Exception e) {
            Log.e(TAG, "Failed to send I2S command", e);
        }
    }

    // ──────────────────────────────────────────────
    // Camera module IPC
    // ──────────────────────────────────────────────

    /** Send a command broadcast to the camera module. */
    private void sendCameraBroadcast(String action) {
        Intent intent = new Intent(action);
        intent.setPackage("com.openlab.labos.camera");
        sendBroadcast(intent);
    }

    /** Register a receiver for camera result broadcasts (photo saved, video events). */
    private void registerCameraResultReceiver() {
        mCameraResultReceiver = new android.content.BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                if (intent == null || intent.getAction() == null) return;
                switch (intent.getAction()) {
                    case "com.openlab.labos.core.ACTION_PHOTO_SAVED":
                        Log.i(TAG, "Photo saved (from camera module)");
                        mAudio.playShutter();
                        mLed.flashRgbForPhoto();
                        if (mSettings.isCameraLedOnCapture()) {
                            mLed.setRecordingLed(true);
                            mMainHandler.postDelayed(() -> mLed.setRecordingLed(false), mSettings.getPhotoFlashMs());
                        }
                        updateNotification("Photo saved");
                        break;
                    case "com.openlab.labos.core.ACTION_VIDEO_STARTED":
                        Log.i(TAG, "Video started (from camera module)");
                        mCameraVideoActive = true;
                        mAudio.playVideoStart();
                        mLed.solidRgbForVideo();
                        if (mSettings.isCameraLedOnCapture()) {
                            mLed.blinkRecordingLed(500, 500);
                        }
                        updateNotification("Recording video...");
                        break;
                    case "com.openlab.labos.core.ACTION_VIDEO_SAVED":
                        Log.i(TAG, "Video saved (from camera module)");
                        mCameraVideoActive = false;
                        mAudio.playVideoStop();
                        mLed.rgbOff();
                        updateCameraCaptureIndicator();
                        updateNotification("Video saved");
                        break;
                    case "com.openlab.labos.core.ACTION_CAPTURE_ACTIVE_STARTED":
                        mCameraPreviewActive = true;
                        updateCameraCaptureIndicator();
                        updateNotification("Camera capture active");
                        break;
                    case "com.openlab.labos.core.ACTION_CAPTURE_ACTIVE_STOPPED":
                        mCameraPreviewActive = false;
                        updateCameraCaptureIndicator();
                        updateNotification(mCameraVideoActive ? "Recording video..." : "Camera ready");
                        break;
                    case "com.openlab.labos.core.ACTION_CAMERA_ERROR":
                        String error = intent.getStringExtra("error");
                        Log.e(TAG, "Camera error (from camera module): " + error);
                        mCameraVideoActive = false;
                        mCameraPreviewActive = false;
                        mAudio.playError();
                        mLed.rgbOff();
                        mLed.setRecordingLed(false);
                        break;
                }
            }
        };

        android.content.IntentFilter filter = new android.content.IntentFilter();
        filter.addAction("com.openlab.labos.core.ACTION_PHOTO_SAVED");
        filter.addAction("com.openlab.labos.core.ACTION_VIDEO_STARTED");
        filter.addAction("com.openlab.labos.core.ACTION_VIDEO_SAVED");
        filter.addAction("com.openlab.labos.core.ACTION_CAPTURE_ACTIVE_STARTED");
        filter.addAction("com.openlab.labos.core.ACTION_CAPTURE_ACTIVE_STOPPED");
        filter.addAction("com.openlab.labos.core.ACTION_CAMERA_ERROR");
        registerReceiver(mCameraResultReceiver, filter);
    }

    private void updateCameraCaptureIndicator() {
        if (!mSettings.isCameraLedOnCapture()) return;
        if (mCameraVideoActive) {
            mLed.blinkRecordingLed(500, 500);
        } else {
            mLed.setRecordingLed(mCameraPreviewActive);
        }
    }

    // ──────────────────────────────────────────────
    // Device policy helpers
    // ──────────────────────────────────────────────

    /**
     * Ensure camera access is enabled system-wide AND for the separate camera module.
     *
     * Because the camera module (com.openlab.labos.camera) runs under a different UID
     * than the device owner (core-app), the K900's CameraService restricts its access
     * unless we explicitly:
     *   1. Disable the camera-disabled policy flag
     *   2. Clear the DISALLOW_CAMERA user restriction
     *   3. Force-grant android.permission.CAMERA to the camera module package
     *
     * Without step 3, the camera module gets "Camera disabled by policy" even when the
     * global policy says camera is enabled — the per-UID check in CameraService still blocks it.
     */
    private void ensureCameraEnabled() {
        try {
            android.app.admin.DevicePolicyManager dpm =
                (android.app.admin.DevicePolicyManager) getSystemService(DEVICE_POLICY_SERVICE);
            android.content.ComponentName admin = AdminReceiver.getComponentName(this);
            if (dpm != null && dpm.isAdminActive(admin)) {
                // Step 1: Ensure camera-disabled policy is off
                boolean wasDis = dpm.getCameraDisabled(admin);
                Log.i(TAG, "Camera policy check: disabled=" + wasDis);
                if (wasDis) {
                    dpm.setCameraDisabled(admin, false);
                    Log.i(TAG, "Camera re-enabled by LabOS");
                }

                // Step 2: Clear the DISALLOW_CAMERA user restriction
                dpm.clearUserRestriction(admin, "no_camera");
                Log.i(TAG, "Cleared DISALLOW_CAMERA user restriction");

                // Step 3: Force-grant CAMERA permission to the camera module package.
                // As device owner, we can grant runtime permissions to other apps —
                // this is required because K900 CameraService does per-UID access checks.
                String cameraPackage = "com.openlab.labos.camera";
                try {
                    boolean granted = dpm.setPermissionGrantState(admin, cameraPackage,
                        android.Manifest.permission.CAMERA,
                        android.app.admin.DevicePolicyManager.PERMISSION_GRANT_STATE_GRANTED);
                    Log.i(TAG, "Force-granted CAMERA permission to " + cameraPackage
                        + " (success=" + granted + ")");
                } catch (Exception e2) {
                    // Camera module may not be installed yet — that's fine, we'll grant on next boot
                    Log.w(TAG, "Could not grant CAMERA to " + cameraPackage
                        + " (may not be installed yet): " + e2.getMessage());
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "Could not check/set camera policy", e);
        }
    }

    // ──────────────────────────────────────────────
    // Notification
    // ──────────────────────────────────────────────

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID, "LabOS Service", NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("LabOS Glass hardware connection");
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) nm.createNotificationChannel(channel);
        }
    }

    private Notification buildNotification(String text) {
        Notification.Builder builder;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            builder = new Notification.Builder(this, CHANNEL_ID);
        } else {
            builder = new Notification.Builder(this);
        }
        return builder
            .setContentTitle("LabOS Glass")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_menu_compass)
            .setOngoing(true)
            .build();
    }

    private void updateNotification(String text) {
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm != null) {
            nm.notify(NOTIFICATION_ID, buildNotification(text));
        }
    }
}
