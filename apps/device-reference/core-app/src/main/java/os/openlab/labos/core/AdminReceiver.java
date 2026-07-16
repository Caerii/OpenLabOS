package com.openlab.labos.core;

import android.app.admin.DeviceAdminReceiver;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

/**
 * Device Admin Receiver for LabOS Glass.
 *
 * This is the component that gets registered as device owner via:
 *   adb shell dpm set-device-owner com.openlab.labos.core/.AdminReceiver
 *
 * Once active, this gives LabOS full device management powers:
 *   - Silent app install/uninstall
 *   - Kiosk/lock task mode
 *   - Network and WiFi policy control
 *   - Package management
 *   - Reboot commands
 */
public class AdminReceiver extends DeviceAdminReceiver {

    private static final String TAG = "LabOS.Admin";

    public static ComponentName getComponentName(Context context) {
        return new ComponentName(context.getApplicationContext(), AdminReceiver.class);
    }

    @Override
    public void onEnabled(Context context, Intent intent) {
        super.onEnabled(context, intent);
        Log.i(TAG, "LabOS device admin enabled");

        // Ensure camera is not disabled by device-owner policy
        try {
            android.app.admin.DevicePolicyManager dpm =
                (android.app.admin.DevicePolicyManager) context.getSystemService(Context.DEVICE_POLICY_SERVICE);
            ComponentName admin = getComponentName(context);
            if (dpm != null && dpm.getCameraDisabled(admin)) {
                dpm.setCameraDisabled(admin, false);
                Log.i(TAG, "Camera re-enabled by policy");
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to enable camera policy", e);
        }
    }

    @Override
    public void onDisabled(Context context, Intent intent) {
        super.onDisabled(context, intent);
        Log.w(TAG, "LabOS device admin disabled");
    }

    @Override
    public void onProfileProvisioningComplete(Context context, Intent intent) {
        super.onProfileProvisioningComplete(context, intent);
        Log.i(TAG, "LabOS provisioning complete");
    }
}
