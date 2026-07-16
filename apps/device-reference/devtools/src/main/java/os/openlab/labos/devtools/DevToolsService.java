package com.openlab.labos.devtools;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.ServiceConnection;
import android.os.Build;
import android.os.IBinder;
import android.util.Log;

import com.openlab.labos.core.ILabOsCallback;
import com.openlab.labos.core.ILabOsCore;
import com.openlab.labos.core.McuCommand;
import com.openlab.labos.core.McuEvent;

import org.json.JSONObject;

import java.io.BufferedWriter;
import java.io.File;
import java.io.FileWriter;
import java.io.PrintWriter;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;

/**
 * DevTools service — MCU console, diagnostics, and debug tools.
 *
 * Binds to core-app via AIDL to:
 * - Send/receive raw MCU commands (MCU console)
 * - Monitor all MCU events for diagnostics
 * - Collect battery history, IMU data, gesture events
 *
 * This module is entirely optional — glasses function without it.
 */
public class DevToolsService extends Service {

    private static final String TAG = "LabOS.DevTools";
    private static final String CHANNEL_ID = "labos_devtools";
    private static final int NOTIFICATION_ID = 4;

    private static volatile DevToolsService sInstance;

    public static DevToolsService getInstance() { return sInstance; }

    private ILabOsCore mCoreService;
    private boolean mBound = false;
    private final List<String> mConsoleLog = new ArrayList<>();
    private boolean mImuStreaming = false;

    private static final SimpleDateFormat TIME_FMT =
            new SimpleDateFormat("HH:mm:ss.SSS", Locale.US);

    private final ILabOsCallback mCallback = new ILabOsCallback.Stub() {
        @Override
        public void onConnectionStateChanged(boolean connected) {
            logConsole("SYS", connected ? "MCU CONNECTED" : "MCU DISCONNECTED");
        }

        @Override
        public void onButtonPress(String buttonId, boolean isLongPress) {
            logConsole("BTN", buttonId + (isLongPress ? " (long)" : " (short)"));
        }

        @Override
        public void onBatteryUpdate(int percentage, int voltage) {
            logConsole("BAT", percentage + "% " + voltage + "mV");
        }

        @Override
        public void onImuData(float[] accel, float[] gyro) {
            if (mImuStreaming) {
                logConsole("IMU", String.format(Locale.US,
                        "A[%.2f,%.2f,%.2f] G[%.2f,%.2f,%.2f]",
                        accel[0], accel[1], accel[2],
                        gyro[0], gyro[1], gyro[2]));
            }
        }

        @Override
        public void onGesture(String gesture) {
            logConsole("GST", gesture);
        }

        @Override
        public void onMcuEvent(McuEvent event) {
            logConsole("RX", event.getJsonData());
        }
    };

    private final ServiceConnection mCoreConnection = new ServiceConnection() {
        @Override
        public void onServiceConnected(ComponentName name, IBinder service) {
            mCoreService = ILabOsCore.Stub.asInterface(service);
            mBound = true;
            Log.i(TAG, "Bound to core service");
            try {
                mCoreService.registerCallback(mCallback);
            } catch (Exception e) {
                Log.w(TAG, "Failed to register callback", e);
            }
            logConsole("SYS", "DevTools connected to core service");
        }

        @Override
        public void onServiceDisconnected(ComponentName name) {
            mCoreService = null;
            mBound = false;
            logConsole("SYS", "Core service disconnected");
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        sInstance = this;
        com.openlab.labos.sdk.CrashReporter.install("devtools");
        createNotificationChannel();
        startForeground(NOTIFICATION_ID, buildNotification("DevTools active"));
        bindToCoreService();
        Log.i(TAG, "DevToolsService created");
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        return START_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        sInstance = null;
        if (mBound) {
            try {
                if (mCoreService != null) mCoreService.unregisterCallback(mCallback);
            } catch (Exception ignored) {}
            unbindService(mCoreConnection);
        }
        super.onDestroy();
    }

    // ── MCU Console ─────────────────────────────────

    /**
     * Send a raw MCU command via AIDL.
     * @return true if sent successfully
     */
    public boolean sendMcuCommand(String jsonPayload) {
        if (mCoreService == null) {
            logConsole("ERR", "Core service not connected");
            return false;
        }
        try {
            logConsole("TX", jsonPayload);
            McuCommand cmd = new McuCommand(jsonPayload);
            return mCoreService.sendMcuCommand(cmd);
        } catch (Exception e) {
            logConsole("ERR", "Send failed: " + e.getMessage());
            return false;
        }
    }

    /**
     * Get the console log (all TX/RX/SYS messages).
     */
    public List<String> getConsoleLog() {
        synchronized (mConsoleLog) {
            return new ArrayList<>(mConsoleLog);
        }
    }

    /**
     * Clear the console log.
     */
    public void clearConsoleLog() {
        synchronized (mConsoleLog) {
            mConsoleLog.clear();
        }
    }

    // ── IMU Debug ───────────────────────────────────

    public boolean startImuStream() {
        if (mCoreService == null) return false;
        try {
            mImuStreaming = true;
            return mCoreService.startImuStream();
        } catch (Exception e) {
            return false;
        }
    }

    public boolean stopImuStream() {
        mImuStreaming = false;
        if (mCoreService == null) return false;
        try {
            return mCoreService.stopImuStream();
        } catch (Exception e) {
            return false;
        }
    }

    // ── Diagnostics ─────────────────────────────────

    /**
     * Collect a diagnostic snapshot (system info, settings, battery, etc.)
     */
    public String collectDiagnostics() {
        try {
            JSONObject diag = new JSONObject();
            diag.put("timestamp", System.currentTimeMillis());
            diag.put("model", android.os.Build.MODEL);
            diag.put("android", android.os.Build.VERSION.RELEASE);
            diag.put("sdk", android.os.Build.VERSION.SDK_INT);

            if (mCoreService != null) {
                try {
                    diag.put("deviceStatus", new JSONObject(mCoreService.getDeviceStatus()));
                    diag.put("settings", new JSONObject(mCoreService.getSettingsJson()));
                    diag.put("batteryPercent", mCoreService.getBatteryPercent());
                    diag.put("batteryVoltage", mCoreService.getBatteryVoltage());
                } catch (Exception e) {
                    diag.put("coreError", e.getMessage());
                }
            } else {
                diag.put("coreConnected", false);
            }

            // Memory
            Runtime rt = Runtime.getRuntime();
            JSONObject mem = new JSONObject();
            mem.put("maxMb", rt.maxMemory() / (1024 * 1024));
            mem.put("totalMb", rt.totalMemory() / (1024 * 1024));
            mem.put("freeMb", rt.freeMemory() / (1024 * 1024));
            diag.put("memory", mem);

            diag.put("consoleLogSize", mConsoleLog.size());

            return diag.toString(2);
        } catch (Exception e) {
            return "{\"error\":\"" + e.getMessage() + "\"}";
        }
    }

    // ── Internal ────────────────────────────────────

    private void logConsole(String direction, String message) {
        String entry = "[" + TIME_FMT.format(new Date()) + "] " + direction + " " + message;
        synchronized (mConsoleLog) {
            mConsoleLog.add(entry);
            // Cap at 10000 entries
            while (mConsoleLog.size() > 10000) {
                mConsoleLog.remove(0);
            }
        }
    }

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

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID, "LabOS DevTools", NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("MCU console and diagnostics");
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
            .setContentTitle("LabOS DevTools")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_menu_info_details)
            .setOngoing(true)
            .build();
    }
}
