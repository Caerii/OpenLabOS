package com.openlab.labos.core.streaming;

import android.content.Context;
import android.hardware.camera2.CameraAccessException;
import android.hardware.camera2.CameraCaptureSession;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraDevice;
import android.hardware.camera2.CameraManager;
import android.hardware.camera2.CaptureRequest;
import android.media.MediaCodec;
import android.media.MediaCodecInfo;
import android.media.MediaFormat;
import android.media.MediaMuxer;
import android.os.Handler;
import android.os.HandlerThread;
import android.util.Log;
import android.view.Surface;

import java.io.File;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.text.SimpleDateFormat;
import java.util.Arrays;
import java.util.Date;
import java.util.Locale;

/**
 * Manages RTMP-style video streaming from the glasses camera.
 *
 * Uses Camera2 API + MediaCodec to produce H.264 encoded video. For production
 * RTMP delivery a library such as StreamPack or librtmp is needed; this
 * implementation records the encoded stream to a local file that can be served
 * over HTTP or pushed to an RTMP server with a thin transport layer.
 *
 * Headless operation: no preview Surface is required since the K900 glasses
 * have no user-facing display.
 */
public class StreamManager {

    private static final String TAG = "LabOS.Stream";

    // Default stream parameters
    private static final int DEFAULT_WIDTH = 1280;
    private static final int DEFAULT_HEIGHT = 720;
    private static final int DEFAULT_BITRATE = 2_000_000;
    private static final int DEFAULT_FPS = 30;
    private static final int I_FRAME_INTERVAL = 2; // seconds
    private static final String MIME_TYPE = MediaFormat.MIMETYPE_VIDEO_AVC;

    // Stream states
    public enum StreamStatus {
        IDLE,
        STARTING,
        STREAMING,
        STOPPING,
        ERROR
    }

    /**
     * Listener interface for stream status callbacks.
     */
    public interface StreamListener {
        /** Stream has started sending frames. */
        void onStreamStarted(String url);

        /** Stream has stopped normally. */
        void onStreamStopped();

        /** An error occurred; streaming was aborted. */
        void onStreamError(String message);

        /** Status changed (e.g. STARTING, STREAMING). */
        void onStatusChanged(StreamStatus status);
    }

    private final Context mContext;
    private final CameraManager mCameraManager;

    // Threading
    private HandlerThread mEncoderThread;
    private Handler mEncoderHandler;

    // Camera2
    private CameraDevice mCamera;
    private CameraCaptureSession mSession;

    // Encoding
    private MediaCodec mEncoder;
    private Surface mInputSurface;
    private MediaMuxer mMuxer;
    private int mTrackIndex = -1;
    private boolean mMuxerStarted = false;

    // State
    private volatile StreamStatus mStatus = StreamStatus.IDLE;
    private final Object mLock = new Object();
    private StreamListener mListener;
    private String mCurrentUrl;
    private String mOutputPath;

    // Current stream configuration
    private int mWidth = DEFAULT_WIDTH;
    private int mHeight = DEFAULT_HEIGHT;
    private int mBitrate = DEFAULT_BITRATE;
    private int mFps = DEFAULT_FPS;

    public StreamManager(Context context) {
        mContext = context;
        mCameraManager = (CameraManager) context.getSystemService(Context.CAMERA_SERVICE);
    }

    /**
     * Set the listener that receives stream status callbacks.
     *
     * @param listener Callback receiver, or null to clear.
     */
    public void setListener(StreamListener listener) {
        mListener = listener;
    }

    /**
     * Check whether the stream is currently active.
     *
     * @return true if in STARTING or STREAMING state.
     */
    public boolean isStreaming() {
        StreamStatus s = mStatus;
        return s == StreamStatus.STARTING || s == StreamStatus.STREAMING;
    }

    /**
     * Get the current stream status.
     *
     * @return Current StreamStatus value.
     */
    public StreamStatus getStatus() {
        return mStatus;
    }

    /**
     * Start streaming to the given RTMP URL.
     *
     * In this implementation the encoded H.264 stream is written to a local
     * file under /sdcard/LabOS/media/streams/ using MediaMuxer. A production
     * build should replace MediaMuxer with an RTMP transport (e.g. StreamPack
     * or a raw FLV-over-TCP sender).
     *
     * @param rtmpUrl  Target RTMP URL (stored for metadata; actual transport
     *                 writes to local file in this version).
     * @param width    Video width in pixels.
     * @param height   Video height in pixels.
     * @param bitrate  Target bitrate in bits per second.
     */
    public void startStream(String rtmpUrl, int width, int height, int bitrate) {
        synchronized (mLock) {
            if (mStatus == StreamStatus.STARTING || mStatus == StreamStatus.STREAMING) {
                Log.w(TAG, "Stream already active, ignoring start request");
                return;
            }
            setStatus(StreamStatus.STARTING);
        }

        mCurrentUrl = rtmpUrl;
        mWidth = width > 0 ? width : DEFAULT_WIDTH;
        mHeight = height > 0 ? height : DEFAULT_HEIGHT;
        mBitrate = bitrate > 0 ? bitrate : DEFAULT_BITRATE;

        Log.i(TAG, "Starting stream: " + mWidth + "x" + mHeight + " @ " + mBitrate + "bps -> " + rtmpUrl);

        ensureThread();
        mEncoderHandler.post(this::initEncoderAndCamera);
    }

    /**
     * Stop the current stream and release all resources.
     */
    public void stopStream() {
        synchronized (mLock) {
            if (mStatus == StreamStatus.IDLE || mStatus == StreamStatus.STOPPING) {
                return;
            }
            setStatus(StreamStatus.STOPPING);
        }

        Log.i(TAG, "Stopping stream");

        // Run cleanup on encoder thread if available, otherwise inline
        if (mEncoderHandler != null) {
            mEncoderHandler.post(this::releaseAll);
        } else {
            releaseAll();
        }
    }

    /**
     * Release all resources. Safe to call even if not streaming.
     */
    public void release() {
        stopStream();
        if (mEncoderThread != null) {
            mEncoderThread.quitSafely();
            try {
                mEncoderThread.join(2000);
            } catch (InterruptedException ignored) {}
            mEncoderThread = null;
            mEncoderHandler = null;
        }
    }

    // ──────────────────────────────────────────────
    // Internal — encoder + camera setup
    // ──────────────────────────────────────────────

    private void ensureThread() {
        if (mEncoderThread == null || !mEncoderThread.isAlive()) {
            mEncoderThread = new HandlerThread("LabOS-StreamEncoder");
            mEncoderThread.start();
            mEncoderHandler = new Handler(mEncoderThread.getLooper());
        }
    }

    /**
     * Configure MediaCodec encoder, create the input Surface, set up
     * MediaMuxer, and open the camera to feed frames into the encoder.
     * Runs on the encoder HandlerThread.
     */
    private void initEncoderAndCamera() {
        try {
            // Prepare output file
            mOutputPath = createOutputPath();

            // Configure H.264 encoder
            MediaFormat format = MediaFormat.createVideoFormat(MIME_TYPE, mWidth, mHeight);
            format.setInteger(MediaFormat.KEY_COLOR_FORMAT,
                    MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface);
            format.setInteger(MediaFormat.KEY_BIT_RATE, mBitrate);
            format.setInteger(MediaFormat.KEY_FRAME_RATE, mFps);
            format.setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, I_FRAME_INTERVAL);

            mEncoder = MediaCodec.createEncoderByType(MIME_TYPE);
            mEncoder.setCallback(new EncoderCallback(), mEncoderHandler);
            mEncoder.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE);
            mInputSurface = mEncoder.createInputSurface();

            // Set up MediaMuxer (MP4 container for local recording)
            mMuxer = new MediaMuxer(mOutputPath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4);
            mTrackIndex = -1;
            mMuxerStarted = false;

            mEncoder.start();
            Log.d(TAG, "Encoder started, opening camera");

            openCamera();

        } catch (Exception e) {
            Log.e(TAG, "Failed to initialize stream", e);
            handleError("Init failed: " + e.getMessage());
        }
    }

    @SuppressWarnings("MissingPermission")
    private void openCamera() {
        try {
            String cameraId = getBackCameraId();
            if (cameraId == null) {
                handleError("No camera found");
                return;
            }

            mCameraManager.openCamera(cameraId, new CameraDevice.StateCallback() {
                @Override
                public void onOpened(CameraDevice camera) {
                    mCamera = camera;
                    createCaptureSession();
                }

                @Override
                public void onDisconnected(CameraDevice camera) {
                    Log.w(TAG, "Camera disconnected");
                    handleError("Camera disconnected");
                }

                @Override
                public void onError(CameraDevice camera, int error) {
                    Log.e(TAG, "Camera error: " + error);
                    handleError("Camera error: " + error);
                }
            }, mEncoderHandler);

        } catch (CameraAccessException e) {
            Log.e(TAG, "Camera access failed", e);
            handleError("Camera access failed: " + e.getMessage());
        }
    }

    private void createCaptureSession() {
        try {
            mCamera.createCaptureSession(
                    Arrays.asList(mInputSurface),
                    new CameraCaptureSession.StateCallback() {
                        @Override
                        public void onConfigured(CameraCaptureSession session) {
                            mSession = session;
                            startRepeatingCapture();
                        }

                        @Override
                        public void onConfigureFailed(CameraCaptureSession session) {
                            handleError("Capture session configuration failed");
                        }
                    },
                    mEncoderHandler);
        } catch (CameraAccessException e) {
            handleError("Session creation failed: " + e.getMessage());
        }
    }

    private void startRepeatingCapture() {
        try {
            CaptureRequest.Builder builder =
                    mCamera.createCaptureRequest(CameraDevice.TEMPLATE_RECORD);
            builder.addTarget(mInputSurface);
            builder.set(CaptureRequest.CONTROL_AF_MODE,
                    CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_VIDEO);

            mSession.setRepeatingRequest(builder.build(), null, mEncoderHandler);

            synchronized (mLock) {
                setStatus(StreamStatus.STREAMING);
            }
            Log.i(TAG, "Stream active, recording to: " + mOutputPath);

            if (mListener != null) {
                mListener.onStreamStarted(mCurrentUrl);
            }

        } catch (CameraAccessException e) {
            handleError("Repeating request failed: " + e.getMessage());
        }
    }

    // ──────────────────────────────────────────────
    // MediaCodec callback — forwards encoded data to muxer
    // ──────────────────────────────────────────────

    private class EncoderCallback extends MediaCodec.Callback {

        @Override
        public void onInputBufferAvailable(MediaCodec codec, int index) {
            // Input comes from Surface, nothing to do here
        }

        @Override
        public void onOutputBufferAvailable(MediaCodec codec, int index,
                MediaCodec.BufferInfo info) {
            try {
                ByteBuffer buffer = codec.getOutputBuffer(index);
                if (buffer == null) {
                    codec.releaseOutputBuffer(index, false);
                    return;
                }

                // Skip codec config buffers
                if ((info.flags & MediaCodec.BUFFER_FLAG_CODEC_CONFIG) != 0) {
                    info.size = 0;
                }

                if (info.size > 0 && mMuxerStarted) {
                    buffer.position(info.offset);
                    buffer.limit(info.offset + info.size);
                    mMuxer.writeSampleData(mTrackIndex, buffer, info);
                }

                codec.releaseOutputBuffer(index, false);

                if ((info.flags & MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) {
                    Log.d(TAG, "Encoder end of stream");
                }
            } catch (Exception e) {
                Log.e(TAG, "Error writing encoded data", e);
            }
        }

        @Override
        public void onError(MediaCodec codec, MediaCodec.CodecException e) {
            Log.e(TAG, "Encoder error", e);
            handleError("Encoder error: " + e.getMessage());
        }

        @Override
        public void onOutputFormatChanged(MediaCodec codec, MediaFormat format) {
            if (mMuxerStarted) {
                Log.w(TAG, "Output format changed after muxer start — ignoring");
                return;
            }
            mTrackIndex = mMuxer.addTrack(format);
            mMuxer.start();
            mMuxerStarted = true;
            Log.d(TAG, "Muxer started with track " + mTrackIndex);
        }
    }

    // ──────────────────────────────────────────────
    // Cleanup
    // ──────────────────────────────────────────────

    private void releaseAll() {
        // Close camera session
        if (mSession != null) {
            try {
                mSession.stopRepeating();
            } catch (Exception ignored) {}
            try {
                mSession.close();
            } catch (Exception ignored) {}
            mSession = null;
        }

        // Close camera device
        if (mCamera != null) {
            mCamera.close();
            mCamera = null;
        }

        // Stop and release encoder
        if (mEncoder != null) {
            try {
                mEncoder.signalEndOfInputStream();
            } catch (Exception ignored) {}
            try {
                mEncoder.stop();
            } catch (Exception ignored) {}
            try {
                mEncoder.release();
            } catch (Exception ignored) {}
            mEncoder = null;
        }

        // Release input surface
        if (mInputSurface != null) {
            mInputSurface.release();
            mInputSurface = null;
        }

        // Stop and release muxer
        if (mMuxer != null) {
            try {
                if (mMuxerStarted) {
                    mMuxer.stop();
                }
            } catch (Exception ignored) {}
            try {
                mMuxer.release();
            } catch (Exception ignored) {}
            mMuxer = null;
            mMuxerStarted = false;
            mTrackIndex = -1;
        }

        synchronized (mLock) {
            setStatus(StreamStatus.IDLE);
        }

        Log.i(TAG, "Stream resources released");
        if (mListener != null) {
            mListener.onStreamStopped();
        }
    }

    // ──────────────────────────────────────────────
    // Helpers
    // ──────────────────────────────────────────────

    private String getBackCameraId() throws CameraAccessException {
        for (String id : mCameraManager.getCameraIdList()) {
            CameraCharacteristics chars = mCameraManager.getCameraCharacteristics(id);
            Integer facing = chars.get(CameraCharacteristics.LENS_FACING);
            if (facing != null && facing == CameraCharacteristics.LENS_FACING_BACK) {
                return id;
            }
        }
        // Fallback to first camera
        String[] ids = mCameraManager.getCameraIdList();
        return ids.length > 0 ? ids[0] : null;
    }

    private String createOutputPath() {
        File dir = new File("/sdcard/LabOS/media/streams");
        if (!dir.exists()) dir.mkdirs();
        String timestamp = new SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(new Date());
        return new File(dir, "STREAM_" + timestamp + ".mp4").getAbsolutePath();
    }

    /**
     * Get the local file path of the current (or most recent) stream recording.
     *
     * @return Absolute path, or null if no stream has been recorded.
     */
    public String getOutputPath() {
        return mOutputPath;
    }

    private void setStatus(StreamStatus status) {
        mStatus = status;
        Log.d(TAG, "Status -> " + status);
        if (mListener != null) {
            mListener.onStatusChanged(status);
        }
    }

    private void handleError(String message) {
        Log.e(TAG, "Stream error: " + message);
        synchronized (mLock) {
            setStatus(StreamStatus.ERROR);
        }
        if (mListener != null) {
            mListener.onStreamError(message);
        }
        // Clean up on error
        if (mEncoderHandler != null) {
            mEncoderHandler.post(this::releaseAll);
        }
    }
}
