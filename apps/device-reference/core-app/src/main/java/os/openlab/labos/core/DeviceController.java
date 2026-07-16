package com.openlab.labos.core;

import android.app.admin.DevicePolicyManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.UserManager;
import android.util.Log;

/**
 * Device management operations available once LabOS is device owner.
 *
 * This is where the real power lives — silent installs, package control,
 * kiosk mode, reboot, and policy enforcement.
 */
public class DeviceController {

    private static final String TAG = "LabOS.Controller";

    private final Context mContext;
    private final DevicePolicyManager mDpm;
    private final ComponentName mAdmin;

    public DeviceController(Context context) {
        mContext = context.getApplicationContext();
        mDpm = (DevicePolicyManager) mContext.getSystemService(Context.DEVICE_POLICY_SERVICE);
        mAdmin = AdminReceiver.getComponentName(mContext);
    }

    /** Check if we are currently the device owner */
    public boolean isDeviceOwner() {
        return mDpm.isDeviceOwnerApp(mContext.getPackageName());
    }

    /** Check if we are an active admin */
    public boolean isAdmin() {
        return mDpm.isAdminActive(mAdmin);
    }

    /** Reboot the device (requires device owner) */
    public void reboot() {
        if (isDeviceOwner()) {
            Log.i(TAG, "Rebooting device");
            mDpm.reboot(mAdmin);
        } else {
            Log.w(TAG, "Cannot reboot — not device owner");
        }
    }

    /** Lock the device to this app (kiosk mode) */
    public void enableKioskMode() {
        if (!isDeviceOwner()) {
            Log.w(TAG, "Cannot enable kiosk — not device owner");
            return;
        }
        // Allow this package to enter lock task mode
        mDpm.setLockTaskPackages(mAdmin, new String[]{mContext.getPackageName()});
        Log.i(TAG, "Kiosk mode enabled for LabOS");
    }

    /** Exit kiosk mode */
    public void disableKioskMode() {
        if (!isDeviceOwner()) return;
        mDpm.setLockTaskPackages(mAdmin, new String[]{});
        Log.i(TAG, "Kiosk mode disabled");
    }

    /** Hide a package (makes it invisible to the user) */
    public void hidePackage(String packageName) {
        if (!isDeviceOwner()) return;
        mDpm.setApplicationHidden(mAdmin, packageName, true);
        Log.i(TAG, "Hidden package: " + packageName);
    }

    /** Unhide a package */
    public void unhidePackage(String packageName) {
        if (!isDeviceOwner()) return;
        mDpm.setApplicationHidden(mAdmin, packageName, false);
        Log.i(TAG, "Unhidden package: " + packageName);
    }

    /** Suspend a package (greys it out, can't launch) */
    public void suspendPackage(String packageName) {
        if (!isDeviceOwner()) return;
        mDpm.setPackagesSuspended(mAdmin, new String[]{packageName}, true);
        Log.i(TAG, "Suspended package: " + packageName);
    }

    /** Set a user restriction (e.g., disallow factory reset) */
    public void addUserRestriction(String restriction) {
        if (!isDeviceOwner()) return;
        mDpm.addUserRestriction(mAdmin, restriction);
        Log.i(TAG, "Added restriction: " + restriction);
    }

    /** Remove a user restriction */
    public void removeUserRestriction(String restriction) {
        if (!isDeviceOwner()) return;
        mDpm.clearUserRestriction(mAdmin, restriction);
        Log.i(TAG, "Removed restriction: " + restriction);
    }

    /** Lock down the device — prevent factory reset, safe boot, USB file transfer */
    public void lockdown() {
        if (!isDeviceOwner()) return;
        mDpm.addUserRestriction(mAdmin, UserManager.DISALLOW_FACTORY_RESET);
        mDpm.addUserRestriction(mAdmin, UserManager.DISALLOW_SAFE_BOOT);
        mDpm.addUserRestriction(mAdmin, UserManager.DISALLOW_USB_FILE_TRANSFER);
        mDpm.addUserRestriction(mAdmin, UserManager.DISALLOW_INSTALL_UNKNOWN_SOURCES);
        Log.i(TAG, "Device locked down");
    }

    /** Remove all lockdown restrictions */
    public void unlock() {
        if (!isDeviceOwner()) return;
        mDpm.clearUserRestriction(mAdmin, UserManager.DISALLOW_FACTORY_RESET);
        mDpm.clearUserRestriction(mAdmin, UserManager.DISALLOW_SAFE_BOOT);
        mDpm.clearUserRestriction(mAdmin, UserManager.DISALLOW_USB_FILE_TRANSFER);
        mDpm.clearUserRestriction(mAdmin, UserManager.DISALLOW_INSTALL_UNKNOWN_SOURCES);
        Log.i(TAG, "Device restrictions cleared");
    }

    /**
     * Clear device owner status. This is needed when migrating (e.g., adding
     * sharedUserId) since the package must be uninstalled and reinstalled.
     * Call via: adb shell am broadcast -a com.openlab.labos.core.ACTION_CLEAR_DEVICE_OWNER
     */
    public void clearDeviceOwner() {
        if (!isDeviceOwner()) {
            Log.w(TAG, "Cannot clear device owner — not device owner");
            return;
        }
        Log.i(TAG, "Clearing device owner for: " + mContext.getPackageName());
        mDpm.clearDeviceOwnerApp(mContext.getPackageName());
        Log.i(TAG, "Device owner cleared successfully");
    }

    /** Get a status summary */
    public String getStatus() {
        StringBuilder sb = new StringBuilder();
        sb.append("LabOS Device Controller\n");
        sb.append("=======================\n");
        sb.append("Device Owner: ").append(isDeviceOwner() ? "YES" : "NO").append("\n");
        sb.append("Active Admin: ").append(isAdmin() ? "YES" : "NO").append("\n");
        sb.append("Package: ").append(mContext.getPackageName()).append("\n");
        return sb.toString();
    }
}
