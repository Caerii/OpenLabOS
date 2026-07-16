package com.openlab.labos.glass;

import android.app.Activity;
import android.app.admin.DevicePolicyManager;
import android.content.ComponentName;
import android.content.Context;
import android.os.Bundle;
import android.util.Log;
import android.widget.Toast;

/**
 * One-shot activity that clears device owner on launch.
 *
 * This is the migration path from old monolithic LabOS (com.openlab.labos.glass)
 * to the new modular LabOS (com.openlab.labos.core + camera + dashboard + devtools).
 *
 * Usage:
 *   1. Install this APK over the old LabOS (same package name, higher versionCode)
 *   2. Launch: adb shell am start -n com.openlab.labos.glass/.ClearOwnerActivity
 *   3. Device owner is cleared
 *   4. Uninstall: adb shell pm uninstall com.openlab.labos.glass
 *   5. Install new modular APKs
 *   6. Set new device owner: adb shell dpm set-device-owner com.openlab.labos.core/.AdminReceiver
 */
public class ClearOwnerActivity extends Activity {

    private static final String TAG = "LabOS.Migration";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        DevicePolicyManager dpm = (DevicePolicyManager) getSystemService(Context.DEVICE_POLICY_SERVICE);
        ComponentName admin = new ComponentName(this, AdminReceiver.class);

        try {
            if (dpm.isDeviceOwnerApp(getPackageName())) {
                Log.i(TAG, "Clearing device owner for: " + getPackageName());
                dpm.clearDeviceOwnerApp(getPackageName());
                Log.i(TAG, "Device owner cleared successfully!");
                Toast.makeText(this, "Device owner cleared! Safe to uninstall.", Toast.LENGTH_LONG).show();
            } else {
                Log.w(TAG, "This app is not device owner — nothing to clear");
                Toast.makeText(this, "Not device owner — nothing to clear", Toast.LENGTH_SHORT).show();
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to clear device owner", e);
            Toast.makeText(this, "Error: " + e.getMessage(), Toast.LENGTH_LONG).show();
        }

        finish();
    }
}
