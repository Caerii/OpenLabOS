package com.openlab.labos.core.ble;

import android.util.Log;

import com.openlab.labos.core.settings.LabOsSettings;
import com.lhs.serialport.api.SerialManager;

import org.json.JSONObject;

import java.io.InputStream;
import java.io.OutputStream;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Manages the UART serial connection to the the HMD-class device MCU (BES2700).
 *
 * The K900/the HMD-class device has an onboard BES2700 Bluetooth module connected
 * to the Android SoC via UART at /dev/ttyS1 @ 460800 baud. This class
 * opens that serial port, continuously reads incoming data, parses K900
 * protocol frames, and dispatches events to registered listeners.
 *
 * Architecture:
 *   LabOS App → McuConnection → /dev/ttyS1 (UART) → BES2700 MCU
 */
public class McuConnection {

    private static final String TAG = "LabOS.McuConnection";

    private final LabOsSettings mSettings;
    private final List<McuEventListener> mListeners = new CopyOnWriteArrayList<>();
    private final K900Protocol.MessageParser mParser = new K900Protocol.MessageParser();
    private final AtomicBoolean mRunning = new AtomicBoolean(false);
    private final AtomicBoolean mConnected = new AtomicBoolean(false);

    private Thread mReadThread;
    private OutputStream mOutputStream;
    private volatile boolean mFastMode = false;
    private int mDebugLogCount = 0;

    public McuConnection(LabOsSettings settings) {
        mSettings = settings;
    }

    /**
     * Open the serial connection to the MCU and start receiving data.
     * Returns true if the serial port was opened successfully.
     */
    public boolean connect() {
        if (mRunning.get()) {
            Log.w(TAG, "Already connected");
            return true;
        }

        String serialPath = mSettings.getSerialPort();
        int baudRate = mSettings.getBaudRate();
        Log.i(TAG, "Opening UART " + serialPath + " @ " + baudRate);

        boolean opened = SerialManager.getInstance().openSerial(serialPath, baudRate);
        if (!opened) {
            Log.e(TAG, "Failed to open serial port " + serialPath);
            return false;
        }

        mOutputStream = SerialManager.getInstance().getOutputStream(serialPath);
        InputStream inputStream = SerialManager.getInstance().getInputStream(serialPath);

        if (mOutputStream == null || inputStream == null) {
            Log.e(TAG, "Failed to get serial streams");
            return false;
        }

        mRunning.set(true);
        mConnected.set(true);
        mParser.reset();

        // Start read thread
        mReadThread = new Thread(() -> readLoop(inputStream), "LabOS-MCU-Read");
        mReadThread.setDaemon(true);
        mReadThread.start();

        Log.i(TAG, "MCU connected via UART");

        // Send MCU initialization handshake sequence
        initializeMcu();

        // Notify listeners
        for (McuEventListener l : mListeners) {
            l.onMcuConnected();
        }

        return true;
    }

    /**
     * Close the serial connection.
     */
    public void disconnect() {
        mRunning.set(false);
        mConnected.set(false);

        SerialManager.getInstance().closeSerial(mSettings.getSerialPort());

        if (mReadThread != null) {
            mReadThread.interrupt();
            mReadThread = null;
        }

        mOutputStream = null;
        Log.i(TAG, "MCU disconnected");

        for (McuEventListener l : mListeners) {
            l.onMcuDisconnected();
        }
    }

    /**
     * Send raw bytes to the MCU.
     */
    public boolean sendRaw(byte[] data) {
        if (!mConnected.get() || mOutputStream == null) {
            Log.w(TAG, "Cannot send — not connected");
            return false;
        }

        try {
            mOutputStream.write(data);
            mOutputStream.flush();
            return true;
        } catch (Exception e) {
            Log.e(TAG, "Send failed", e);
            return false;
        }
    }

    /**
     * Send a JSON command to the MCU, wrapped in K900 protocol framing.
     */
    public boolean sendJson(JSONObject json) {
        byte[] frame = K900Protocol.packJsonCommand(json);
        if (frame == null) return false;
        return sendRaw(frame);
    }

    /**
     * Send a simple string command to the MCU.
     */
    public boolean sendCommand(String command) {
        byte[] frame = K900Protocol.packStringCommand(command);
        return sendRaw(frame);
    }

    public boolean isConnected() {
        return mConnected.get();
    }

    public void setFastMode(boolean fast) {
        mFastMode = fast;
    }

    public void addListener(McuEventListener listener) {
        if (!mListeners.contains(listener)) {
            mListeners.add(listener);
        }
    }

    public void removeListener(McuEventListener listener) {
        mListeners.remove(listener);
    }

    // ──────────────────────────────────────────────
    // MCU initialization handshake
    // ──────────────────────────────────────────────

    /**
     * Send the initialization command sequence to the BES2700 MCU.
     *
     * The MCU requires specific commands after the serial port opens before
     * it will start reporting button presses, battery status, etc.
     *
     * Sequence (derived from paired-phone tool asg_client):
     *   1. cs_syvr  — Request MCU system version (triggers handshake)
     *   2. android_control_led — Claim RGB LED control from BES to Android
     *   3. cs_swit  — Enable touch/button event reporting
     */
    private void initializeMcu() {
        Log.i(TAG, "Sending MCU init handshake...");

        try {
            // Step 1: Request BES system version (handshake trigger)
            JSONObject syvr = new JSONObject();
            syvr.put("C", "cs_syvr");
            syvr.put("V", 1);
            syvr.put("B", "");
            sendJson(syvr);
            Log.d(TAG, "Init: sent cs_syvr (system version request)");

            Thread.sleep(100);

            // Step 2: Claim RGB LED control authority
            JSONObject ledCtrl = new JSONObject();
            ledCtrl.put("C", "android_control_led");
            ledCtrl.put("V", 1);
            ledCtrl.put("B", "{\"on\": true}");
            sendJson(ledCtrl);
            Log.d(TAG, "Init: sent android_control_led");

            Thread.sleep(100);

            // Step 3: Enable touch/button event reporting (type 26 = touch events)
            JSONObject swit = new JSONObject();
            swit.put("C", "cs_swit");
            swit.put("V", 1);
            swit.put("B", "{\"type\": 26, \"switch\": true}");
            sendJson(swit);
            Log.d(TAG, "Init: sent cs_swit (button events enabled)");

            Log.i(TAG, "MCU init handshake complete");

        } catch (Exception e) {
            Log.e(TAG, "MCU init handshake failed", e);
        }
    }

    // ──────────────────────────────────────────────
    // Read loop
    // ──────────────────────────────────────────────

    private void readLoop(InputStream inputStream) {
        byte[] buf = new byte[4096];
        Log.i(TAG, "Read thread started");

        while (mRunning.get()) {
            try {
                int available = inputStream.available();
                if (available > 0) {
                    // Data waiting — read immediately, no sleep
                    int bytesRead = inputStream.read(buf);
                    if (bytesRead > 0) {
                        if (mDebugLogCount < 20) {
                            StringBuilder hex = new StringBuilder();
                            for (int i = 0; i < Math.min(bytesRead, 64); i++) {
                                hex.append(String.format("%02X ", buf[i] & 0xFF));
                            }
                            Log.d(TAG, "UART RX " + bytesRead + "B: " + hex.toString().trim());
                            mDebugLogCount++;
                        }

                        mParser.addData(buf, bytesRead);
                        List<byte[]> frames = mParser.parseMessages();

                        for (byte[] frame : frames) {
                            processFrame(frame);
                        }
                    }
                } else {
                    // No data available — brief sleep to avoid busy-wait
                    Thread.sleep(mFastMode ? mSettings.getFastPollMs() : mSettings.getNormalPollMs());
                }
            } catch (InterruptedException e) {
                break;
            } catch (Exception e) {
                Log.e(TAG, "Read error", e);
                if (mRunning.get()) {
                    try { Thread.sleep(100); } catch (InterruptedException ignored) { break; }
                }
            }
        }

        Log.i(TAG, "Read thread stopped");
    }

    private void processFrame(byte[] frame) {
        byte type = K900Protocol.getFrameType(frame);
        byte[] payload = K900Protocol.extractPayload(frame);

        if (payload == null) return;

        if (type == K900Protocol.TYPE_STRING) {
            JSONObject json = K900Protocol.parseJsonPayload(payload);
            if (json != null) {
                dispatchJsonEvent(json);
            }
        }
        // TYPE_PHOTO, TYPE_AUDIO, etc. can be handled here as needed
    }

    private void dispatchJsonEvent(JSONObject json) {
        try {
            // K900 response commands (wrapped in "R" envelope)
            if (json.has("R")) {
                JSONObject response = json.optJSONObject("R");
                if (response != null) {
                    String rCmd = response.optString("C", "");
                    Log.d(TAG, "MCU response: " + rCmd);
                    // sr_syvr = system version response (from our init handshake)
                    if ("sr_syvr".equals(rCmd)) {
                        Log.i(TAG, "MCU firmware: " + response.optString("B", ""));
                    }
                }
                // Still pass to raw handler
            }

            // K900 command commands (wrapped in "C" envelope)
            String cCmd = json.optString("C", "");
            if (!cCmd.isEmpty()) {
                switch (cCmd) {
                    case "cs_pho":
                        // Right temple short press → take photo
                        for (McuEventListener l : mListeners) l.onButtonPress("camera", false);
                        return;
                    case "cs_vdo":
                        // Right temple long press → toggle video
                        for (McuEventListener l : mListeners) l.onButtonPress("camera", true);
                        return;
                    case "sr_swst":
                        // Touch/switch status event
                        Log.d(TAG, "Touch event: " + json.toString());
                        return;
                    case "hm_batv":
                        // Battery voltage from MCU
                        String body = json.optString("B", "");
                        try {
                            JSONObject bat = new JSONObject(body);
                            int pct = bat.optInt("pt", -1);
                            int vt = bat.optInt("vt", -1);
                            if (pct >= 0 || vt >= 0) {
                                for (McuEventListener l : mListeners) l.onBatteryUpdate(pct, vt);
                            }
                        } catch (Exception ignored) {}
                        return;
                    case "sr_keyevt":
                        // Key event report from MCU (power/left button)
                        String keyBody = json.optString("B", "");
                        try {
                            JSONObject keyEvt = new JSONObject(keyBody);
                            int button = keyEvt.optInt("button", -1);
                            int keyType = keyEvt.optInt("type", -1);
                            Log.d(TAG, "Key event: button=" + button + " type=" + keyType);
                            // button=0, type=0 = power/left button short press
                            if (button == 0 && keyType == 0) {
                                for (McuEventListener l : mListeners) l.onPowerButton();
                            }
                        } catch (Exception ignored) {}
                        return;
                }
            }

            // Also check "cmd" field (older format)
            String cmd = json.optString("cmd", "");
            if (!cmd.isEmpty()) {
                switch (cmd) {
                    case "cs_pho":
                        for (McuEventListener l : mListeners) l.onButtonPress("camera", false);
                        return;
                    case "cs_vdo":
                        for (McuEventListener l : mListeners) l.onButtonPress("camera", true);
                        return;
                }
            }

            // Ping/pong keepalive
            String type = json.optString("type", "");
            if ("ping".equals(type)) {
                Log.d(TAG, "MCU ping received, sending pong");
                try {
                    JSONObject pong = new JSONObject();
                    pong.put("type", "pong");
                    sendJson(pong);
                } catch (Exception ignored) {}
                return;
            }

            // Battery status
            if (json.has("pt") || json.has("vt")) {
                int pct = json.optInt("pt", -1);
                int voltage = json.optInt("vt", -1);
                if (pct >= 0 || voltage >= 0) {
                    for (McuEventListener l : mListeners) l.onBatteryUpdate(pct, voltage);
                    return;
                }
            }

            // IMU data
            String msgType = json.optString("type", "");
            if ("imu_data".equals(msgType) || "imu_single".equals(msgType)) {
                JSONObject accel = json.optJSONObject("accel");
                JSONObject gyro = json.optJSONObject("gyro");
                if (accel != null && gyro != null) {
                    for (McuEventListener l : mListeners) {
                        l.onImuData(
                            (float) accel.optDouble("x", 0),
                            (float) accel.optDouble("y", 0),
                            (float) accel.optDouble("z", 0),
                            (float) gyro.optDouble("x", 0),
                            (float) gyro.optDouble("y", 0),
                            (float) gyro.optDouble("z", 0)
                        );
                    }
                    return;
                }
            }

            // Head gesture
            if ("gesture".equals(msgType)) {
                String gesture = json.optString("gesture", "");
                if (!gesture.isEmpty()) {
                    for (McuEventListener l : mListeners) l.onGesture(gesture);
                    return;
                }
            }

            // Unhandled — pass raw
            for (McuEventListener l : mListeners) l.onRawCommand(json);

        } catch (Exception e) {
            Log.e(TAG, "Error dispatching event", e);
        }
    }
}
