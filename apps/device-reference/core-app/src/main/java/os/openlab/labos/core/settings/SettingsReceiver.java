package com.openlab.labos.core.settings;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

import org.json.JSONObject;

import java.io.File;
import java.io.FileWriter;

/**
 * BroadcastReceiver for reading and updating LabOS settings via ADB.
 *
 * Used by the web dashboard to manage device settings remotely:
 * - GET:    adb shell am broadcast -a com.openlab.labos.ACTION_GET_SETTINGS
 *           Dumps all settings to /sdcard/LabOS/.settings_dump.json
 * - UPDATE: adb shell am broadcast -a com.openlab.labos.ACTION_UPDATE_SETTINGS
 *           --es settings '{"audio_volume":0.5,"jpeg_quality":90}'
 */
public class SettingsReceiver extends BroadcastReceiver {

    private static final String TAG = "LabOS.SettingsReceiver";
    private static final String ACTION_GET = "com.openlab.labos.ACTION_GET_SETTINGS";
    private static final String ACTION_UPDATE = "com.openlab.labos.ACTION_UPDATE_SETTINGS";
    private static final String DUMP_PATH = "/sdcard/LabOS/.settings_dump.json";

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if (action == null) return;

        LabOsSettings settings = new LabOsSettings(context);

        switch (action) {
            case ACTION_GET:
                dumpSettings(settings);
                break;
            case ACTION_UPDATE:
                String json = intent.getStringExtra("settings");
                if (json != null && !json.isEmpty()) {
                    applySettings(settings, json);
                } else {
                    Log.w(TAG, "No settings JSON provided in UPDATE broadcast");
                }
                // Also dump after update so dashboard can read back the result
                dumpSettings(settings);
                break;
        }
    }

    private void dumpSettings(LabOsSettings settings) {
        try {
            JSONObject all = settings.getAll();
            File dumpFile = new File(DUMP_PATH);
            File parent = dumpFile.getParentFile();
            if (parent != null && !parent.exists()) parent.mkdirs();

            try (FileWriter writer = new FileWriter(dumpFile)) {
                writer.write(all.toString(2));
            }
            Log.i(TAG, "Settings dumped to " + DUMP_PATH);
        } catch (Exception e) {
            Log.e(TAG, "Failed to dump settings", e);
        }
    }

    private void applySettings(LabOsSettings settings, String jsonStr) {
        try {
            JSONObject json = new JSONObject(jsonStr);
            settings.setFromJson(json);
            Log.i(TAG, "Settings updated from broadcast");
        } catch (Exception e) {
            Log.e(TAG, "Failed to apply settings: " + e.getMessage(), e);
        }
    }
}
