package com.openlab.labos.dashboard.livecoach;

import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.AudioTrack;
import android.media.AudioManager;
import android.media.MediaRecorder;
import android.media.audiofx.AcousticEchoCanceler;
import android.media.audiofx.AutomaticGainControl;
import android.media.audiofx.NoiseSuppressor;
import android.util.Base64;
import android.util.Log;

import org.json.JSONObject;

import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.WebSocket;
import okhttp3.WebSocketListener;

/**
 * Native glasses audio bridge for Gemini Live.
 *
 * Contract matches dashboard `/api/live-coach/ws`:
 * - send `{type:"start"}` once the socket opens
 * - send `{type:"pcm16", data:"..."}` where data is 16 kHz mono PCM16 base64
 * - receive `{type:"audio", data:"..."}` where data is 24 kHz PCM16 base64
 */
public class LiveCoachMicBridge {
    private static final String TAG = "LabOS.LiveCoachMic";
    private static final int INPUT_SAMPLE_RATE = 16000;
    private static final int OUTPUT_SAMPLE_RATE = 24000;
    private static final int OUTPUT_QUEUE_CAPACITY = 64;

    public interface SpeakerPathController {
        void setOpen(boolean open);
    }

    private final OkHttpClient mClient = new OkHttpClient.Builder()
            .pingInterval(15, TimeUnit.SECONDS)
            .retryOnConnectionFailure(true)
            .build();
    private final SpeakerPathController mSpeakerPath;

    private final Object mLock = new Object();
    private final AtomicBoolean mRunning = new AtomicBoolean(false);

    private WebSocket mWebSocket;
    private AudioRecord mRecorder;
    private AudioTrack mPlayer;
    private Thread mCaptureThread;
    private Thread mPlaybackThread;
    private AcousticEchoCanceler mEchoCanceler;
    private NoiseSuppressor mNoiseSuppressor;
    private AutomaticGainControl mGainControl;
    private final LinkedBlockingQueue<byte[]> mPlaybackQueue = new LinkedBlockingQueue<>(OUTPUT_QUEUE_CAPACITY);

    private volatile String mWsUrl = "";
    private volatile boolean mPlaybackEnabled = true;
    private volatile boolean mConnected = false;
    private volatile String mLastError = "";
    private volatile long mStartedAt = 0L;
    private volatile long mLastAudioAt = 0L;
    private volatile long mChunksSent = 0L;
    private volatile long mBytesSent = 0L;
    private volatile long mAudioBytesPlayed = 0L;
    private volatile long mAudioBytesAccepted = 0L;
    private volatile long mAudioWriteFailures = 0L;
    private volatile long mSpeakerPathRequests = 0L;
    private volatile long mLastSpeakerPathAt = 0L;
    private volatile long mDroppedAudioChunks = 0L;

    public LiveCoachMicBridge(SpeakerPathController speakerPath) {
        mSpeakerPath = speakerPath;
    }

    public boolean start(String wsUrl, boolean playbackEnabled) {
        synchronized (mLock) {
            if (mRunning.get()) return true;
            if (wsUrl == null || wsUrl.trim().isEmpty()) {
                mLastError = "Missing wsUrl";
                return false;
            }

            mWsUrl = wsUrl.trim();
            mPlaybackEnabled = playbackEnabled;
            mLastError = "";
            mConnected = false;
            mStartedAt = System.currentTimeMillis();
            mLastAudioAt = 0L;
            mChunksSent = 0L;
            mBytesSent = 0L;
            mAudioBytesPlayed = 0L;
            mAudioBytesAccepted = 0L;
            mAudioWriteFailures = 0L;
            mSpeakerPathRequests = 0L;
            mLastSpeakerPathAt = 0L;
            mDroppedAudioChunks = 0L;
            mPlaybackQueue.clear();
            try {
                mRunning.set(true);
                startCaptureLocked();
                if (mPlaybackEnabled) startPlaybackLocked();
                connectSocketLocked();
                return true;
            } catch (Exception e) {
                mLastError = e.getMessage();
                Log.w(TAG, "Failed to start native audio bridge", e);
                stop();
                return false;
            }
        }
    }

    public void stop() {
        synchronized (mLock) {
            mRunning.set(false);
            mConnected = false;

            if (mCaptureThread != null) {
                mCaptureThread.interrupt();
                mCaptureThread = null;
            }

            if (mPlaybackThread != null) {
                mPlaybackThread.interrupt();
                mPlaybackThread = null;
            }

            mPlaybackQueue.clear();

            if (mRecorder != null) {
                releaseAudioEffects();
                try { mRecorder.stop(); } catch (Exception ignored) {}
                try { mRecorder.release(); } catch (Exception ignored) {}
                mRecorder = null;
            }

            if (mPlayer != null) {
                try { mPlayer.pause(); } catch (Exception ignored) {}
                try { mPlayer.flush(); } catch (Exception ignored) {}
                try { mPlayer.stop(); } catch (Exception ignored) {}
                try { mPlayer.release(); } catch (Exception ignored) {}
                mPlayer = null;
            }
            setSpeakerPathOpen(false);

            if (mWebSocket != null) {
                try { mWebSocket.send("{\"type\":\"stop\"}"); } catch (Exception ignored) {}
                try { mWebSocket.close(1000, "stopped"); } catch (Exception ignored) {}
                mWebSocket = null;
            }
        }
    }

    public JSONObject status() {
        JSONObject json = new JSONObject();
        try {
            json.put("running", mRunning.get());
            json.put("connected", mConnected);
            json.put("wsUrl", mWsUrl);
            json.put("sampleRate", INPUT_SAMPLE_RATE);
            json.put("outputSampleRate", OUTPUT_SAMPLE_RATE);
            json.put("playbackEnabled", mPlaybackEnabled);
            json.put("startedAt", mStartedAt);
            json.put("lastAudioAt", mLastAudioAt);
            json.put("chunksSent", mChunksSent);
            json.put("bytesSent", mBytesSent);
            json.put("audioBytesPlayed", mAudioBytesPlayed);
            json.put("audioBytesAccepted", mAudioBytesAccepted);
            json.put("audioWriteFailures", mAudioWriteFailures);
            json.put("speakerPathRequests", mSpeakerPathRequests);
            json.put("droppedAudioChunks", mDroppedAudioChunks);
            json.put("queuedAudioChunks", mPlaybackQueue.size());
            json.put("lastError", mLastError);
        } catch (Exception ignored) {}
        return json;
    }

    private void connectSocketLocked() {
        Request request = new Request.Builder().url(mWsUrl).build();
        mWebSocket = mClient.newWebSocket(request, new WebSocketListener() {
            @Override
            public void onOpen(WebSocket webSocket, Response response) {
                mConnected = true;
                webSocket.send("{\"type\":\"start\",\"source\":\"glasses-native\"}");
            }

            @Override
            public void onMessage(WebSocket webSocket, String text) {
                handleServerMessage(text);
            }

            @Override
            public void onClosed(WebSocket webSocket, int code, String reason) {
                mConnected = false;
            }

            @Override
            public void onFailure(WebSocket webSocket, Throwable t, Response response) {
                mConnected = false;
                mLastError = t != null ? t.getMessage() : "WebSocket failure";
                Log.w(TAG, "WebSocket failure", t);
            }
        });
    }

    private void startCaptureLocked() {
        int minBuffer = AudioRecord.getMinBufferSize(
                INPUT_SAMPLE_RATE,
                AudioFormat.CHANNEL_IN_MONO,
                AudioFormat.ENCODING_PCM_16BIT);
        int bufferSize = Math.max(minBuffer, INPUT_SAMPLE_RATE / 5 * 2);
        mRecorder = createRecorder(bufferSize * 2);
        if (mRecorder == null || mRecorder.getState() != AudioRecord.STATE_INITIALIZED) {
            throw new IllegalStateException("AudioRecord failed to initialize; mic may be busy or disabled");
        }
        enableAudioEffects(mRecorder.getAudioSessionId());
        mRecorder.startRecording();

        mCaptureThread = new Thread(() -> {
            byte[] buffer = new byte[bufferSize];
            while (mRunning.get() && !Thread.currentThread().isInterrupted()) {
                AudioRecord recorder = mRecorder;
                if (recorder == null) break;
                int read = recorder.read(buffer, 0, buffer.length);
                if (read <= 0) continue;
                WebSocket ws = mWebSocket;
                if (ws == null || !mConnected) continue;
                String b64 = Base64.encodeToString(buffer, 0, read, Base64.NO_WRAP);
                boolean queued = ws.send("{\"type\":\"pcm16\",\"source\":\"glasses-native\",\"data\":\"" + b64 + "\"}");
                if (queued) {
                    mChunksSent++;
                    mBytesSent += read;
                    mLastAudioAt = System.currentTimeMillis();
                }
            }
        }, "labos-live-coach-mic");
        mCaptureThread.start();
    }

    private AudioRecord createRecorder(int bufferSizeBytes) {
        int[] sources = new int[] {
                MediaRecorder.AudioSource.VOICE_COMMUNICATION,
                MediaRecorder.AudioSource.VOICE_RECOGNITION,
                MediaRecorder.AudioSource.MIC,
                MediaRecorder.AudioSource.CAMCORDER
        };
        for (int source : sources) {
            try {
                AudioRecord recorder = new AudioRecord(
                        source,
                        INPUT_SAMPLE_RATE,
                        AudioFormat.CHANNEL_IN_MONO,
                        AudioFormat.ENCODING_PCM_16BIT,
                        bufferSizeBytes);
                if (recorder.getState() == AudioRecord.STATE_INITIALIZED) {
                    Log.i(TAG, "AudioRecord initialized with source=" + source);
                    return recorder;
                }
                recorder.release();
            } catch (Exception e) {
                Log.w(TAG, "AudioRecord source failed: " + source, e);
            }
        }
        return null;
    }

    private void enableAudioEffects(int sessionId) {
        releaseAudioEffects();
        try {
            if (AcousticEchoCanceler.isAvailable()) {
                mEchoCanceler = AcousticEchoCanceler.create(sessionId);
                if (mEchoCanceler != null) mEchoCanceler.setEnabled(true);
            }
            if (NoiseSuppressor.isAvailable()) {
                mNoiseSuppressor = NoiseSuppressor.create(sessionId);
                if (mNoiseSuppressor != null) mNoiseSuppressor.setEnabled(true);
            }
            if (AutomaticGainControl.isAvailable()) {
                mGainControl = AutomaticGainControl.create(sessionId);
                if (mGainControl != null) mGainControl.setEnabled(true);
            }
        } catch (Exception e) {
            Log.w(TAG, "Audio effects unavailable", e);
        }
    }

    private void releaseAudioEffects() {
        try { if (mEchoCanceler != null) mEchoCanceler.release(); } catch (Exception ignored) {}
        try { if (mNoiseSuppressor != null) mNoiseSuppressor.release(); } catch (Exception ignored) {}
        try { if (mGainControl != null) mGainControl.release(); } catch (Exception ignored) {}
        mEchoCanceler = null;
        mNoiseSuppressor = null;
        mGainControl = null;
    }

    private void startPlaybackLocked() {
        int minBuffer = AudioTrack.getMinBufferSize(
                OUTPUT_SAMPLE_RATE,
                AudioFormat.CHANNEL_OUT_MONO,
                AudioFormat.ENCODING_PCM_16BIT);
        mPlayer = new AudioTrack.Builder()
                .setAudioAttributes(new AudioAttributes.Builder()
                        .setLegacyStreamType(AudioManager.STREAM_NOTIFICATION)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                        .build())
                .setAudioFormat(new AudioFormat.Builder()
                        .setSampleRate(OUTPUT_SAMPLE_RATE)
                        .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                        .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                        .build())
                .setBufferSizeInBytes(Math.max(minBuffer, OUTPUT_SAMPLE_RATE * 2))
                .setTransferMode(AudioTrack.MODE_STREAM)
                .build();
        mPlayer.setVolume(1.0f);
        setSpeakerPathOpen(true);
        mPlayer.play();

        mPlaybackThread = new Thread(() -> {
            while (mRunning.get() && !Thread.currentThread().isInterrupted()) {
                try {
                    byte[] pcm = mPlaybackQueue.poll(250, TimeUnit.MILLISECONDS);
                    if (pcm == null) continue;
                    AudioTrack player = mPlayer;
                    if (player == null) continue;
                    int offset = 0;
                    while (offset < pcm.length && mRunning.get()) {
                        int written = player.write(pcm, offset, pcm.length - offset);
                        if (written > 0) {
                            offset += written;
                            mAudioBytesAccepted += written;
                        } else {
                            mAudioWriteFailures++;
                            mLastError = "AudioTrack write returned " + written;
                            break;
                        }
                    }
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                } catch (Exception e) {
                    mAudioWriteFailures++;
                    mLastError = e.getMessage();
                    Log.w(TAG, "Playback thread failed", e);
                }
            }
        }, "labos-live-coach-playback");
        mPlaybackThread.start();
    }

    private void handleServerMessage(String text) {
        try {
            JSONObject json = new JSONObject(text);
            String type = json.optString("type", "");
            if ("clear-audio".equals(type) || "interrupted".equals(type)) {
                clearPlaybackQueue();
            } else if ("audio".equals(type) && mPlaybackEnabled) {
                playOutputAudio(json.optString("data", ""));
            } else if ("status".equals(type)) {
                JSONObject status = json.optJSONObject("status");
                if (status != null && "error".equals(status.optString("state"))) {
                    mLastError = status.optString("message", "Live Coach error");
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "Bad server message", e);
        }
    }

    private void clearPlaybackQueue() {
        mPlaybackQueue.clear();
        AudioTrack player = mPlayer;
        if (player == null) return;
        try { player.pause(); } catch (Exception ignored) {}
        try { player.flush(); } catch (Exception ignored) {}
        try { player.play(); } catch (Exception ignored) {}
    }

    private void playOutputAudio(String b64) {
        if (b64 == null || b64.isEmpty()) return;
        AudioTrack player = mPlayer;
        if (player == null) return;
        try {
            byte[] pcm = Base64.decode(b64, Base64.DEFAULT);
            mAudioBytesPlayed += pcm.length;
            if (!mPlaybackQueue.offer(pcm)) {
                mPlaybackQueue.poll();
                if (!mPlaybackQueue.offer(pcm)) {
                    mAudioWriteFailures++;
                    mLastError = "Playback queue full";
                }
                mDroppedAudioChunks++;
            }
        } catch (Exception e) {
            mAudioWriteFailures++;
            mLastError = e.getMessage();
            Log.w(TAG, "Failed to play model audio", e);
        }
    }

    private void setSpeakerPathOpen(boolean open) {
        try {
            mSpeakerPath.setOpen(open);
            mSpeakerPathRequests++;
            mLastSpeakerPathAt = open ? System.currentTimeMillis() : 0L;
        } catch (Exception e) {
            mLastError = e.getMessage();
            Log.w(TAG, "Failed to set speaker path open=" + open, e);
        }
    }
}
