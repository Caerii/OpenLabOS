package com.openlab.labos.core.sensors;

import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import com.openlab.labos.core.ble.McuConnection;

import org.json.JSONException;
import org.json.JSONObject;

/**
 * Manages IMU sensor data from the the HMD-class device MCU (BES2700).
 *
 * The K900 hardware has an onboard IMU connected to the BES2700 MCU. This
 * manager sends JSON commands over UART (via {@link McuConnection}) to request
 * single readings, start/stop continuous streaming, and subscribe/unsubscribe
 * to head-gesture detection on the MCU side.
 *
 * <p>IMU data arrives asynchronously through {@link com.openlab.labos.core.ble.McuEventListener}
 * callbacks (onImuData / onGesture). This class only controls the MCU's
 * streaming state; the caller is responsible for wiring the listener.</p>
 *
 * <h3>Auto-timeout safety</h3>
 * Continuous streaming auto-stops after 60 seconds and gesture subscriptions
 * auto-stop after 30 seconds to prevent the MCU from streaming indefinitely
 * if the requester forgets to stop.
 */
public class ImuManager {

    private static final String TAG = "LabOS.ImuManager";

    /** Auto-timeout for continuous IMU streaming (ms). */
    private static final long STREAM_TIMEOUT_MS = 60_000;

    /** Auto-timeout for gesture subscriptions (ms). */
    private static final long GESTURE_TIMEOUT_MS = 30_000;

    private final McuConnection mMcu;
    private final Handler mHandler;

    private boolean mStreaming = false;
    private boolean mGestureSubscribed = false;

    private Runnable mStreamTimeoutRunnable;
    private Runnable mGestureTimeoutRunnable;

    /**
     * Create an ImuManager that sends commands through the given MCU connection.
     *
     * @param mcu active {@link McuConnection} for UART communication
     */
    public ImuManager(McuConnection mcu) {
        if (mcu == null) {
            throw new IllegalArgumentException("McuConnection must not be null");
        }
        this.mMcu = mcu;
        this.mHandler = new Handler(Looper.getMainLooper());
        Log.d(TAG, "ImuManager initialized");
    }

    // ──────────────────────────────────────────────
    // Single reading
    // ──────────────────────────────────────────────

    /**
     * Request a single IMU reading from the MCU.
     * The response will arrive via the McuEventListener.onImuData callback.
     *
     * @return true if the command was sent successfully
     */
    public boolean requestSingleReading() {
        Log.d(TAG, "Requesting single IMU reading");
        try {
            JSONObject cmd = new JSONObject();
            cmd.put("cmd", "imu_single");
            return mMcu.sendJson(cmd);
        } catch (JSONException e) {
            Log.e(TAG, "Failed to build imu_single command", e);
            return false;
        }
    }

    // ──────────────────────────────────────────────
    // Continuous streaming
    // ──────────────────────────────────────────────

    /**
     * Start continuous IMU streaming from the MCU.
     * Data will arrive via McuEventListener.onImuData at the MCU's native rate.
     * Streaming auto-stops after {@value #STREAM_TIMEOUT_MS} ms.
     *
     * @return true if the start command was sent successfully
     */
    public boolean startStreaming() {
        if (mStreaming) {
            Log.w(TAG, "IMU streaming already active");
            return true;
        }

        Log.i(TAG, "Starting IMU stream");
        try {
            JSONObject cmd = new JSONObject();
            cmd.put("cmd", "imu_stream");
            cmd.put("action", "start");

            boolean sent = mMcu.sendJson(cmd);
            if (sent) {
                mStreaming = true;
                scheduleStreamTimeout();
            }
            return sent;
        } catch (JSONException e) {
            Log.e(TAG, "Failed to build imu_stream start command", e);
            return false;
        }
    }

    /**
     * Stop continuous IMU streaming.
     *
     * @return true if the stop command was sent successfully
     */
    public boolean stopStreaming() {
        if (!mStreaming) {
            Log.d(TAG, "IMU streaming not active, nothing to stop");
            return true;
        }

        Log.i(TAG, "Stopping IMU stream");
        cancelStreamTimeout();

        try {
            JSONObject cmd = new JSONObject();
            cmd.put("cmd", "imu_stream");
            cmd.put("action", "stop");

            boolean sent = mMcu.sendJson(cmd);
            mStreaming = false;
            return sent;
        } catch (JSONException e) {
            Log.e(TAG, "Failed to build imu_stream stop command", e);
            mStreaming = false;
            return false;
        }
    }

    /**
     * Check whether continuous IMU streaming is active.
     *
     * @return true if streaming
     */
    public boolean isStreaming() {
        return mStreaming;
    }

    // ──────────────────────────────────────────────
    // Gesture subscription
    // ──────────────────────────────────────────────

    /**
     * Subscribe to head-gesture detection on the MCU.
     * Gestures will arrive via McuEventListener.onGesture.
     * The subscription auto-stops after {@value #GESTURE_TIMEOUT_MS} ms.
     *
     * @return true if the subscribe command was sent successfully
     */
    public boolean startGestureSubscription() {
        if (mGestureSubscribed) {
            Log.w(TAG, "Gesture subscription already active");
            return true;
        }

        Log.i(TAG, "Starting gesture subscription");
        try {
            JSONObject cmd = new JSONObject();
            cmd.put("cmd", "gesture_sub");
            cmd.put("action", "start");

            boolean sent = mMcu.sendJson(cmd);
            if (sent) {
                mGestureSubscribed = true;
                scheduleGestureTimeout();
            }
            return sent;
        } catch (JSONException e) {
            Log.e(TAG, "Failed to build gesture_sub start command", e);
            return false;
        }
    }

    /**
     * Unsubscribe from head-gesture detection.
     *
     * @return true if the unsubscribe command was sent successfully
     */
    public boolean stopGestureSubscription() {
        if (!mGestureSubscribed) {
            Log.d(TAG, "Gesture subscription not active, nothing to stop");
            return true;
        }

        Log.i(TAG, "Stopping gesture subscription");
        cancelGestureTimeout();

        try {
            JSONObject cmd = new JSONObject();
            cmd.put("cmd", "gesture_sub");
            cmd.put("action", "stop");

            boolean sent = mMcu.sendJson(cmd);
            mGestureSubscribed = false;
            return sent;
        } catch (JSONException e) {
            Log.e(TAG, "Failed to build gesture_sub stop command", e);
            mGestureSubscribed = false;
            return false;
        }
    }

    /**
     * Check whether gesture detection is currently subscribed.
     *
     * @return true if subscribed
     */
    public boolean isGestureSubscribed() {
        return mGestureSubscribed;
    }

    // ──────────────────────────────────────────────
    // Timeout helpers
    // ──────────────────────────────────────────────

    private void scheduleStreamTimeout() {
        cancelStreamTimeout();
        mStreamTimeoutRunnable = () -> {
            Log.w(TAG, "IMU stream auto-timeout after " + STREAM_TIMEOUT_MS + " ms");
            stopStreaming();
        };
        mHandler.postDelayed(mStreamTimeoutRunnable, STREAM_TIMEOUT_MS);
    }

    private void cancelStreamTimeout() {
        if (mStreamTimeoutRunnable != null) {
            mHandler.removeCallbacks(mStreamTimeoutRunnable);
            mStreamTimeoutRunnable = null;
        }
    }

    private void scheduleGestureTimeout() {
        cancelGestureTimeout();
        mGestureTimeoutRunnable = () -> {
            Log.w(TAG, "Gesture subscription auto-timeout after " + GESTURE_TIMEOUT_MS + " ms");
            stopGestureSubscription();
        };
        mHandler.postDelayed(mGestureTimeoutRunnable, GESTURE_TIMEOUT_MS);
    }

    private void cancelGestureTimeout() {
        if (mGestureTimeoutRunnable != null) {
            mHandler.removeCallbacks(mGestureTimeoutRunnable);
            mGestureTimeoutRunnable = null;
        }
    }

    // ──────────────────────────────────────────────
    // Lifecycle
    // ──────────────────────────────────────────────

    /**
     * Stop all active operations and release handler callbacks.
     * Call this when the owning service/component is destroyed.
     */
    public void shutdown() {
        Log.d(TAG, "Shutting down ImuManager");
        stopStreaming();
        stopGestureSubscription();
    }
}
