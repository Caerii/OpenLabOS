package com.openlab.labos.core.hardware;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.provider.Settings;
import android.util.Log;

/**
 * System-level broadcast commands for the Mentra Live (K900) hardware.
 *
 * These commands work by sending broadcasts to the ODM's SystemUI receiver
 * (com.android.systemui.CTReceiver) which has privileged access to hardware
 * controls. This is how MentraOS stock client controls WiFi, hotspot, display
 * brightness, package management, and other system functions.
 *
 * Ported from MentraOS asg_client SysControl.java for LabOS Glass.
 */
public class SysControl {

    private static final String TAG = "LabOS.SysControl";
    private static final String ACTION = "com.xy.xsetting.action";
    private static final String PACKAGE = "com.android.systemui";
    private static final String RECEIVER = "com.android.systemui.CTReceiver";

    // ──────────────────────────────────────────────
    // Power
    // ──────────────────────────────────────────────

    public static void reboot(Context context) {
        Intent nn = new Intent();
        nn.putExtra("cmd", "reboot");
        sendBroadcast(context, nn);
    }

    public static void shutdown(Context context) {
        Log.i(TAG, "Initiating device shutdown");
        Intent nn = new Intent();
        nn.putExtra("cmd", "shutdown");
        sendBroadcast(context, nn);
    }

    public static void wakeUp(Context context) {
        Intent nn = new Intent();
        nn.putExtra("cmd", "wakeup");
        sendBroadcast(context, nn);
    }

    public static void sleep(Context context) {
        Intent nn = new Intent();
        nn.putExtra("cmd", "sleep");
        sendBroadcast(context, nn);
    }

    // ──────────────────────────────────────────────
    // Display
    // ──────────────────────────────────────────────

    public static void setBrightness(Context context, int bright) {
        bright = Math.max(25, Math.min(250, bright));
        Intent nn = new Intent();
        nn.putExtra("cmd", "brightness");
        nn.putExtra("value", bright);
        sendBroadcast(context, nn);
    }

    // ──────────────────────────────────────────────
    // WiFi
    // ──────────────────────────────────────────────

    public static void enableWifi(Context context) {
        Intent nn = new Intent(ACTION);
        nn.setPackage(PACKAGE);
        nn.putExtra("cmd", "setwifi");
        nn.putExtra("enable", true);
        context.sendBroadcast(nn);
    }

    public static void disableWifi(Context context) {
        Intent nn = new Intent(ACTION);
        nn.setPackage(PACKAGE);
        nn.putExtra("cmd", "setwifi");
        nn.putExtra("enable", false);
        context.sendBroadcast(nn);
    }

    public static void scanWifi(Context context) {
        Intent nn = new Intent(ACTION);
        nn.setPackage(PACKAGE);
        nn.putExtra("cmd", "scan_wifi");
        context.sendBroadcast(nn);
    }

    public static void connectToWifi(Context context, String ssid, String password) {
        if (ssid == null || ssid.isEmpty()) return;
        Intent nn = new Intent(ACTION);
        nn.setPackage(PACKAGE);
        nn.putExtra("cmd", "connectwifi");
        nn.putExtra("ssid", ssid);
        nn.putExtra("pwd", password);
        context.sendBroadcast(nn);
    }

    public static void disconnectFromWifi(Context context) {
        Intent nn = new Intent(ACTION);
        nn.setPackage(PACKAGE);
        nn.putExtra("cmd", "disconnectwifi");
        context.sendBroadcast(nn);
    }

    // ──────────────────────────────────────────────
    // Hotspot
    // ──────────────────────────────────────────────

    public static void openHotspot(Context context, String ssid, String password) {
        Intent nn = new Intent();
        nn.putExtra("cmd", "ap_start");
        nn.putExtra("enable", true);
        if (ssid != null && !ssid.isEmpty()) nn.putExtra("ssid", ssid);
        if (password != null && password.length() >= 8) nn.putExtra("pwd", password);
        sendBroadcast(context, nn);
    }

    public static void closeHotspot(Context context) {
        Intent nn = new Intent();
        nn.putExtra("cmd", "ap_start");
        nn.putExtra("enable", false);
        sendBroadcast(context, nn);
    }

    // ──────────────────────────────────────────────
    // Package Management
    // ──────────────────────────────────────────────

    public static void installApk(Context context, String filePath) {
        Intent nn = new Intent();
        nn.putExtra("cmd", "install");
        nn.putExtra("pkpath", filePath);
        nn.putExtra("recv_pkname", context.getPackageName());
        nn.putExtra("startapp", true);
        sendBroadcast(context, nn);
    }

    public static void stopApp(Context context, String packageName) {
        Intent nn = new Intent();
        nn.putExtra("cmd", "forceStop");
        nn.putExtra("pkname", packageName);
        sendBroadcast(context, nn);
    }

    public static void enablePackage(Context context, String packageName) {
        Intent nn = new Intent();
        nn.putExtra("cmd", "enable");
        nn.putExtra("pkname", packageName);
        sendBroadcast(context, nn);
    }

    public static void disablePackage(Context context, String packageName) {
        Intent nn = new Intent();
        nn.putExtra("cmd", "disable");
        nn.putExtra("pkname", packageName);
        sendBroadcast(context, nn);
    }

    public static void uninstallPackage(Context context, String packageName) {
        Intent nn = new Intent();
        nn.putExtra("cmd", "uninstall");
        nn.putExtra("pkname", packageName);
        sendBroadcast(context, nn);
    }

    // ──────────────────────────────────────────────
    // System Properties
    // ──────────────────────────────────────────────

    public static void setSystemTime(Context context, long timeMillis) {
        Intent nn = new Intent();
        nn.putExtra("cmd", "settime");
        nn.putExtra("timemills", timeMillis);
        sendBroadcast(context, nn);
    }

    public static void setSystemProperty(Context context, String name, String value) {
        Intent nn = new Intent();
        nn.putExtra("cmd", "setProperty");
        nn.putExtra("name", name);
        nn.putExtra("value", value);
        sendBroadcast(context, nn);
    }

    // ──────────────────────────────────────────────
    // OTA / Firmware
    // ──────────────────────────────────────────────

    public static void installMtkOta(Context context, String otaPath) {
        if (otaPath == null || otaPath.isEmpty()) return;
        Log.i(TAG, "Installing MTK OTA from: " + otaPath);
        Intent nn = new Intent("com.xy.updateota");
        nn.putExtra("cmd", "start");
        nn.putExtra("pkname", context.getPackageName());
        nn.putExtra("path", otaPath);
        nn.setPackage(PACKAGE);
        context.sendBroadcast(nn);
    }

    // ──────────────────────────────────────────────
    // Input Simulation
    // ──────────────────────────────────────────────

    public static void clickKeyEvent(Context context, int keyCode) {
        Intent nn = new Intent();
        nn.putExtra("cmd", "keyevent");
        nn.putExtra("keycode", keyCode);
        sendBroadcast(context, nn);
    }

    public static void clickPosition(Context context, int x, int y) {
        Intent nn = new Intent();
        nn.putExtra("cmd", "clickposition");
        nn.putExtra("x", x);
        nn.putExtra("y", y);
        sendBroadcast(context, nn);
    }

    public static void inputText(Context context, String text) {
        Intent nn = new Intent();
        nn.putExtra("cmd", "inputtext");
        nn.putExtra("text", text);
        sendBroadcast(context, nn);
    }

    // ──────────────────────────────────────────────
    // Audio
    // ──────────────────────────────────────────────

    public static void setI2SAudioReceiverPackage(Context context, String packageName) {
        Intent nn = new Intent();
        nn.putExtra("cmd", "i2s_pkname");
        nn.putExtra("pkname", packageName);
        sendBroadcast(context, nn);
    }

    // ──────────────────────────────────────────────
    // Internal broadcast sender
    // ──────────────────────────────────────────────

    private static void sendBroadcast(Context context, Intent nn) {
        nn.setAction(ACTION);
        nn.setPackage(PACKAGE);
        nn.setComponent(new ComponentName(PACKAGE, RECEIVER));
        nn.setFlags(0x400000);

        try {
            context.sendBroadcast(nn);
        } catch (Exception e) {
            Log.e(TAG, "Broadcast failed: " + e.getMessage(), e);
        }
    }
}
