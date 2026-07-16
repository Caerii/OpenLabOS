package com.openlab.labos.core;

import android.app.Activity;
import android.content.ComponentName;
import android.content.Intent;
import android.content.ServiceConnection;
import android.os.Build;
import android.os.Bundle;
import android.os.IBinder;
import android.util.Log;
import android.widget.TextView;

import com.openlab.labos.core.ble.McuEventListener;

import org.json.JSONObject;

/**
 * LabOS Glass — Main Activity
 *
 * Binds to LabOsService and displays live hardware sensor data:
 * MCU connection state, battery, IMU, gestures, and button events.
 */
public class MainActivity extends Activity implements McuEventListener {

    private static final String TAG = "LabOS.Main";

    private DeviceController mController;
    private LabOsService mService;
    private boolean mBound = false;

    private TextView mConnectionStatus;
    private TextView mBatteryText;
    private TextView mImuText;
    private TextView mGestureText;
    private TextView mButtonText;
    private TextView mStatusText;

    private final ServiceConnection mServiceConnection = new ServiceConnection() {
        @Override
        public void onServiceConnected(ComponentName name, IBinder binder) {
            LabOsService.LocalBinder localBinder = (LabOsService.LocalBinder) binder;
            mService = localBinder.getService();
            mService.setEventListener(MainActivity.this);
            mBound = true;
            Log.i(TAG, "Bound to LabOsService");

            runOnUiThread(() -> {
                if (mService.getMcu().isConnected()) {
                    mConnectionStatus.setText("MCU: Connected");
                    mConnectionStatus.setTextColor(0xFF00FF88);
                }
            });
        }

        @Override
        public void onServiceDisconnected(ComponentName name) {
            mService = null;
            mBound = false;
            Log.w(TAG, "Unbound from LabOsService");
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        mController = new DeviceController(this);

        mConnectionStatus = findViewById(R.id.connection_status);
        mBatteryText = findViewById(R.id.battery_text);
        mImuText = findViewById(R.id.imu_text);
        mGestureText = findViewById(R.id.gesture_text);
        mButtonText = findViewById(R.id.button_text);
        mStatusText = findViewById(R.id.status_text);

        // Show device info
        StringBuilder info = new StringBuilder();
        info.append(mController.getStatus()).append("\n");
        info.append("Model: ").append(Build.MODEL).append("\n");
        info.append("Android: ").append(Build.VERSION.RELEASE).append("\n");
        info.append("SDK: ").append(Build.VERSION.SDK_INT).append("\n");
        info.append("Hardware: ").append(Build.HARDWARE);
        mStatusText.setText(info.toString());

        // Start and bind to the service
        Intent serviceIntent = new Intent(this, LabOsService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(serviceIntent);
        } else {
            startService(serviceIntent);
        }
        bindService(serviceIntent, mServiceConnection, BIND_AUTO_CREATE);
    }

    @Override
    protected void onDestroy() {
        if (mBound) {
            if (mService != null) mService.setEventListener(null);
            unbindService(mServiceConnection);
            mBound = false;
        }
        super.onDestroy();
    }

    // ──────────────────────────────────────────────
    // McuEventListener — update UI with live sensor data
    // ──────────────────────────────────────────────

    @Override
    public void onMcuConnected() {
        runOnUiThread(() -> {
            mConnectionStatus.setText("MCU: Connected");
            mConnectionStatus.setTextColor(0xFF00FF88);
        });
    }

    @Override
    public void onMcuDisconnected() {
        runOnUiThread(() -> {
            mConnectionStatus.setText("MCU: Disconnected");
            mConnectionStatus.setTextColor(0xFFFF4444);
        });
    }

    @Override
    public void onButtonPress(String buttonId, boolean isLongPress) {
        runOnUiThread(() ->
            mButtonText.setText("Button: " + buttonId + (isLongPress ? " (long)" : " (tap)"))
        );
    }

    @Override
    public void onBatteryUpdate(int percentage, int voltage) {
        runOnUiThread(() -> {
            String text = "Battery: " + percentage + "%";
            if (voltage > 0) text += " (" + voltage + "mV)";
            mBatteryText.setText(text);
        });
    }

    @Override
    public void onImuData(float accelX, float accelY, float accelZ,
                          float gyroX, float gyroY, float gyroZ) {
        runOnUiThread(() -> mImuText.setText(String.format(
            "Accel: %.2f %.2f %.2f\nGyro:  %.2f %.2f %.2f",
            accelX, accelY, accelZ, gyroX, gyroY, gyroZ
        )));
    }

    @Override
    public void onGesture(String gesture) {
        runOnUiThread(() -> mGestureText.setText("Gesture: " + gesture));
    }

    @Override
    public void onPowerButton() {
        Log.d(TAG, "Power button pressed");
    }

    @Override
    public void onRawCommand(JSONObject json) {
        Log.d(TAG, "Raw MCU command: " + json.toString());
    }
}
