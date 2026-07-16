package com.openlab.labos.dashboard;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.ServiceConnection;
import android.content.pm.PackageInfo;
import android.os.Build;
import android.os.IBinder;
import android.util.Log;

import com.openlab.labos.core.ILabOsCallback;
import com.openlab.labos.core.ILabOsCore;
import com.openlab.labos.core.McuEvent;

/**
 * Dashboard foreground service — runs the on-device HTTP API server.
 *
 * Binds to core-app via AIDL to proxy hardware control, settings, and MCU access.
 * Exposes everything over HTTP so the web dashboard works over WiFi without ADB.
 */
public class DashboardService extends Service {

    private static final String TAG = "LabOS.DashboardSvc";
    private static final String CHANNEL_ID = "labos_dashboard";
    private static final int NOTIFICATION_ID = 3;

    private DashboardRouter mRouter;
    private ILabOsCore mCoreService;
    private boolean mBound = false;

    // Latest state cached from AIDL callbacks
    private volatile boolean mMcuConnected = false;
    private volatile int mBatteryPercent = -1;
    private volatile int mBatteryVoltage = -1;

    private final ILabOsCallback mCoreCallback = new ILabOsCallback.Stub() {
        @Override
        public void onConnectionStateChanged(boolean connected) {
            mMcuConnected = connected;
        }

        @Override
        public void onButtonPress(String buttonId, boolean isLongPress) {
            // Could push to SSE clients in the future
        }

        @Override
        public void onBatteryUpdate(int percentage, int voltage) {
            mBatteryPercent = percentage;
            mBatteryVoltage = voltage;
        }

        @Override
        public void onImuData(float[] accel, float[] gyro) {}

        @Override
        public void onGesture(String gesture) {}

        @Override
        public void onMcuEvent(McuEvent event) {}
    };

    private final ServiceConnection mCoreConnection = new ServiceConnection() {
        @Override
        public void onServiceConnected(ComponentName name, IBinder service) {
            mCoreService = ILabOsCore.Stub.asInterface(service);
            mBound = true;
            Log.i(TAG, "Bound to core service");
            try {
                mCoreService.registerCallback(mCoreCallback);
            } catch (Exception e) {
                Log.w(TAG, "Failed to register callback", e);
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
        Log.i(TAG, "DashboardService created");
        com.openlab.labos.sdk.CrashReporter.install("dashboard");

        createNotificationChannel();
        startForeground(NOTIFICATION_ID, buildNotification("Starting..."));

        // Bind to core
        bindToCoreService();

        // Start HTTP server
        mRouter = new DashboardRouter(this);
        mRouter.startServer();

        updateNotification("API server running on :8080");
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
        Log.i(TAG, "DashboardService destroyed");
        if (mRouter != null) mRouter.stopServer();
        if (mBound) {
            try {
                if (mCoreService != null) mCoreService.unregisterCallback(mCoreCallback);
            } catch (Exception ignored) {}
            unbindService(mCoreConnection);
            mBound = false;
        }
        super.onDestroy();
    }

    // ── Public accessors for route handlers ─────────

    public ILabOsCore getCoreService() { return mCoreService; }
    public boolean isMcuConnected() { return mMcuConnected; }
    public int getBatteryPercent() { return mBatteryPercent; }
    public int getBatteryVoltage() { return mBatteryVoltage; }

    public String getVersionName() {
        try {
            PackageInfo pi = getPackageManager().getPackageInfo(getPackageName(), 0);
            return pi.versionName;
        } catch (Exception e) {
            return "unknown";
        }
    }

    // ── Internal ────────────────────────────────────

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
                CHANNEL_ID, "LabOS Dashboard", NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("On-device REST API server");
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
            .setContentTitle("LabOS Dashboard")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_menu_manage)
            .setOngoing(true)
            .build();
    }

    private void updateNotification(String text) {
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm != null) nm.notify(NOTIFICATION_ID, buildNotification(text));
    }
}
