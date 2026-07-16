package com.openlab.labos.dashboard;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

/**
 * Canonical external control entrypoint for the dashboard-device module.
 *
 * The service remains non-exported; ADB/dev harnesses send these explicit broadcasts instead.
 */
public class DashboardCommandReceiver extends BroadcastReceiver {
    public static final String ACTION_START = "com.openlab.labos.dashboard.START";
    public static final String ACTION_STOP = "com.openlab.labos.dashboard.STOP";

    private static final String TAG = "LabOS.DashboardCmd";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        if (ACTION_START.equals(action)) {
            Log.i(TAG, "Start command received");
            Intent serviceIntent = new Intent(context, DashboardService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(serviceIntent);
            } else {
                context.startService(serviceIntent);
            }
            return;
        }
        if (ACTION_STOP.equals(action)) {
            Log.i(TAG, "Stop command received");
            context.stopService(new Intent(context, DashboardService.class));
        }
    }
}
