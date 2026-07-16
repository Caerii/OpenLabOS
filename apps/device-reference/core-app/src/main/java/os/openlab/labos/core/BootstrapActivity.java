package com.openlab.labos.core;

import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.util.Log;

/**
 * Transparent bootstrap activity that starts the LabOS service on boot.
 *
 * Android O+ restricts starting foreground services directly from a
 * BroadcastReceiver under certain conditions. This activity acts as a
 * bridge: BootReceiver launches it, and it starts the foreground service
 * then immediately finishes. A partial wake lock ensures the device
 * stays awake long enough for the service to initialize.
 */
public class BootstrapActivity extends Activity {

    private static final String TAG = "LabOS.Bootstrap";
    private static final long STARTUP_DELAY_MS = 3000;
    private static final long WAKELOCK_TIMEOUT_MS = 60_000;
    private static final String PREFS_BOOT_STATS = "boot_stats";

    private PowerManager.WakeLock mWakeLock;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Log.i(TAG, "BootstrapActivity created");

        // Acquire a wake lock to keep the device awake through startup
        try {
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            if (pm != null) {
                mWakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "LabOS:Bootstrap");
                mWakeLock.acquire(WAKELOCK_TIMEOUT_MS);
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to acquire wake lock", e);
        }

        // Delay startup slightly to let system services finish initializing
        new Handler(Looper.getMainLooper()).postDelayed(() -> {
            startLabOsService();
            finish();
        }, STARTUP_DELAY_MS);
    }

    private void startLabOsService() {
        try {
            Intent serviceIntent = new Intent(this, LabOsService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(serviceIntent);
            } else {
                startService(serviceIntent);
            }
            Log.i(TAG, "LabOS service started from bootstrap");
            recordBootSuccess(true, null);
        } catch (Exception e) {
            Log.e(TAG, "Failed to start LabOS service", e);
            recordBootSuccess(false, e.getMessage());
        }
    }

    private void recordBootSuccess(boolean success, String error) {
        try {
            SharedPreferences prefs = getSharedPreferences(PREFS_BOOT_STATS, MODE_PRIVATE);
            SharedPreferences.Editor editor = prefs.edit();
            editor.putBoolean("last_bootstrap_success", success);
            editor.putLong("last_bootstrap_time", System.currentTimeMillis());
            if (error != null) editor.putString("last_bootstrap_error", error);
            editor.apply();
        } catch (Exception e) {
            Log.e(TAG, "Failed to record boot stats", e);
        }
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (mWakeLock != null && mWakeLock.isHeld()) {
            mWakeLock.release();
        }
    }
}
