package com.openlab.labos.core.ipc;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.media.MediaRecorder;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import com.openlab.labos.core.LabOsService;
import com.openlab.labos.core.audio.AudioController;
import com.openlab.labos.core.ble.McuConnection;
import com.openlab.labos.core.ble.McuEventListener;

import org.json.JSONObject;

import java.io.File;
import java.io.FileWriter;
import java.io.PrintWriter;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * BroadcastReceiver that handles dashboard commands for:
 * - MCU Console: send commands to BES2700 MCU and log responses
 * - Camera Preview: continuous frame capture for remote viewfinder
 * - Audio Testing: speaker, mic, and VAD diagnostics
 *
 * Communication pattern: Dashboard → ADB broadcast → this receiver →
 * writes results to /sdcard/LabOS/ files → Dashboard reads via ADB.
 */
public class LabOsCommandHandler extends BroadcastReceiver {

    private static final String TAG = "LabOS.CmdHandler";

    public static final String ACTION_MCU_CONSOLE = "com.openlab.labos.ACTION_MCU_CONSOLE";
    public static final String ACTION_CAMERA_PREVIEW = "com.openlab.labos.ACTION_CAMERA_PREVIEW";
    public static final String ACTION_AUDIO_TEST = "com.openlab.labos.ACTION_AUDIO_TEST";

    private static final String LABOS_DIR = Environment.getExternalStorageDirectory() + "/LabOS";
    private static final String CONSOLE_LOG = LABOS_DIR + "/.mcu_console.log";
    private static final String PREVIEW_PATH = LABOS_DIR + "/.preview.jpg";
    private static final String AUDIO_RESULT = LABOS_DIR + "/.audio_test_result.json";
    private static final String MIC_RECORDING = LABOS_DIR + "/.mic_test.wav";

    private static final Handler sHandler = new Handler(Looper.getMainLooper());
    private static Runnable sPreviewRunnable;
    private static boolean sPreviewActive = false;

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || intent.getAction() == null) return;

        LabOsService service = LabOsService.getInstance();
        if (service == null) {
            Log.w(TAG, "LabOsService not running");
            return;
        }

        switch (intent.getAction()) {
            case ACTION_MCU_CONSOLE:
                handleMcuConsole(service, intent);
                break;
            case ACTION_CAMERA_PREVIEW:
                handleCameraPreview(service, intent);
                break;
            case ACTION_AUDIO_TEST:
                handleAudioTest(service, intent);
                break;
        }
    }

    // ──────────────────────────────────────────────
    // MCU Console (Feature 2)
    // ──────────────────────────────────────────────

    private void handleMcuConsole(LabOsService service, Intent intent) {
        String commandStr = intent.getStringExtra("command");
        if (commandStr == null || commandStr.isEmpty()) {
            Log.w(TAG, "MCU console: no command provided");
            return;
        }

        McuConnection mcu = service.getMcu();
        if (mcu == null || !mcu.isConnected()) {
            appendConsoleLog("ERROR", "MCU not connected");
            return;
        }

        // Log the sent command
        appendConsoleLog("TX", commandStr);

        try {
            JSONObject json = new JSONObject(commandStr);

            // Register temporary listener to capture MCU response
            McuEventListener tempListener = new McuEventListener() {
                @Override public void onMcuConnected() {}
                @Override public void onMcuDisconnected() {}
                @Override public void onButtonPress(String buttonId, boolean isLongPress) {}
                @Override public void onBatteryUpdate(int percentage, int voltage) {
                    appendConsoleLog("RX", "battery: " + percentage + "% " + voltage + "mV");
                }
                @Override public void onImuData(float ax, float ay, float az, float gx, float gy, float gz) {}
                @Override public void onGesture(String gesture) {
                    appendConsoleLog("RX", "gesture: " + gesture);
                }
                @Override public void onPowerButton() {}
                @Override public void onRawCommand(JSONObject raw) {
                    appendConsoleLog("RX", raw.toString());
                }
            };

            mcu.addListener(tempListener);

            // Remove listener after 2 seconds
            sHandler.postDelayed(() -> mcu.removeListener(tempListener), 2000);

            // Send the command
            mcu.sendJson(json);
            Log.d(TAG, "MCU console: sent " + commandStr);

        } catch (Exception e) {
            appendConsoleLog("ERROR", "Invalid JSON: " + e.getMessage());
            Log.e(TAG, "MCU console error", e);
        }
    }

    private void appendConsoleLog(String direction, String message) {
        try {
            File file = new File(CONSOLE_LOG);
            file.getParentFile().mkdirs();
            String timestamp = new SimpleDateFormat("HH:mm:ss.SSS", Locale.US).format(new Date());
            try (PrintWriter pw = new PrintWriter(new FileWriter(file, true))) {
                pw.println("[" + timestamp + "] " + direction + " " + message);
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to write console log", e);
        }
    }

    // ──────────────────────────────────────────────
    // Camera Preview (Feature 3)
    // ──────────────────────────────────────────────

    private void handleCameraPreview(LabOsService service, Intent intent) {
        String action = intent.getStringExtra("action");
        if (action == null) return;

        Context context = service;
        switch (action) {
            case "start":
                // Forward to camera module
                Intent startIntent = new Intent("com.openlab.labos.camera.ACTION_START_PREVIEW");
                startIntent.setPackage("com.openlab.labos.camera");
                context.sendBroadcast(startIntent);
                sPreviewActive = true;
                Log.i(TAG, "MJPEG preview stream start forwarded to camera module");
                break;
            case "stop":
                Intent stopIntent = new Intent("com.openlab.labos.camera.ACTION_STOP_PREVIEW");
                stopIntent.setPackage("com.openlab.labos.camera");
                context.sendBroadcast(stopIntent);
                sPreviewActive = false;
                Log.i(TAG, "MJPEG preview stream stop forwarded to camera module");
                break;
            case "snapshot":
                Intent snapIntent = new Intent("com.openlab.labos.camera.ACTION_SNAPSHOT");
                snapIntent.setPackage("com.openlab.labos.camera");
                context.sendBroadcast(snapIntent);
                break;
        }
    }

    // ──────────────────────────────────────────────
    // Audio Testing (Feature 5)
    // ──────────────────────────────────────────────

    private void handleAudioTest(LabOsService service, Intent intent) {
        String test = intent.getStringExtra("test");
        if (test == null) return;

        AudioController audio = service.getAudio();
        if (audio == null) {
            writeAudioResult(false, "AudioController not available");
            return;
        }

        switch (test) {
            case "play_tone":
                audio.playShutter();
                writeAudioResult(true, "Tone played");
                Log.d(TAG, "Audio test: play_tone");
                break;
            case "test_mic":
                recordMicTest(audio);
                break;
            case "check_vad":
                boolean vadEnabled = service.getSettings().isVadEnabled();
                boolean micEnabled = service.getSettings().isMicEnabled();
                try {
                    JSONObject result = new JSONObject();
                    result.put("success", true);
                    result.put("vadEnabled", vadEnabled);
                    result.put("micEnabled", micEnabled);
                    result.put("message", "VAD: " + (vadEnabled ? "on" : "off") + ", Mic: " + (micEnabled ? "on" : "off"));
                    writeJsonFile(AUDIO_RESULT, result.toString());
                } catch (Exception e) {
                    writeAudioResult(false, e.getMessage());
                }
                break;
        }
    }

    private void recordMicTest(AudioController audio) {
        Log.i(TAG, "Starting mic test recording");

        try {
            File file = new File(MIC_RECORDING);
            file.getParentFile().mkdirs();

            MediaRecorder recorder = new MediaRecorder();
            recorder.setAudioSource(MediaRecorder.AudioSource.MIC);
            recorder.setOutputFormat(MediaRecorder.OutputFormat.THREE_GPP);
            recorder.setAudioEncoder(MediaRecorder.AudioEncoder.AMR_NB);
            recorder.setOutputFile(MIC_RECORDING);
            recorder.prepare();
            recorder.start();

            // Record for 3 seconds
            sHandler.postDelayed(() -> {
                try {
                    recorder.stop();
                    recorder.release();

                    long fileSize = new File(MIC_RECORDING).length();
                    JSONObject result = new JSONObject();
                    result.put("success", true);
                    result.put("duration", 3);
                    result.put("fileSize", fileSize);
                    result.put("filePath", MIC_RECORDING);
                    result.put("message", "Recorded 3s, " + fileSize + " bytes");
                    writeJsonFile(AUDIO_RESULT, result.toString());
                    Log.i(TAG, "Mic test complete: " + fileSize + " bytes");
                } catch (Exception e) {
                    Log.e(TAG, "Mic test stop failed", e);
                    writeAudioResult(false, "Recording stop failed: " + e.getMessage());
                }
            }, 3000);

        } catch (Exception e) {
            Log.e(TAG, "Mic test start failed", e);
            writeAudioResult(false, "Recording start failed: " + e.getMessage());
        }
    }

    private void writeAudioResult(boolean success, String message) {
        try {
            JSONObject result = new JSONObject();
            result.put("success", success);
            result.put("message", message);
            writeJsonFile(AUDIO_RESULT, result.toString());
        } catch (Exception e) {
            Log.e(TAG, "Failed to write audio result", e);
        }
    }

    private void writeJsonFile(String path, String content) {
        try {
            File file = new File(path);
            file.getParentFile().mkdirs();
            try (PrintWriter pw = new PrintWriter(new FileWriter(file))) {
                pw.print(content);
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to write " + path, e);
        }
    }
}
