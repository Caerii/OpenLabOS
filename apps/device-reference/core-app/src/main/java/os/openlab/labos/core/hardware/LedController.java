package com.openlab.labos.core.hardware;

import android.os.Handler;
import android.os.HandlerThread;
import android.util.Log;

import com.openlab.labos.core.ble.McuConnection;
import com.openlab.labos.core.settings.LabOsSettings;
import com.dev.api.DevApi;

import org.json.JSONException;
import org.json.JSONObject;

/**
 * Unified LED controller for the the HMD-class device (K900) smart glasses.
 *
 * Controls two independent LED subsystems:
 * <ul>
 *   <li><b>Local MTK recording LED</b> - The small indicator LED on the
 *       glasses frame, driven by the MediaTek SoC through {@code DevApi}
 *       (libxydev.so). Supports on/off, blink, and brightness.</li>
 *   <li><b>Remote RGB LEDs</b> - Colour LEDs on the BES2700 MCU side,
 *       controlled by sending K900-protocol JSON commands over UART via
 *       {@link McuConnection}. Supports indexed colours, timed patterns,
 *       and brightness levels.</li>
 * </ul>
 *
 * RGB LED colour indices (K900 protocol):
 * <pre>
 *   0 = Red, 1 = Green, 2 = Blue, 3 = Orange, 4 = White
 * </pre>
 */
public class LedController {

    private static final String TAG = "LabOS.LedController";

    // ── K900 protocol commands ──────────────────────
    private static final String K900_CMD_LED_ON = "cs_ledon";
    private static final String K900_CMD_LED_OFF = "cs_ledoff";
    private static final String K900_CMD_LED_SET_LEVEL = "cs_ledsetlevel";

    // ── RGB LED colour indices ──────────────────────
    public static final int LED_RED = 0;
    public static final int LED_GREEN = 1;
    public static final int LED_BLUE = 2;
    public static final int LED_ORANGE = 3;
    public static final int LED_WHITE = 4;

    // ── Local LED state ─────────────────────────────
    private final Handler mLedHandler;
    private final HandlerThread mLedThread;
    private boolean mLedInitialized;
    private boolean mLedOn;
    private boolean mBlinking;
    private int mCurrentBrightness;

    // ── MCU reference for RGB commands ──────────────
    private final McuConnection mMcu;
    private final LabOsSettings mSettings;

    /**
     * Create a new LedController.
     *
     * @param mcu the active MCU connection (used for RGB LED commands)
     * @param settings the LabOS settings manager
     */
    public LedController(McuConnection mcu, LabOsSettings settings) {
        mMcu = mcu;
        mSettings = settings;
        mCurrentBrightness = settings.getLedBrightness();

        mLedThread = new HandlerThread("LabOS-LED");
        mLedThread.start();
        mLedHandler = new Handler(mLedThread.getLooper());

        // Ensure a known starting state (off)
        initLocalLed();
        Log.i(TAG, "LedController initialized");
    }

    // ================================================================
    //  Local MTK recording LED
    // ================================================================

    /**
     * Turn the local recording LED on or off.
     *
     * @param on true to turn on, false to turn off
     */
    public void setRecordingLed(boolean on) {
        mLedHandler.post(() -> {
            stopBlinkInternal();
            setLedStateInternal(on);
            Log.d(TAG, "Recording LED " + (on ? "ON" : "OFF"));
        });
    }

    /**
     * Blink the local recording LED with custom on/off intervals.
     *
     * @param onMs  on-duration in milliseconds
     * @param offMs off-duration in milliseconds
     */
    public void blinkRecordingLed(int onMs, int offMs) {
        mLedHandler.post(() -> {
            stopBlinkInternal();
            mBlinking = true;
            Log.d(TAG, "Recording LED blink on=" + onMs + "ms off=" + offMs + "ms");

            Runnable blinkRunnable = new Runnable() {
                @Override
                public void run() {
                    if (!mBlinking) return;
                    mLedOn = !mLedOn;
                    setLedStateInternal(mLedOn);
                    mLedHandler.postDelayed(this, mLedOn ? onMs : offMs);
                }
            };
            mLedHandler.post(blinkRunnable);
        });
    }

    /**
     * Set the recording LED brightness.
     *
     * @param percent brightness 0-100 (0 = off, 100 = full)
     */
    public void setRecordingLedBrightness(int percent) {
        int clamped = Math.max(0, Math.min(100, percent));
        mLedHandler.post(() -> {
            try {
                stopBlinkInternal();
                DevApi.setLedCustomBright(clamped, 0);
                mCurrentBrightness = clamped;
                mLedOn = clamped > 0;
                Log.d(TAG, "Recording LED brightness set to " + clamped + "%");
            } catch (UnsatisfiedLinkError e) {
                Log.e(TAG, "DevApi not available (libxydev.so)", e);
                mLedInitialized = false;
            } catch (Exception e) {
                Log.e(TAG, "Failed to set LED brightness", e);
            }
        });
    }

    // ================================================================
    //  Remote RGB LEDs (via MCU)
    // ================================================================

    /**
     * Turn on an RGB LED by colour index with a timed pattern.
     *
     * @param ledIndex  colour index (0-4, see {@link #LED_RED} etc.)
     * @param onTimeMs  on-duration per cycle in milliseconds
     * @param offTimeMs off-duration per cycle in milliseconds
     * @param count     number of on/off cycles (0 = infinite)
     * @param brightness brightness 0-255
     * @return true if the command was sent
     */
    public boolean setRgbLed(int ledIndex, int onTimeMs, int offTimeMs,
                             int count, int brightness) {
        if (ledIndex < LED_RED || ledIndex > LED_WHITE) {
            Log.e(TAG, "Invalid LED index: " + ledIndex);
            return false;
        }
        if (brightness < 0 || brightness > 255) {
            Log.e(TAG, "Invalid brightness: " + brightness);
            return false;
        }

        // Set brightness first if not maximum
        if (brightness < 255) {
            setRgbBrightness(brightness);
        }

        try {
            JSONObject ledParams = new JSONObject();
            ledParams.put("led", ledIndex);
            ledParams.put("ontime", onTimeMs);
            ledParams.put("offtime", offTimeMs);
            ledParams.put("count", count);

            JSONObject cmd = new JSONObject();
            cmd.put("C", K900_CMD_LED_ON);
            cmd.put("V", 1);
            cmd.put("B", ledParams.toString());

            boolean sent = sendMcuCommand(cmd);
            Log.d(TAG, "RGB LED ON index=" + ledIndex + " sent=" + sent);
            return sent;
        } catch (JSONException e) {
            Log.e(TAG, "Error building RGB LED ON command", e);
            return false;
        }
    }

    /**
     * Turn on an RGB LED with the default brightness.
     *
     * @param ledIndex  colour index (0-4)
     * @param onTimeMs  on-duration per cycle in milliseconds
     * @param offTimeMs off-duration per cycle in milliseconds
     * @param count     number of cycles (0 = infinite)
     * @return true if the command was sent
     */
    public boolean setRgbLed(int ledIndex, int onTimeMs, int offTimeMs, int count) {
        return setRgbLed(ledIndex, onTimeMs, offTimeMs, count, mSettings.getLedBrightness());
    }

    /**
     * Convenience: set the RGB LED to a solid colour index at default brightness.
     * Stays on indefinitely until {@link #rgbOff()} is called.
     *
     * @param r red intensity (0-255, mapped to LED index)
     * @param g green intensity (0-255)
     * @param b blue intensity (0-255)
     */
    public void setRgbLed(int r, int g, int b) {
        // Map dominant colour to the closest LED index
        int ledIndex = dominantColorIndex(r, g, b);
        int brightness = Math.max(r, Math.max(g, b));
        if (brightness == 0) {
            rgbOff();
            return;
        }
        setRgbLed(ledIndex, 60_000, 0, 1, brightness);
    }

    /**
     * Flash the white RGB LED briefly to indicate a photo was taken.
     */
    public void flashRgbForPhoto() {
        Log.d(TAG, "RGB flash for photo");
        setRgbLed(LED_WHITE, mSettings.getPhotoFlashMs(), 0, 1, mSettings.getLedBrightness());
    }

    /**
     * Turn on the white RGB LED solid to indicate active video recording.
     */
    public void solidRgbForVideo() {
        Log.d(TAG, "RGB solid white for video");
        setRgbLed(LED_WHITE, 60_000, 0, 1, mSettings.getLedBrightness());
    }

    /**
     * Turn off all RGB LEDs.
     */
    public void rgbOff() {
        Log.d(TAG, "RGB LEDs off");
        try {
            JSONObject ledParams = new JSONObject();
            ledParams.put("led", 0); // always 0 per K900 protocol

            JSONObject cmd = new JSONObject();
            cmd.put("C", K900_CMD_LED_OFF);
            cmd.put("V", 1);
            cmd.put("B", ledParams.toString());

            sendMcuCommand(cmd);
        } catch (JSONException e) {
            Log.e(TAG, "Error building RGB LED OFF command", e);
        }
    }

    /**
     * Set the global brightness for RGB LEDs.
     *
     * @param brightness 0-255
     */
    public void setRgbBrightness(int brightness) {
        int clamped = Math.max(0, Math.min(255, brightness));
        try {
            JSONObject params = new JSONObject();
            params.put("current", 0);
            params.put("brightness", clamped);

            JSONObject cmd = new JSONObject();
            cmd.put("C", K900_CMD_LED_SET_LEVEL);
            cmd.put("V", 1);
            cmd.put("B", params.toString());

            sendMcuCommand(cmd);
            Log.d(TAG, "RGB brightness set to " + clamped);
        } catch (JSONException e) {
            Log.e(TAG, "Error building RGB brightness command", e);
        }
    }

    // ================================================================
    //  Lifecycle
    // ================================================================

    /**
     * Release all resources. Turns off both LED subsystems and stops the
     * background handler thread.
     */
    public void release() {
        Log.i(TAG, "Releasing LedController");
        mLedHandler.post(() -> {
            stopBlinkInternal();
            setLedStateInternal(false);
        });
        rgbOff();
        mLedThread.quitSafely();
    }

    // ================================================================
    //  Internal helpers
    // ================================================================

    private void initLocalLed() {
        mLedHandler.post(() -> {
            try {
                DevApi.setLedOn(false);
                mLedInitialized = true;
                mLedOn = false;
                Log.d(TAG, "Local LED initialized");
            } catch (UnsatisfiedLinkError e) {
                Log.e(TAG, "DevApi not available (libxydev.so)", e);
                mLedInitialized = false;
            } catch (Exception e) {
                Log.e(TAG, "Failed to initialize local LED", e);
                mLedInitialized = false;
            }
        });
    }

    private void setLedStateInternal(boolean on) {
        try {
            DevApi.setLedOn(on);
            mLedOn = on;
        } catch (UnsatisfiedLinkError e) {
            Log.e(TAG, "DevApi not available (libxydev.so)", e);
            mLedInitialized = false;
        } catch (Exception e) {
            Log.e(TAG, "Failed to set LED state: " + on, e);
        }
    }

    private void stopBlinkInternal() {
        mBlinking = false;
        mLedHandler.removeCallbacksAndMessages(null);
        setLedStateInternal(false);
    }

    private boolean sendMcuCommand(JSONObject command) {
        if (mMcu == null || !mMcu.isConnected()) {
            Log.w(TAG, "MCU not connected, cannot send LED command");
            return false;
        }
        return mMcu.sendJson(command);
    }

    /**
     * Map an RGB triplet to the closest K900 LED colour index.
     */
    private static int dominantColorIndex(int r, int g, int b) {
        // Simple heuristic: pick the channel with the highest value
        if (r >= g && r >= b) {
            // Red-dominant; if green is close, treat as orange
            if (g > r / 2) return LED_ORANGE;
            return LED_RED;
        }
        if (g >= r && g >= b) {
            return LED_GREEN;
        }
        if (b >= r && b >= g) {
            return LED_BLUE;
        }
        // Fallback: white if all roughly equal
        return LED_WHITE;
    }
}
