package com.openlab.labos.core.ipc;

import android.os.RemoteCallbackList;
import android.os.RemoteException;
import android.util.Log;

import com.openlab.labos.core.ILabOsCallback;
import com.openlab.labos.core.McuEvent;
import com.openlab.labos.core.ble.McuEventListener;

import org.json.JSONObject;

/**
 * Dispatches MCU events to both local in-process listeners and remote
 * AIDL callback clients (satellite APKs like camera, dashboard, devtools).
 *
 * Uses Android's RemoteCallbackList for automatic dead-process cleanup.
 */
public class McuEventDispatcher implements McuEventListener {

    private static final String TAG = "LabOS.EventDispatcher";

    private final McuEventListener mLocalListener;
    private final RemoteCallbackList<ILabOsCallback> mRemoteCallbacks = new RemoteCallbackList<>();

    public McuEventDispatcher(McuEventListener localListener) {
        mLocalListener = localListener;
    }

    /** Register a remote AIDL callback */
    public void registerCallback(ILabOsCallback callback) {
        mRemoteCallbacks.register(callback);
    }

    /** Unregister a remote AIDL callback */
    public void unregisterCallback(ILabOsCallback callback) {
        mRemoteCallbacks.unregister(callback);
    }

    // ── McuEventListener implementation ──────────

    @Override
    public void onMcuConnected() {
        if (mLocalListener != null) mLocalListener.onMcuConnected();
        broadcastRemote(cb -> cb.onConnectionStateChanged(true));
    }

    @Override
    public void onMcuDisconnected() {
        if (mLocalListener != null) mLocalListener.onMcuDisconnected();
        broadcastRemote(cb -> cb.onConnectionStateChanged(false));
    }

    @Override
    public void onButtonPress(String buttonId, boolean isLongPress) {
        if (mLocalListener != null) mLocalListener.onButtonPress(buttonId, isLongPress);
        broadcastRemote(cb -> cb.onButtonPress(buttonId, isLongPress));
    }

    @Override
    public void onBatteryUpdate(int percentage, int voltage) {
        if (mLocalListener != null) mLocalListener.onBatteryUpdate(percentage, voltage);
        broadcastRemote(cb -> cb.onBatteryUpdate(percentage, voltage));
    }

    @Override
    public void onImuData(float accelX, float accelY, float accelZ,
                          float gyroX, float gyroY, float gyroZ) {
        if (mLocalListener != null) {
            mLocalListener.onImuData(accelX, accelY, accelZ, gyroX, gyroY, gyroZ);
        }
        float[] accel = {accelX, accelY, accelZ};
        float[] gyro = {gyroX, gyroY, gyroZ};
        broadcastRemote(cb -> cb.onImuData(accel, gyro));
    }

    @Override
    public void onGesture(String gesture) {
        if (mLocalListener != null) mLocalListener.onGesture(gesture);
        broadcastRemote(cb -> cb.onGesture(gesture));
    }

    @Override
    public void onPowerButton() {
        if (mLocalListener != null) mLocalListener.onPowerButton();
        // Power button maps to a button press for remote clients
        broadcastRemote(cb -> cb.onButtonPress("power", false));
    }

    @Override
    public void onRawCommand(JSONObject json) {
        if (mLocalListener != null) mLocalListener.onRawCommand(json);
        McuEvent event = new McuEvent(McuEvent.TYPE_RAW, json.toString());
        broadcastRemote(cb -> cb.onMcuEvent(event));
    }

    // ── Internal ─────────────────────────────────

    @FunctionalInterface
    private interface RemoteCall {
        void call(ILabOsCallback callback) throws RemoteException;
    }

    private void broadcastRemote(RemoteCall action) {
        int n = mRemoteCallbacks.beginBroadcast();
        for (int i = 0; i < n; i++) {
            try {
                action.call(mRemoteCallbacks.getBroadcastItem(i));
            } catch (RemoteException e) {
                // Client died — RemoteCallbackList handles cleanup
            }
        }
        mRemoteCallbacks.finishBroadcast();
    }
}
