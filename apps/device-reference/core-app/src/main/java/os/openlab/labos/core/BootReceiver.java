package com.openlab.labos.core;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

/**
 * Starts LabOS automatically on device boot.
 *
 * Listens for multiple boot-related actions to ensure reliable auto-start
 * across different Android versions and vendor boot implementations.
 * Uses a delayed BootstrapActivity launch (matching the proven asg_client
 * pattern) with a direct service fallback.
 */
public class BootReceiver extends BroadcastReceiver {

    private static final String TAG = "LabOS.Boot";
    private static final String PREFS_BOOT_STATS = "boot_stats";
    private static final long BOOT_DELAY_MS = 8000;

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if (action == null) return;

        switch (action) {
            case Intent.ACTION_BOOT_COMPLETED:
            case "android.intent.action.QUICKBOOT_POWERON":
            case Intent.ACTION_LOCKED_BOOT_COMPLETED:
            case Intent.ACTION_MY_PACKAGE_REPLACED:
                break;
            default:
                return;
        }

        Log.i(TAG, "Boot action received: " + action);
        logBootStats(context, action);

        // Delay start to let system services (especially serial port) settle
        new Handler(Looper.getMainLooper()).postDelayed(() -> {
            try {
                // Launch BootstrapActivity which will start the service
                Intent bootstrap = new Intent(context, BootstrapActivity.class);
                bootstrap.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(bootstrap);
                Log.i(TAG, "BootstrapActivity launched");
            } catch (Exception e) {
                Log.e(TAG, "BootstrapActivity failed, falling back to direct service start", e);
                // Fallback: start service directly
                try {
                    Intent serviceIntent = new Intent(context, LabOsService.class);
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        context.startForegroundService(serviceIntent);
                    } else {
                        context.startService(serviceIntent);
                    }
                    Log.i(TAG, "Service started directly (fallback)");
                } catch (Exception e2) {
                    Log.e(TAG, "Direct service start also failed", e2);
                }
            }
        }, BOOT_DELAY_MS);
    }

    private void logBootStats(Context context, String action) {
        try {
            SharedPreferences prefs = context.getSharedPreferences(PREFS_BOOT_STATS, Context.MODE_PRIVATE);
            int count = prefs.getInt("boot_count", 0) + 1;
            prefs.edit()
                    .putInt("boot_count", count)
                    .putLong("last_boot_time", System.currentTimeMillis())
                    .putString("last_boot_action", action)
                    .putString("android_version", Build.VERSION.RELEASE)
                    .putInt("sdk_int", Build.VERSION.SDK_INT)
                    .putString("device_model", Build.MODEL)
                    .apply();
            Log.i(TAG, "Boot #" + count + " | SDK " + Build.VERSION.SDK_INT + " | " + Build.MODEL);
        } catch (Exception e) {
            Log.e(TAG, "Failed to log boot stats", e);
        }
    }
}
