package com.openlab.labos.core.audio;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

/**
 * Receives audio playstate broadcasts from the ODM firmware (XY SystemUI).
 *
 * When a phone streams Bluetooth audio (A2DP) to the glasses, the firmware
 * sends a broadcast to the registered I2S receiver package. This receiver
 * catches it and tells LabOsService to open/close the I2S speaker path
 * via the BES2700 MCU so the audio is actually audible.
 *
 * Flow:
 *   Phone BT audio → ODM firmware detects playback → sends broadcast
 *   → this receiver → LabOsService → MCU mh_starti2s → speaker plays
 */
public class I2SAudioBroadcastReceiver extends BroadcastReceiver {

    private static final String TAG = "LabOS.I2SReceiver";

    public static final String ACTION_PLAYSTATE_CHANGE = "com.xy.sound.AUDIO_PLAYSTATE_CHANGE";
    public static final String ACTION_PLAYSTATE_ACTION = "com.xy.sound.AUDIO_PLAYSTATE_ACTION";

    private static final String EXTRA_STATE = "state";
    private static final String STATE_START = "start";

    @Override
    public void onReceive(Context context, Intent intent) {
        final String action = intent.getAction();
        if (!ACTION_PLAYSTATE_CHANGE.equals(action) && !ACTION_PLAYSTATE_ACTION.equals(action)) {
            return;
        }

        final String state = intent.getStringExtra(EXTRA_STATE);
        final boolean playing = STATE_START.equalsIgnoreCase(state);

        Log.i(TAG, "Audio playstate broadcast: state=" + state + " playing=" + playing);

        // Don't react if our own AudioController initiated this playback
        if (AudioController.isControllingI2S()) {
            Log.d(TAG, "Ignoring — we are controlling I2S ourselves");
            return;
        }

        // Forward to LabOsService to open/close I2S path
        Intent serviceIntent = new Intent(context, com.openlab.labos.core.LabOsService.class);
        serviceIntent.setAction("com.openlab.labos.ACTION_I2S_AUDIO_STATE");
        serviceIntent.putExtra("extra_i2s_playing", playing);
        context.startForegroundService(serviceIntent);
    }
}
