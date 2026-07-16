package com.openlab.labos.core.audio;

import android.content.Context;
import android.content.res.AssetFileDescriptor;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.media.SoundPool;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import com.openlab.labos.core.ble.McuConnection;
import com.openlab.labos.core.hardware.SysControl;
import com.openlab.labos.core.settings.LabOsSettings;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.io.IOException;
import java.util.HashMap;
import java.util.Map;

/**
 * Audio controller for the the HMD-class device (K900) smart glasses.
 *
 * Uses SoundPool for short sound effects (shutter, click, recording start/stop)
 * for near-instant playback (~5ms), and MediaPlayer for longer audio files
 * (battery announcements, boot chime).
 *
 * The I2S speaker path is kept open for a brief window after playback to avoid
 * the overhead of toggling it per sound during rapid-fire sequences.
 */
public class AudioController {

    private static final String TAG = "LabOS.AudioController";

    // ── Asset file names ────────────────────────────
    private static final String ASSET_CAMERA_SHUTTER = "camera_sound.wav";
    private static final String ASSET_RECORDING_START = "recording_start.wav";
    private static final String ASSET_RECORDING_STOP = "recording_stop.wav";
    private static final String ASSET_CLICK = "click_sound.wav";

    // ── MCU commands ────────────────────────────────
    private static final String MCU_CMD_MIC = "cs_mic";
    private static final String MCU_CMD_VAD = "cs_vad";
    private static final String MCU_CMD_I2S_START = "mh_starti2s";
    private static final String MCU_CMD_I2S_STOP = "mh_stopi2s";

    private final Context mContext;
    private final McuConnection mMcu;
    private final LabOsSettings mSettings;
    private final Handler mHandler = new Handler(Looper.getMainLooper());

    // SoundPool for short effects (pre-loaded, instant playback)
    private SoundPool mSoundPool;
    private final Map<String, Integer> mSoundIds = new HashMap<>();
    private boolean mSoundsLoaded = false;
    private float mVolume;

    // MediaPlayer for longer audio (battery announcements, boot chime, arbitrary files)
    private MediaPlayer mPlayer;

    private boolean mMicEnabled;
    private boolean mVadEnabled;
    private boolean mI2sOpen = false;
    private final Runnable mCloseI2sRunnable = this::closeI2sIfIdle;

    /**
     * Track whether this controller is actively managing the I2S path
     * so any broadcast receiver can avoid reacting to our own playback.
     */
    private static volatile boolean sControllingI2S = false;

    public AudioController(Context context, McuConnection mcu, LabOsSettings settings) {
        mContext = context.getApplicationContext();
        mMcu = mcu;
        mSettings = settings;
        mVolume = settings.getAudioVolume();

        // Register this package as the I2S audio receiver so the SystemUI
        // sends AUDIO_PLAYSTATE_CHANGE broadcasts to us.
        SysControl.setI2SAudioReceiverPackage(mContext, mContext.getPackageName());

        // Build SoundPool for short sound effects
        AudioAttributes attrs = new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build();
        mSoundPool = new SoundPool.Builder()
            .setMaxStreams(3)
            .setAudioAttributes(attrs)
            .build();

        mSoundPool.setOnLoadCompleteListener((pool, sampleId, status) -> {
            if (status == 0) {
                // Check if all expected sounds are loaded
                if (mSoundIds.size() >= 4) {
                    mSoundsLoaded = true;
                    Log.i(TAG, "All SoundPool effects loaded");
                }
            }
        });

        // Pre-load short sound effects
        loadEffect(ASSET_CAMERA_SHUTTER);
        loadEffect(ASSET_RECORDING_START);
        loadEffect(ASSET_RECORDING_STOP);
        loadEffect(ASSET_CLICK);

        Log.i(TAG, "AudioController initialized with SoundPool + I2S receiver");
    }

    private void loadEffect(String assetName) {
        try {
            AssetFileDescriptor afd = mContext.getAssets().openFd(assetName);
            int id = mSoundPool.load(afd, 1);
            mSoundIds.put(assetName, id);
            afd.close();
        } catch (IOException e) {
            Log.e(TAG, "Failed to load sound effect: " + assetName, e);
        }
    }

    // ──────────────────────────────────────────────
    // Convenience sound effects (SoundPool — near-instant)
    // ──────────────────────────────────────────────

    /** Play the camera shutter sound effect. */
    public void playShutter() {
        playEffect(ASSET_CAMERA_SHUTTER);
    }

    /** Play the video-recording-started sound effect. */
    public void playVideoStart() {
        playEffect(ASSET_RECORDING_START);
    }

    /** Play the video-recording-stopped sound effect. */
    public void playVideoStop() {
        playEffect(ASSET_RECORDING_STOP);
    }

    /** Play a generic error / click sound. */
    public void playError() {
        playEffect(ASSET_CLICK);
    }

    /**
     * Play a pre-loaded sound effect via SoundPool.
     * Opens I2S path if needed, plays immediately, keeps I2S open briefly.
     */
    private void playEffect(String assetName) {
        Integer soundId = mSoundIds.get(assetName);
        if (soundId == null || !mSoundsLoaded) {
            // Fallback to MediaPlayer if SoundPool not ready
            Log.w(TAG, "SoundPool not ready, falling back to MediaPlayer for " + assetName);
            playAsset(assetName);
            return;
        }

        sControllingI2S = true;
        ensureI2sOpen();
        mSoundPool.play(soundId, mVolume, mVolume, 1, 0, 1.0f);
        Log.d(TAG, "SoundPool effect played: " + assetName);

        // Schedule I2S close after keep-open window
        scheduleI2sClose();
    }

    // ──────────────────────────────────────────────
    // Asset playback via MediaPlayer (for longer audio)
    // ──────────────────────────────────────────────

    /**
     * Play an audio file from the app's assets/ folder via MediaPlayer.
     * Used for longer sounds like battery announcements and boot chime.
     */
    public synchronized void playAsset(String assetName) {
        Log.i(TAG, "Playing asset (MediaPlayer): " + assetName);

        sControllingI2S = true;
        stopCurrentPlayer();
        ensureI2sOpen();

        try {
            AssetFileDescriptor afd = mContext.getAssets().openFd(assetName);

            mPlayer = new MediaPlayer();
            mPlayer.setAudioStreamType(AudioManager.STREAM_NOTIFICATION);
            mPlayer.setVolume(mVolume, mVolume);
            mPlayer.setDataSource(afd.getFileDescriptor(), afd.getStartOffset(), afd.getLength());
            afd.close();

            mPlayer.setOnCompletionListener(mp -> {
                Log.d(TAG, "Playback completed: " + assetName);
                mp.release();
                mPlayer = null;
                scheduleI2sClose();
            });

            mPlayer.setOnErrorListener((mp, what, extra) -> {
                Log.e(TAG, "MediaPlayer error what=" + what + " extra=" + extra);
                mp.release();
                mPlayer = null;
                scheduleI2sClose();
                return true;
            });

            mPlayer.setOnPreparedListener(mp -> {
                mp.start();
                Log.d(TAG, "Playback started: " + assetName);
            });
            mPlayer.prepareAsync();

        } catch (IOException e) {
            Log.e(TAG, "IOException playing asset " + assetName, e);
            scheduleI2sClose();
        } catch (Exception e) {
            Log.e(TAG, "Error playing asset " + assetName, e);
            scheduleI2sClose();
        }
    }

    /**
     * Play an audio file from an arbitrary file path.
     */
    public synchronized void playFile(String filePath) {
        Log.i(TAG, "Playing file: " + filePath);

        if (!new File(filePath).exists()) {
            Log.e(TAG, "File not found: " + filePath);
            return;
        }

        sControllingI2S = true;
        stopCurrentPlayer();
        ensureI2sOpen();

        try {
            mPlayer = new MediaPlayer();
            mPlayer.setAudioStreamType(AudioManager.STREAM_NOTIFICATION);
            mPlayer.setVolume(mVolume, mVolume);
            mPlayer.setDataSource(filePath);

            mPlayer.setOnCompletionListener(mp -> {
                Log.d(TAG, "Playback completed: " + filePath);
                mp.release();
                mPlayer = null;
                scheduleI2sClose();
            });

            mPlayer.setOnErrorListener((mp, what, extra) -> {
                Log.e(TAG, "MediaPlayer error what=" + what + " extra=" + extra);
                mp.release();
                mPlayer = null;
                scheduleI2sClose();
                return true;
            });

            mPlayer.setOnPreparedListener(mp -> {
                mp.start();
                Log.d(TAG, "Playback started: " + filePath);
            });
            mPlayer.prepareAsync();

        } catch (IOException e) {
            Log.e(TAG, "IOException playing file " + filePath, e);
            scheduleI2sClose();
        } catch (Exception e) {
            Log.e(TAG, "Error playing file " + filePath, e);
            scheduleI2sClose();
        }
    }

    /** Stop any current MediaPlayer playback. */
    public synchronized void stopPlayback() {
        sControllingI2S = true;
        stopCurrentPlayer();
        sControllingI2S = false;
    }

    // ──────────────────────────────────────────────
    // I2S path management (keep-open strategy)
    // ──────────────────────────────────────────────

    private void ensureI2sOpen() {
        mHandler.removeCallbacks(mCloseI2sRunnable);
        if (!mI2sOpen) {
            notifyI2SState(true);
            mI2sOpen = true;
        }
    }

    private void scheduleI2sClose() {
        mHandler.removeCallbacks(mCloseI2sRunnable);
        mHandler.postDelayed(mCloseI2sRunnable, mSettings.getI2sKeepOpenMs());
    }

    private void closeI2sIfIdle() {
        if (mPlayer != null) return; // Still playing something
        if (mI2sOpen) {
            notifyI2SState(false);
            mI2sOpen = false;
            sControllingI2S = false;
        }
    }

    // ──────────────────────────────────────────────
    // Microphone control
    // ──────────────────────────────────────────────

    public void setMicEnabled(boolean enabled) {
        Log.i(TAG, "setMicEnabled: " + enabled);
        mMicEnabled = enabled;

        try {
            JSONObject body = new JSONObject();
            body.put("enable", enabled ? 1 : 0);

            JSONObject cmd = new JSONObject();
            cmd.put("C", MCU_CMD_MIC);
            cmd.put("V", 1);
            cmd.put("B", body.toString());

            if (mMcu.sendJson(cmd)) {
                Log.d(TAG, "Mic command sent: enabled=" + enabled);
            } else {
                Log.w(TAG, "Failed to send mic command");
            }
        } catch (JSONException e) {
            Log.e(TAG, "Error building mic command", e);
        }
    }

    public boolean isMicEnabled() {
        return mMicEnabled;
    }

    // ──────────────────────────────────────────────
    // Voice Activity Detection
    // ──────────────────────────────────────────────

    public void setVadEnabled(boolean enabled) {
        Log.i(TAG, "setVadEnabled: " + enabled);
        mVadEnabled = enabled;

        try {
            JSONObject body = new JSONObject();
            body.put("enable", enabled ? 1 : 0);

            JSONObject cmd = new JSONObject();
            cmd.put("C", MCU_CMD_VAD);
            cmd.put("V", 1);
            cmd.put("B", body.toString());

            if (mMcu.sendJson(cmd)) {
                Log.d(TAG, "VAD command sent: enabled=" + enabled);
            } else {
                Log.w(TAG, "Failed to send VAD command");
            }
        } catch (JSONException e) {
            Log.e(TAG, "Error building VAD command", e);
        }
    }

    public boolean isVadEnabled() {
        return mVadEnabled;
    }

    // ──────────────────────────────────────────────
    // Static helper for broadcast receiver
    // ──────────────────────────────────────────────

    public static boolean isControllingI2S() {
        return sControllingI2S;
    }

    // ──────────────────────────────────────────────
    // Release
    // ──────────────────────────────────────────────

    public synchronized void release() {
        Log.i(TAG, "Releasing AudioController");
        mHandler.removeCallbacks(mCloseI2sRunnable);
        stopCurrentPlayer();
        if (mSoundPool != null) {
            mSoundPool.release();
            mSoundPool = null;
        }
        if (mI2sOpen) {
            notifyI2SState(false);
            mI2sOpen = false;
        }
        sControllingI2S = false;
    }

    // ──────────────────────────────────────────────
    // Internal helpers
    // ──────────────────────────────────────────────

    private void stopCurrentPlayer() {
        if (mPlayer != null) {
            try {
                if (mPlayer.isPlaying()) {
                    mPlayer.stop();
                }
            } catch (IllegalStateException ignored) {}
            mPlayer.release();
            mPlayer = null;
        }
    }

    private boolean notifyI2SState(boolean playing) {
        if (mMcu == null || !mMcu.isConnected()) {
            Log.w(TAG, "MCU not connected, cannot set I2S state");
            return false;
        }

        try {
            JSONObject cmd = new JSONObject();
            cmd.put("C", playing ? MCU_CMD_I2S_START : MCU_CMD_I2S_STOP);
            cmd.put("V", 1);
            cmd.put("B", "{}");

            boolean sent = mMcu.sendJson(cmd);
            Log.d(TAG, "I2S " + (playing ? "start" : "stop") + " sent=" + sent);
            return sent;
        } catch (JSONException e) {
            Log.e(TAG, "Error building I2S command", e);
            return false;
        }
    }
}
