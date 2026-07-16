package com.openlab.labos.camera.preview;

import android.util.Log;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileReader;

/**
 * On-device thermal governor for preview + record sessions.
 *
 * Polls sysfs thermal zones and steps down capture FPS at 70 / 75 / 78 °C.
 * Recovers slowly when cooling below hysteresis bands.
 */
public final class ThermalGovernor {

    private static final String TAG = "LabOS.ThermalGov";

    public interface FpsCapListener {
        void onFpsCapChanged(int cappedFps, float cpuTempC, String reason);
    }

    private final FpsCapListener mListener;
    private volatile boolean mEnabled = true;
    private volatile int mBaselineFps = 24;
    private volatile int mHardMinFps = 12;
    private volatile int mCappedFps = 24;
    private volatile float mLastCpuTempC = -1f;
    private volatile long mLastPollAtMs = 0;
    private volatile String mLastAction = "idle";

    public ThermalGovernor(FpsCapListener listener) {
        mListener = listener;
    }

    public void setEnabled(boolean enabled) {
        mEnabled = enabled;
        if (!enabled) {
            mLastAction = "disabled";
        }
    }

    public boolean isEnabled() {
        return mEnabled;
    }

    public void setBaselineFps(int baselineFps, int hardMinFps) {
        mBaselineFps = Math.max(1, Math.min(60, baselineFps));
        mHardMinFps = Math.max(1, Math.min(baselineFps, hardMinFps));
        if (mCappedFps > mBaselineFps) {
            mCappedFps = mBaselineFps;
        }
    }

    public int getCappedFps() {
        return mCappedFps;
    }

    public float getLastCpuTempC() {
        return mLastCpuTempC;
    }

    public String getLastAction() {
        return mLastAction;
    }

    /** Call on camera handler thread every ~2s while streaming or recording. */
    public void pollAndApply() {
        if (!mEnabled) return;
        float cpuC = readMaxThermalZoneTempC();
        mLastCpuTempC = cpuC;
        mLastPollAtMs = System.currentTimeMillis();
        if (cpuC < 0) {
            mLastAction = "no-thermal-sensor";
            return;
        }

        int target = mBaselineFps;
        String reason;
        if (cpuC >= 80f) {
            target = mHardMinFps;
            reason = "emergency-80C";
        } else if (cpuC >= 78f) {
            target = Math.max(mHardMinFps, Math.min(mBaselineFps, 12));
            reason = "step-78C";
        } else if (cpuC >= 75f) {
            target = Math.max(mHardMinFps, Math.min(mBaselineFps, 15));
            reason = "step-75C";
        } else if (cpuC >= 70f) {
            target = Math.max(mHardMinFps, Math.min(mBaselineFps, 20));
            reason = "step-70C";
        } else if (cpuC <= 66f && mCappedFps < mBaselineFps) {
            target = Math.min(mBaselineFps, mCappedFps + 2);
            reason = "recover-66C";
        } else {
            reason = "nominal";
        }

        if (target != mCappedFps) {
            mCappedFps = target;
            mLastAction = reason;
            Log.i(TAG, "FPS cap " + target + " (cpu=" + cpuC + "°C, " + reason + ")");
            if (mListener != null) {
                mListener.onFpsCapChanged(target, cpuC, reason);
            }
        } else {
            mLastAction = reason;
        }
    }

    public JSONObject snapshot() {
        JSONObject json = new JSONObject();
        try {
            json.put("enabled", mEnabled);
            json.put("baselineFps", mBaselineFps);
            json.put("cappedFps", mCappedFps);
            json.put("hardMinFps", mHardMinFps);
            json.put("cpuTempC", mLastCpuTempC >= 0 ? mLastCpuTempC : JSONObject.NULL);
            json.put("lastAction", mLastAction);
            json.put("lastPollAtMs", mLastPollAtMs > 0 ? mLastPollAtMs : JSONObject.NULL);
        } catch (Exception ignored) {
        }
        return json;
    }

    /** Returns max zone temp in °C, or -1 when sysfs unavailable. */
    static float readMaxThermalZoneTempC() {
        File dir = new File("/sys/class/thermal");
        File[] zones = dir.listFiles((d, name) -> name.startsWith("thermal_zone"));
        if (zones == null || zones.length == 0) return -1f;

        float maxC = -1f;
        for (File zone : zones) {
            File tempFile = new File(zone, "temp");
            if (!tempFile.canRead()) continue;
            try (BufferedReader reader = new BufferedReader(new FileReader(tempFile))) {
                String line = reader.readLine();
                if (line == null) continue;
                float raw = Float.parseFloat(line.trim());
                float c = raw > 1000f ? raw / 1000f : raw;
                if (c > maxC) maxC = c;
            } catch (Exception ignored) {
            }
        }
        return maxC;
    }
}
