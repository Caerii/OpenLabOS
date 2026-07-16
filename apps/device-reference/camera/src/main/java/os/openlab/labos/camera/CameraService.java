package com.openlab.labos.camera;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.ServiceConnection;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.util.Log;

import com.openlab.labos.core.ILabOsCallback;
import com.openlab.labos.core.ILabOsCore;
import com.openlab.labos.core.McuEvent;

import org.json.JSONObject;

/**
 * Camera foreground service — owns Camera2 session and MJPEG preview server.
 *
 * Runs in a separate process/APK from core-app. Communicates with core via:
 * - AIDL binding (ILabOsCore) for settings and hardware feedback (LEDs, audio)
 * - Broadcasts for receiving commands (take photo, toggle video, start/stop preview)
 * - Broadcasts for sending results back (photo saved, video saved)
 */
public class CameraService extends Service {

    private static final String TAG = "LabOS.CameraService";
    private static final String CHANNEL_ID = "labos_camera";
    private static final int NOTIFICATION_ID = 2;

    private static volatile CameraService sInstance;

    public static CameraService getInstance() {
        return sInstance;
    }

    private final Handler mMainHandler = new Handler(Looper.getMainLooper());
    private CameraCapture mCamera;
    private CameraConfig mConfig;
    private ILabOsCore mCoreService;
    private boolean mBound = false;

    // ── Core AIDL connection ────────────────────────

    private final ServiceConnection mCoreConnection = new ServiceConnection() {
        @Override
        public void onServiceConnected(ComponentName name, IBinder service) {
            mCoreService = ILabOsCore.Stub.asInterface(service);
            mBound = true;
            Log.i(TAG, "Bound to core service");

            // Fetch settings from core
            try {
                String settingsJson = mCoreService.getSettingsJson();
                mConfig.updateFromJson(new JSONObject(settingsJson));
                Log.i(TAG, "Camera config loaded from core");
            } catch (Exception e) {
                Log.w(TAG, "Could not fetch settings from core", e);
            }
        }

        @Override
        public void onServiceDisconnected(ComponentName name) {
            mCoreService = null;
            mBound = false;
            Log.w(TAG, "Core service disconnected");
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        Log.i(TAG, "CameraService created");
        sInstance = this;
        com.openlab.labos.sdk.CrashReporter.install("camera");

        createNotificationChannel();
        startForeground(NOTIFICATION_ID, buildNotification("Camera ready"));

        mConfig = new CameraConfig();
        mCamera = new CameraCapture(this, mConfig);
        mCamera.setListener(new CameraCapture.CaptureListener() {
            @Override
            public void onPhotoSaved(String path) {
                Log.i(TAG, "Photo saved: " + path);
                // Notify core-app so it can play shutter + flash LEDs
                Intent result = new Intent("com.openlab.labos.core.ACTION_PHOTO_SAVED");
                result.putExtra("path", path);
                sendBroadcast(result);
                updateNotification("Photo saved");
            }

            @Override
            public void onVideoStarted() {
                Log.i(TAG, "Video recording started");
                Intent result = new Intent("com.openlab.labos.core.ACTION_VIDEO_STARTED");
                result.putExtra("path", mCamera != null ? mCamera.getActiveVideoPath() : "");
                sendBroadcast(result);
                updateNotification("Recording video...");
            }

            @Override
            public void onVideoSaved(String path) {
                Log.i(TAG, "Video saved: " + path);
                Intent result = new Intent("com.openlab.labos.core.ACTION_VIDEO_SAVED");
                result.putExtra("path", path);
                sendBroadcast(result);
                updateNotification("Video saved");
            }

            @Override
            public void onError(String message) {
                Log.e(TAG, "Camera error: " + message);
                Intent result = new Intent("com.openlab.labos.core.ACTION_CAMERA_ERROR");
                result.putExtra("error", message);
                sendBroadcast(result);
            }
        });

        // Bind to core service for settings + hardware feedback
        bindToCoreService();

        // Pre-warm camera
        mMainHandler.postDelayed(() -> {
            mCamera.warmUp();
            Log.i(TAG, "Camera pre-warmed");
        }, 1000);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        // Handle commands via intent actions
        if (intent != null && intent.getAction() != null) {
            handleCommand(intent.getAction(), intent);
        }
        return START_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null; // No binding — commands come via broadcasts/intents
    }

    @Override
    public void onDestroy() {
        Log.i(TAG, "CameraService destroyed");
        sInstance = null;
        if (mCamera != null) mCamera.release();
        if (mBound) {
            unbindService(mCoreConnection);
            mBound = false;
        }
        super.onDestroy();
    }

    // ── Public API ──────────────────────────────────

    public CameraCapture getCamera() {
        return mCamera;
    }

    // ── Command handling ────────────────────────────

    void handleCommand(String action, Intent intent) {
        if (mCamera == null) {
            Log.w(TAG, "Camera not initialized");
            return;
        }

        switch (action) {
            case "com.openlab.labos.camera.ACTION_TAKE_PHOTO":
                refreshCameraConfigFromCore();
                mCamera.takePhoto();
                break;
            case "com.openlab.labos.camera.ACTION_TOGGLE_VIDEO":
                refreshCameraConfigFromCore();
                mCamera.toggleVideo();
                break;
            case "com.openlab.labos.camera.ACTION_START_VIDEO":
                refreshCameraConfigFromCore();
                mCamera.startVideoRecording();
                break;
            case "com.openlab.labos.camera.ACTION_STOP_VIDEO":
                mCamera.stopVideoRecording();
                break;
            case "com.openlab.labos.camera.ACTION_START_PREVIEW":
                refreshCameraConfigFromCore();
                mCamera.startPreviewStream();
                notifyCaptureActive(true, "preview");
                updateNotification("Streaming preview...");
                break;
            case "com.openlab.labos.camera.ACTION_STOP_PREVIEW":
                mCamera.stopPreviewStream();
                notifyCaptureActive(false, "preview");
                updateNotification("Camera ready");
                break;

            case "com.openlab.labos.camera.ACTION_GET_CAPABILITIES":
                handleGetCapabilities();
                break;

            case "com.openlab.labos.camera.ACTION_SET_MANUAL_PARAMS":
                handleSetManualParams(intent);
                break;

            default:
                Log.w(TAG, "Unknown camera action: " + action);
                break;
        }
    }

    private void refreshCameraConfigFromCore() {
        if (mCoreService == null || mConfig == null) return;
        try {
            String settingsJson = mCoreService.getSettingsJson();
            mConfig.updateFromJson(new JSONObject(settingsJson));
        } catch (Exception e) {
            Log.w(TAG, "Could not refresh camera config from core", e);
        }
    }

    private void notifyCaptureActive(boolean active, String reason) {
        Intent result = new Intent(active
                ? "com.openlab.labos.core.ACTION_CAPTURE_ACTIVE_STARTED"
                : "com.openlab.labos.core.ACTION_CAPTURE_ACTIVE_STOPPED");
        result.putExtra("reason", reason);
        sendBroadcast(result);
    }

    /**
     * Query sensor capabilities and write them to a JSON file that the dashboard
     * can read via adb shell cat. Also broadcasts the result for IPC listeners.
     */
    private void handleGetCapabilities() {
        try {
            org.json.JSONObject caps = mCamera.getSensorCapabilities();
            // Write to file for ADB pull
            String path = "/sdcard/LabOS/.camera_caps.json";
            java.io.FileOutputStream fos = new java.io.FileOutputStream(path);
            fos.write(caps.toString(2).getBytes());
            fos.close();
            Log.i(TAG, "Camera capabilities written to " + path);
        } catch (Exception e) {
            Log.e(TAG, "Failed to write camera capabilities", e);
        }
    }

    /**
     * Apply manual sensor parameters from broadcast extras.
     *
     * Expected extras (all optional):
     *   manual_mode: boolean (true=manual, false=auto)
     *   exposure_ns: long (nanoseconds, e.g. 33333333 = 1/30s)
     *   iso: int (e.g. 100, 400, 1600)
     *   ae_compensation: int (EV steps, e.g. -2, 0, +2)
     *   awb_mode: int (Camera2 AWB mode constant: 0=OFF, 1=AUTO, 5=DAYLIGHT, etc.)
     *   focus_distance: float (diopters, 0=infinity)
     */
    private void handleSetManualParams(Intent intent) {
        Boolean manualMode = intent.hasExtra("manual_mode") ? intent.getBooleanExtra("manual_mode", false) : null;
        Long exposureNs = intent.hasExtra("exposure_ns") ? intent.getLongExtra("exposure_ns", 0) : null;
        Integer iso = intent.hasExtra("iso") ? intent.getIntExtra("iso", 0) : null;
        Integer aeComp = intent.hasExtra("ae_compensation") ? intent.getIntExtra("ae_compensation", 0) : null;
        Integer awbMode = intent.hasExtra("awb_mode") ? intent.getIntExtra("awb_mode", 0) : null;
        Float focusDist = intent.hasExtra("focus_distance") ? intent.getFloatExtra("focus_distance", 0f) : null;

        mCamera.setManualParams(manualMode, exposureNs, iso, aeComp, awbMode, focusDist);
    }

    // ── Core binding ────────────────────────────────

    private void bindToCoreService() {
        Intent bindIntent = new Intent();
        bindIntent.setAction("com.openlab.labos.core.BIND_AIDL");
        bindIntent.setComponent(new ComponentName(
                "com.openlab.labos.core",
                "com.openlab.labos.core.LabOsService"));
        try {
            bindService(bindIntent, mCoreConnection, Context.BIND_AUTO_CREATE);
        } catch (Exception e) {
            Log.w(TAG, "Could not bind to core service", e);
        }
    }

    /**
     * Play audio feedback via core service (shutter, error sounds).
     */
    void playCoreAudio(String assetName) {
        if (mCoreService != null) {
            try {
                mCoreService.playAudioAsset(assetName);
            } catch (Exception e) {
                Log.w(TAG, "Failed to play audio via core", e);
            }
        }
    }

    // ── Notification ────────────────────────────────

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID, "LabOS Camera", NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("LabOS camera service");
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
            .setContentTitle("LabOS Camera")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_menu_camera)
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
