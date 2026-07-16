package com.openlab.labos.camera;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

/**
 * Receives camera commands from core-app and routes them to CameraService.
 *
 * Commands come as broadcasts from core-app when MCU buttons are pressed
 * or from the dashboard via ADB broadcasts.
 */
public class CameraCommandReceiver extends BroadcastReceiver {

    private static final String TAG = "LabOS.CameraReceiver";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || intent.getAction() == null) return;

        Log.d(TAG, "Received: " + intent.getAction());

        CameraService service = CameraService.getInstance();
        if (service != null) {
            // Service is running — handle directly
            service.handleCommand(intent.getAction(), intent);
        } else {
            // Service not running — start it with the command
            Intent serviceIntent = new Intent(context, CameraService.class);
            serviceIntent.setAction(intent.getAction());
            if (intent.getExtras() != null) {
                serviceIntent.putExtras(intent.getExtras());
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(serviceIntent);
            } else {
                context.startService(serviceIntent);
            }
        }
    }
}
