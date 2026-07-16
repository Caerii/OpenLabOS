package com.openlab.labos.sdk;

import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.ServiceConnection;
import android.os.IBinder;
import android.os.RemoteException;
import android.util.Log;

import com.openlab.labos.core.ILabOsCallback;
import com.openlab.labos.core.ILabOsCore;
import com.openlab.labos.core.McuCommand;

/**
 * Helper class for satellite APKs to bind to the LabOS core service.
 * Handles connection lifecycle, reconnection, and provides a clean API.
 *
 * Usage:
 *   LabOsClient client = new LabOsClient(context);
 *   client.connect(new LabOsClient.ConnectionListener() { ... });
 *   // Use client.getCore() to access ILabOsCore
 *   client.disconnect();
 */
public class LabOsClient {

    private static final String TAG = "LabOS.Client";

    private final Context mContext;
    private ILabOsCore mCore;
    private boolean mBound = false;
    private ConnectionListener mListener;

    public interface ConnectionListener {
        void onConnected(ILabOsCore core);
        void onDisconnected();
    }

    private final ServiceConnection mConnection = new ServiceConnection() {
        @Override
        public void onServiceConnected(ComponentName name, IBinder service) {
            mCore = ILabOsCore.Stub.asInterface(service);
            mBound = true;
            Log.i(TAG, "Connected to LabOS core service");
            if (mListener != null) mListener.onConnected(mCore);
        }

        @Override
        public void onServiceDisconnected(ComponentName name) {
            mCore = null;
            mBound = false;
            Log.w(TAG, "Disconnected from LabOS core service");
            if (mListener != null) mListener.onDisconnected();
        }
    };

    public LabOsClient(Context context) {
        mContext = context.getApplicationContext();
    }

    /**
     * Bind to the LabOS core service.
     */
    public void connect(ConnectionListener listener) {
        mListener = listener;
        Intent intent = new Intent();
        intent.setComponent(new ComponentName(
                LabOsConstants.CORE_PACKAGE,
                LabOsConstants.CORE_SERVICE_CLASS));
        try {
            mContext.bindService(intent, mConnection, Context.BIND_AUTO_CREATE);
        } catch (Exception e) {
            Log.e(TAG, "Failed to bind to core service", e);
        }
    }

    /**
     * Unbind from the core service.
     */
    public void disconnect() {
        if (mBound) {
            try {
                mContext.unbindService(mConnection);
            } catch (Exception e) {
                Log.w(TAG, "Unbind failed", e);
            }
            mBound = false;
            mCore = null;
        }
    }

    /**
     * Check if connected to core service.
     */
    public boolean isConnected() {
        return mBound && mCore != null;
    }

    /**
     * Get the AIDL interface for direct calls.
     */
    public ILabOsCore getCore() {
        return mCore;
    }

    /**
     * Send an MCU command (convenience method).
     */
    public boolean sendMcuCommand(String json) {
        if (mCore == null) return false;
        try {
            return mCore.sendMcuCommand(new McuCommand(json));
        } catch (RemoteException e) {
            Log.e(TAG, "sendMcuCommand failed", e);
            return false;
        }
    }

    /**
     * Register for event callbacks (convenience method).
     */
    public void registerCallback(ILabOsCallback callback) {
        if (mCore == null) return;
        try {
            mCore.registerCallback(callback);
        } catch (RemoteException e) {
            Log.e(TAG, "registerCallback failed", e);
        }
    }

    /**
     * Unregister event callbacks (convenience method).
     */
    public void unregisterCallback(ILabOsCallback callback) {
        if (mCore == null) return;
        try {
            mCore.unregisterCallback(callback);
        } catch (RemoteException e) {
            Log.e(TAG, "unregisterCallback failed", e);
        }
    }
}
