package com.openlab.labos.dashboard;

import android.app.Activity;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;

/**
 * Foreground entrypoint for starting the dashboard HTTP service from ADB or the
 * host dashboard. Android blocks background broadcasts from launching services
 * on newer releases, but an explicit activity launch is allowed.
 */
public class DashboardBootstrapActivity extends Activity {
    private static final String TAG = "LabOS.DashboardBootActivity";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        try {
            Intent serviceIntent = new Intent(this, DashboardService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(serviceIntent);
            } else {
                startService(serviceIntent);
            }
            Log.i(TAG, "DashboardService start requested");
        } catch (Exception e) {
            Log.e(TAG, "Failed to start DashboardService", e);
        } finally {
            finish();
        }
    }
}
