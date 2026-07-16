package com.openlab.labos.camera;

import android.content.Context;
import android.graphics.ImageFormat;
import android.graphics.Rect;
import android.graphics.YuvImage;
import android.hardware.camera2.CameraAccessException;
import android.hardware.camera2.CameraCaptureSession;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraDevice;
import android.hardware.camera2.CameraManager;
import android.hardware.camera2.CaptureRequest;
import android.hardware.camera2.TotalCaptureResult;
import android.util.Range;
import android.media.Image;
import android.media.ImageReader;
import android.media.MediaRecorder;
import android.os.Environment;
import android.os.Handler;
import android.os.HandlerThread;
import android.util.Log;
import android.view.Surface;

import com.openlab.labos.camera.preview.H264PreviewEncoder;
import com.openlab.labos.camera.preview.PreviewProtocolConfig;
import com.openlab.labos.camera.preview.ThermalGovernor;
import com.openlab.labos.camera.preview.TurboJpegEncoder;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;

/**
 * Headless camera capture for the HMD-class device glasses.
 *
 * Uses two ImageReaders with compatible formats for the MediaTek HAL:
 * - Photo ImageReader: JPEG format at full resolution for still captures
 * - Stream ImageReader: YUV_420_888 format at stream resolution for MJPEG preview
 *
 * YUV + JPEG is a universally supported HAL output combination, unlike
 * dual-JPEG which the K900's MTK HAL rejects with EINVAL.
 *
 * The YUV stream frames are compressed to JPEG in software before being
 * sent to the PreviewServer. This approach is actually preferred because:
 * - YUV preview doesn't compete with the JPEG encoder for still captures
 * - Software JPEG compression quality/speed can be tuned independently
 * - The camera HAL can output YUV at full frame rate without ISP bottleneck
 *
 * Warm session management keeps the camera open between operations to avoid
 * expensive open+configure cycles on rapid successive shots.
 */
public class CameraCapture {

    private static final String TAG = "LabOS.Camera";

    private final Context mContext;
    private final CameraManager mCameraManager;
    private final CameraConfig mConfig;

    private CameraDevice mCamera;
    private CameraCaptureSession mSession;
    private HandlerThread mThread;
    private Handler mHandler;

    // Photo surface — JPEG format, full resolution, for still captures
    private ImageReader mPhotoReader;
    private Surface mPhotoSurface;

    // Stream surface — YUV format, stream resolution, for MJPEG preview
    private ImageReader mStreamReader;
    private Surface mStreamSurface;

    // Hardware H.264 encoder surface (low-latency preview transport)
    private H264PreviewEncoder mH264Encoder;
    private Surface mH264Surface;

    // Video recording
    private MediaRecorder mMediaRecorder;
    private boolean mRecording = false;
    private boolean mRecordingStarting = false;
    private String mActiveVideoPath = null;
    private String mLastVideoPath = null;

    // State
    private boolean mWarm = false;
    private volatile boolean mCapturePending = false;
    private volatile boolean mStreamingPreview = false;
    private volatile long mLastStreamFrameTime = 0;
    private byte[] mNv21Buffer;
    private int mNv21BufferSize;
    private ByteArrayOutputStream mJpegStream;
    private CaptureListener mListener;
    private PreviewServer mPreviewServer;
    private final Runnable mCloseRunnable = this::coolDown;
    private ThermalGovernor mThermalGovernor;
    private final Runnable mThermalPollRunnable = this::pollThermalGovernor;
    private static final long THERMAL_POLL_MS = 2000L;

    // ──────────────────────────────────────────────
    // Manual sensor controls
    // ──────────────────────────────────────────────
    // When manualMode is true, AE/AWB are set to OFF and we control
    // exposure time, ISO, white balance, and focus directly.
    // When false (default), the camera runs in full auto mode.

    private boolean mManualMode = false;
    /** Exposure time in nanoseconds (null = auto) */
    private Long mExposureTimeNs = null;
    /** ISO sensitivity (null = auto) */
    private Integer mIso = null;
    /** AE exposure compensation in EV steps (0 = neutral, range typically -4 to +4) */
    private Integer mExposureCompensation = null;
    /** AWB mode (null = auto). Values: 0=OFF, 1=AUTO, 2=INCANDESCENT, 3=FLUORESCENT,
     *  4=WARM_FLUORESCENT, 5=DAYLIGHT, 6=CLOUDY_DAYLIGHT, 7=TWILIGHT, 8=SHADE */
    private Integer mAwbMode = null;
    /** Focus distance in diopters (null = auto, 0 = infinity) */
    private Float mFocusDistance = null;
    /** AF mode override (null = default CONTINUOUS_PICTURE) */
    private Integer mAfMode = null;

    public interface CaptureListener {
        void onPhotoSaved(String path);
        void onVideoStarted();
        void onVideoSaved(String path);
        void onError(String message);
    }

    public CameraCapture(Context context, CameraConfig config) {
        mContext = context;
        mCameraManager = (CameraManager) context.getSystemService(Context.CAMERA_SERVICE);
        mConfig = config;
        mThermalGovernor = new ThermalGovernor((cappedFps, cpuTempC, reason) -> applyFpsCap(cappedFps));
    }

    public void setListener(CaptureListener listener) {
        mListener = listener;
    }

    public CameraConfig getConfig() {
        return mConfig;
    }

    public PreviewServer getPreviewServer() {
        if (mPreviewServer == null) {
            mPreviewServer = new PreviewServer();
            syncPreviewRecordingState();
        }
        return mPreviewServer;
    }

    // ──────────────────────────────────────────────
    // Manual sensor control API
    // ──────────────────────────────────────────────

    /**
     * Query camera sensor capabilities (ISO range, exposure range, etc.)
     * Returns a JSON-formatted string with all available ranges and modes.
     */
    public org.json.JSONObject getSensorCapabilities() {
        org.json.JSONObject caps = new org.json.JSONObject();
        try {
            String cameraId = getBackCameraId();
            if (cameraId == null) return caps;

            CameraCharacteristics chars = mCameraManager.getCameraCharacteristics(cameraId);

            // ISO sensitivity range
            Range<Integer> isoRange = chars.get(CameraCharacteristics.SENSOR_INFO_SENSITIVITY_RANGE);
            if (isoRange != null) {
                caps.put("iso_min", isoRange.getLower());
                caps.put("iso_max", isoRange.getUpper());
            }

            // Exposure time range (nanoseconds)
            Range<Long> expRange = chars.get(CameraCharacteristics.SENSOR_INFO_EXPOSURE_TIME_RANGE);
            if (expRange != null) {
                caps.put("exposure_ns_min", expRange.getLower());
                caps.put("exposure_ns_max", expRange.getUpper());
                // Also provide human-readable shutter speed equivalents
                caps.put("shutter_speed_fastest", "1/" + (1_000_000_000L / expRange.getLower()));
                caps.put("shutter_speed_slowest_ms", expRange.getUpper() / 1_000_000);
            }

            // AE compensation range and step
            Range<Integer> aeCompRange = chars.get(CameraCharacteristics.CONTROL_AE_COMPENSATION_RANGE);
            if (aeCompRange != null) {
                caps.put("ae_comp_min", aeCompRange.getLower());
                caps.put("ae_comp_max", aeCompRange.getUpper());
            }
            android.util.Rational aeStep = chars.get(CameraCharacteristics.CONTROL_AE_COMPENSATION_STEP);
            if (aeStep != null) {
                caps.put("ae_comp_step", aeStep.floatValue());
            }

            // AWB modes
            int[] awbModes = chars.get(CameraCharacteristics.CONTROL_AWB_AVAILABLE_MODES);
            if (awbModes != null) {
                org.json.JSONArray arr = new org.json.JSONArray();
                for (int m : awbModes) arr.put(awbModeToString(m));
                caps.put("awb_modes", arr);
            }

            // AF modes
            int[] afModes = chars.get(CameraCharacteristics.CONTROL_AF_AVAILABLE_MODES);
            if (afModes != null) {
                org.json.JSONArray arr = new org.json.JSONArray();
                for (int m : afModes) arr.put(afModeToString(m));
                caps.put("af_modes", arr);
            }

            // Min focus distance (diopters, 0 = fixed focus)
            Float minFocusDist = chars.get(CameraCharacteristics.LENS_INFO_MINIMUM_FOCUS_DISTANCE);
            if (minFocusDist != null) {
                caps.put("focus_distance_max_diopters", minFocusDist);
            }

            // AE modes
            int[] aeModes = chars.get(CameraCharacteristics.CONTROL_AE_AVAILABLE_MODES);
            if (aeModes != null) {
                org.json.JSONArray arr = new org.json.JSONArray();
                for (int m : aeModes) arr.put(aeModeToString(m));
                caps.put("ae_modes", arr);
            }

            // Target FPS ranges
            Range<Integer>[] fpsRanges = chars.get(CameraCharacteristics.CONTROL_AE_AVAILABLE_TARGET_FPS_RANGES);
            if (fpsRanges != null) {
                org.json.JSONArray arr = new org.json.JSONArray();
                for (Range<Integer> r : fpsRanges) {
                    arr.put(r.getLower() + "-" + r.getUpper());
                }
                caps.put("fps_ranges", arr);
            }

            // Current state — values persist across auto/manual toggles
            caps.put("manual_mode", mManualMode);
            if (mExposureTimeNs != null) caps.put("stored_exposure_ns", mExposureTimeNs);
            if (mIso != null) caps.put("stored_iso", mIso);
            if (mExposureCompensation != null) caps.put("stored_ae_comp", mExposureCompensation);
            if (mAwbMode != null) caps.put("stored_awb_mode", awbModeToString(mAwbMode));
            if (mFocusDistance != null) caps.put("stored_focus_distance", mFocusDistance);

        } catch (Exception e) {
            Log.w(TAG, "Failed to query sensor capabilities", e);
        }
        return caps;
    }

    /**
     * Apply manual sensor parameters. Pass null for any field to leave it unchanged.
     * Set manualMode to false to return to full auto.
     *
     * Takes effect immediately if streaming — the repeating request is updated
     * with the new parameters without rebuilding the session.
     */
    public void setManualParams(Boolean manualMode, Long exposureNs, Integer iso,
                                Integer aeComp, Integer awbMode, Float focusDistance) {
        if (manualMode != null) mManualMode = manualMode;
        // Store values regardless of mode — they persist across auto/manual toggles
        // so switching back to manual restores the user's chosen settings
        if (exposureNs != null) mExposureTimeNs = exposureNs;
        if (iso != null) mIso = iso;
        if (aeComp != null) mExposureCompensation = aeComp;
        if (awbMode != null) mAwbMode = awbMode;
        if (focusDistance != null) mFocusDistance = focusDistance;

        Log.i(TAG, "Manual params updated: mode=" + mManualMode
                + " exp=" + mExposureTimeNs + "ns iso=" + mIso
                + " aeComp=" + mExposureCompensation + " awb=" + mAwbMode
                + " focus=" + mFocusDistance);

        // Re-apply to active preview if streaming
        if (mWarm && mSession != null) {
            ensureThread();
            mHandler.post(this::startPreview);
        }
    }

    private static String awbModeToString(int mode) {
        switch (mode) {
            case CaptureRequest.CONTROL_AWB_MODE_OFF: return "off";
            case CaptureRequest.CONTROL_AWB_MODE_AUTO: return "auto";
            case CaptureRequest.CONTROL_AWB_MODE_INCANDESCENT: return "incandescent";
            case CaptureRequest.CONTROL_AWB_MODE_FLUORESCENT: return "fluorescent";
            case CaptureRequest.CONTROL_AWB_MODE_WARM_FLUORESCENT: return "warm_fluorescent";
            case CaptureRequest.CONTROL_AWB_MODE_DAYLIGHT: return "daylight";
            case CaptureRequest.CONTROL_AWB_MODE_CLOUDY_DAYLIGHT: return "cloudy";
            case CaptureRequest.CONTROL_AWB_MODE_TWILIGHT: return "twilight";
            case CaptureRequest.CONTROL_AWB_MODE_SHADE: return "shade";
            default: return "unknown_" + mode;
        }
    }

    private static String afModeToString(int mode) {
        switch (mode) {
            case CaptureRequest.CONTROL_AF_MODE_OFF: return "off";
            case CaptureRequest.CONTROL_AF_MODE_AUTO: return "auto";
            case CaptureRequest.CONTROL_AF_MODE_MACRO: return "macro";
            case CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_VIDEO: return "continuous_video";
            case CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_PICTURE: return "continuous_picture";
            case CaptureRequest.CONTROL_AF_MODE_EDOF: return "edof";
            default: return "unknown_" + mode;
        }
    }

    private static String aeModeToString(int mode) {
        switch (mode) {
            case CaptureRequest.CONTROL_AE_MODE_OFF: return "off";
            case CaptureRequest.CONTROL_AE_MODE_ON: return "on";
            case CaptureRequest.CONTROL_AE_MODE_ON_AUTO_FLASH: return "auto_flash";
            case CaptureRequest.CONTROL_AE_MODE_ON_ALWAYS_FLASH: return "always_flash";
            case CaptureRequest.CONTROL_AE_MODE_ON_AUTO_FLASH_REDEYE: return "redeye_flash";
            default: return "unknown_" + mode;
        }
    }

    /**
     * Start streaming preview frames to the HTTP server.
     * Uses a YUV_420_888 ImageReader at stream resolution, with software JPEG
     * compression before sending frames to the PreviewServer.
     */
    public void startPreviewStream() {
        ensureThread();
        mHandler.post(() -> {
            try {
                getPreviewServer();
                mConfig.applyStreamFromProtocol(mPreviewServer.getProtocolConfig());
                if (!mPreviewServer.isRunning()) {
                    mPreviewServer.startServer();
                }
                mStreamingPreview = true;
                mLastStreamFrameTime = 0;
                if (isRecording()) {
                    // Recording sessions already include the stream surface when
                    // preview was started first. Do not warm/rebuild the camera
                    // here: on this HAL that interrupts MediaRecorder and turns
                    // off the capture indicator.
                    syncPreviewRecordingState();
                    Log.i(TAG, "Preview already active inside recording session; preserving recorder");
                    return;
                }
                if (!mWarm || mSession == null || mCamera == null) {
                    warmUpInternal();
                } else {
                    // Already warm — rebuild session to include stream surface if needed
                    rebuildSession();
                }
                Log.i(TAG, "Preview streaming started (" + mConfig.getStreamWidth() + "x"
                        + mConfig.getStreamHeight() + " @ " + mConfig.getStreamFps() + "fps, Q"
                        + mConfig.getStreamJpegQuality() + ")");
                startThermalPolling();
            } catch (Exception e) {
                Log.e(TAG, "Failed to start preview stream", e);
            }
        });
    }

    /**
     * Stop streaming preview frames. Camera stays warm per keep-alive timer.
     */
    public void stopPreviewStream() {
        mStreamingPreview = false;
        releaseH264Encoder();
        if (mPreviewServer != null) {
            mPreviewServer.pauseStreaming();
        }
        if (!isRecording()) {
            stopThermalPolling();
        }
        Log.i(TAG, "Preview streaming stopped");
    }

    public boolean isRecording() {
        return mRecording || mRecordingStarting;
    }

    public String getActiveVideoPath() {
        return mActiveVideoPath;
    }

    public String getLastVideoPath() {
        return mLastVideoPath;
    }

    private void syncPreviewRecordingState() {
        if (mPreviewServer != null) {
            mPreviewServer.setRecordingState(isRecording(), mActiveVideoPath, mLastVideoPath);
            if (mThermalGovernor != null) {
                mPreviewServer.setThermalGovernorState(mThermalGovernor.snapshot());
            }
        }
    }

    private void syncThermalBaseline() {
        if (mThermalGovernor == null) return;
        int streamFps = previewProtocolConfig().getFps();
        int baseline = streamFps;
        if (isRecording()) {
            baseline = Math.min(streamFps, mConfig.getVideoFps());
        }
        mThermalGovernor.setBaselineFps(baseline, 12);
        syncPreviewRecordingState();
    }

    private int effectiveCaptureFps() {
        if (mThermalGovernor != null && mThermalGovernor.isEnabled()) {
            if (isRecording()) {
                return Math.min(mConfig.getVideoFps(), mThermalGovernor.getCappedFps());
            }
            return mThermalGovernor.getCappedFps();
        }
        if (isRecording()) {
            return mConfig.getVideoFps();
        }
        return previewProtocolConfig().getFps();
    }

    private void startThermalPolling() {
        if (mHandler == null || mThermalGovernor == null) return;
        syncThermalBaseline();
        mHandler.removeCallbacks(mThermalPollRunnable);
        mHandler.post(mThermalPollRunnable);
    }

    private void stopThermalPolling() {
        if (mHandler != null) {
            mHandler.removeCallbacks(mThermalPollRunnable);
        }
    }

    private void pollThermalGovernor() {
        if (!mStreamingPreview && !isRecording()) return;
        if (mThermalGovernor != null) {
            mThermalGovernor.pollAndApply();
            syncPreviewRecordingState();
        }
        if (mHandler != null && (mStreamingPreview || isRecording())) {
            mHandler.postDelayed(mThermalPollRunnable, THERMAL_POLL_MS);
        }
    }

    /** Apply thermal FPS cap to the active capture session without rebuilding. */
    private void applyFpsCap(int cappedFps) {
        if (mCamera == null || mSession == null) return;
        if (isRecording()) {
            try {
                int targetFps = Math.max(1, Math.min(60, Math.min(cappedFps, mConfig.getVideoFps())));
                CaptureRequest.Builder builder = mCamera.createCaptureRequest(CameraDevice.TEMPLATE_RECORD);
                builder.addTarget(mMediaRecorder.getSurface());
                if (mStreamingPreview) {
                    if (usesHardwareH264Preview() && mH264Surface != null) {
                        builder.addTarget(mH264Surface);
                    } else if (mStreamSurface != null) {
                        builder.addTarget(mStreamSurface);
                    }
                }
                builder.set(CaptureRequest.CONTROL_AE_TARGET_FPS_RANGE, new Range<>(targetFps, targetFps));
                mSession.setRepeatingRequest(builder.build(), null, mHandler);
                Log.i(TAG, "Applied thermal record FPS cap: " + targetFps);
            } catch (Exception e) {
                Log.w(TAG, "Failed to apply thermal record FPS cap", e);
            }
        } else {
            startPreview();
        }
    }

    /**
     * Warm up the camera so the next takePhoto() is near-instant.
     */
    public void warmUp() {
        ensureThread();
        mHandler.post(() -> {
            if (mWarm) return;
            try {
                warmUpInternal();
            } catch (Exception e) {
                Log.e(TAG, "Warm-up failed", e);
            }
        });
    }

    /**
     * Take a single photo at full resolution. Does NOT interrupt the preview stream.
     */
    public void takePhoto() {
        ensureThread();
        mHandler.post(() -> {
            try {
                mCapturePending = true;
                if (mWarm && mSession != null && mCamera != null) {
                    Log.d(TAG, "Taking photo (warm session)");
                    captureStillPhoto();
                } else {
                    Log.d(TAG, "Taking photo (cold start, warming up)");
                    warmUpInternal();
                }
                resetKeepAliveTimer();
            } catch (Exception e) {
                Log.e(TAG, "Photo capture failed", e);
                notifyError("Photo failed: " + e.getMessage());
            }
        });
    }

    public void toggleVideo() {
        if (mRecording || mRecordingStarting) {
            stopVideoRecording();
        } else {
            startVideoRecording();
        }
    }

    public void startVideoRecording() {
        if (mRecording || mRecordingStarting) {
            Log.i(TAG, "Video recording already active");
            return;
        }
        startVideo();
    }

    public void stopVideoRecording() {
        if (!mRecording && !mRecordingStarting) {
            Log.i(TAG, "Video recording already stopped");
            return;
        }
        stopVideo();
    }

    public void release() {
        if (mRecording || mRecordingStarting) stopVideo();
        stopPreviewStream();
        closeCamera();
        if (mThread != null) {
            mThread.quitSafely();
            mThread = null;
            mHandler = null;
        }
    }

    // ──────────────────────────────────────────────
    // Warm session management
    // ──────────────────────────────────────────────

    private void warmUpInternal() throws CameraAccessException {
        String cameraId = getBackCameraId();
        if (cameraId == null) {
            notifyError("No camera found");
            return;
        }

        ensurePhotoReader();
        if (mStreamingPreview) {
            if (usesHardwareH264Preview()) {
                ensureH264Encoder();
            } else {
                releaseH264Encoder();
                ensureStreamReader();
            }
        }

        if (mCamera != null && mSession != null) {
            mWarm = true;
            return;
        }

        closeSessionAndDevice();
        openAndConfigure(cameraId);
    }

    /**
     * Photo reader: JPEG format at full resolution.
     * Only receives frames when a still capture is triggered.
     */
    private void ensurePhotoReader() {
        if (mPhotoReader == null) {
            mPhotoReader = ImageReader.newInstance(
                    mConfig.getVideoWidth(), mConfig.getVideoHeight(),
                    ImageFormat.JPEG, 4);
            mPhotoReader.setOnImageAvailableListener(reader -> {
                Image image = reader.acquireLatestImage();
                if (image != null) {
                    if (mCapturePending) {
                        mCapturePending = false;
                        saveImage(image);
                    }
                    image.close();
                }
            }, mHandler);
            mPhotoSurface = mPhotoReader.getSurface();
        }
    }

    /**
     * Stream reader: YUV_420_888 format at stream resolution.
     *
     * YUV is used instead of JPEG because:
     * 1. The K900 MTK HAL doesn't support two JPEG surfaces in one session
     * 2. YUV + JPEG is a universally supported output combination
     * 3. Software JPEG compression of the YUV gives us full control over quality/speed
     *
     * Frames are compressed to JPEG in the callback and forwarded to PreviewServer.
     */
    private PreviewProtocolConfig previewProtocolConfig() {
        return getPreviewServer().getProtocolConfig();
    }

    private boolean usesHardwareH264Preview() {
        return mStreamingPreview && previewProtocolConfig().usesHardwareH264();
    }

    private void ensureH264Encoder() {
        if (!usesHardwareH264Preview()) {
            releaseH264Encoder();
            return;
        }
        PreviewProtocolConfig protocol = previewProtocolConfig();
        if (mH264Encoder != null && mH264Surface != null) {
            return;
        }
        releaseH264Encoder();
        mH264Encoder = new H264PreviewEncoder(protocol, getPreviewServer().getMetrics());
        mH264Encoder.setListener(new H264PreviewEncoder.Listener() {
            @Override
            public void onAnnexBFrame(byte[] data, long presentationTimeUs, boolean keyFrame) {
                if (mPreviewServer != null) {
                    mPreviewServer.onAnnexBFrame(data);
                }
            }

            @Override
            public void onError(String message) {
                Log.w(TAG, "H.264 preview encoder error: " + message);
            }
        });
        if (!mH264Encoder.start()) {
            releaseH264Encoder();
            return;
        }
        mH264Surface = mH264Encoder.getInputSurface();
        Log.i(TAG, "Hardware H.264 preview encoder ready");
    }

    private void releaseH264Encoder() {
        if (mH264Encoder != null) {
            mH264Encoder.stop();
            mH264Encoder = null;
        }
        mH264Surface = null;
    }

    private void ensureStreamReader() {
        if (usesHardwareH264Preview()) {
            if (mStreamReader != null) {
                mStreamReader.close();
                mStreamReader = null;
                mStreamSurface = null;
            }
            return;
        }
        if (mStreamReader == null) {
            mStreamReader = ImageReader.newInstance(
                    mConfig.getStreamWidth(), mConfig.getStreamHeight(),
                    ImageFormat.YUV_420_888, 2);
            mStreamReader.setOnImageAvailableListener(reader -> {
                Image image = reader.acquireLatestImage();
                if (image == null) return;

                try {
                    if (!mStreamingPreview || mPreviewServer == null) {
                        return;
                    }

                    long now = System.currentTimeMillis();
                    PreviewProtocolConfig protocol = previewProtocolConfig();
                    // Honor fps cap only when not in low-latency mode (pareto: let camera pace frames).
                    if (!protocol.isLowLatency()) {
                        long minInterval = mConfig.getStreamFrameIntervalMs();
                        if (now - mLastStreamFrameTime < minInterval) {
                            return;
                        }
                    }
                    mLastStreamFrameTime = now;

                    if (mPreviewServer != null && mPreviewServer.getProtocolConfig().isInstrumentMetrics()) {
                        mPreviewServer.getMetrics().markCaptureStarted();
                    }

                    // Convert YUV to JPEG in software
                    byte[] jpegData = yuvImageToJpeg(image, mConfig.getStreamJpegQuality());
                    if (jpegData != null) {
                        if (mPreviewServer != null && mPreviewServer.getProtocolConfig().isInstrumentMetrics()) {
                            mPreviewServer.getMetrics().markEncodeFinished();
                        }
                        mPreviewServer.onFrame(jpegData);
                    }
                } finally {
                    image.close();
                }
            }, mHandler);
            mStreamSurface = mStreamReader.getSurface();
        }
    }

    /**
     * Convert a YUV_420_888 Image to JPEG bytes using Android's YuvImage compressor.
     * This is fast enough for streaming at 15-30fps at 640x480.
     */
    private byte[] yuvImageToJpeg(Image image, int quality) {
        try {
            int width = image.getWidth();
            int height = image.getHeight();

            // Convert YUV_420_888 to NV21 byte array for YuvImage
            Image.Plane yPlane = image.getPlanes()[0];
            Image.Plane uPlane = image.getPlanes()[1];
            Image.Plane vPlane = image.getPlanes()[2];

            ByteBuffer yBuffer = yPlane.getBuffer();
            ByteBuffer uBuffer = uPlane.getBuffer();
            ByteBuffer vBuffer = vPlane.getBuffer();

            int yRowStride = yPlane.getRowStride();
            int uvRowStride = uPlane.getRowStride();
            int uvPixelStride = uPlane.getPixelStride();

            int nv21Size = width * height * 3 / 2;
            if (mNv21Buffer == null || mNv21BufferSize != nv21Size) {
                mNv21Buffer = new byte[nv21Size];
                mNv21BufferSize = nv21Size;
                mJpegStream = new ByteArrayOutputStream(Math.max(width * height / 4, 8192));
            }
            byte[] nv21 = mNv21Buffer;

            // Copy Y plane
            if (yRowStride == width) {
                yBuffer.get(nv21, 0, width * height);
            } else {
                for (int row = 0; row < height; row++) {
                    yBuffer.position(row * yRowStride);
                    yBuffer.get(nv21, row * width, width);
                }
            }

            // Copy UV planes into interleaved VU (NV21 format)
            int uvOffset = width * height;
            if (uvPixelStride == 2 && uvRowStride == width) {
                // Semi-planar format — VU already interleaved, just need to copy
                vBuffer.get(nv21, uvOffset, width * height / 2 - 1);
            } else {
                // General case — interleave V and U manually
                for (int row = 0; row < height / 2; row++) {
                    for (int col = 0; col < width / 2; col++) {
                        int uvIndex = row * uvRowStride + col * uvPixelStride;
                        nv21[uvOffset++] = vBuffer.get(uvIndex); // V
                        nv21[uvOffset++] = uBuffer.get(uvIndex); // U
                    }
                }
            }

            // libjpeg-turbo NEON path when NDK module is present
            if (PreviewProtocolConfig.ENCODE_LIBJPEG_TURBO.equals(previewProtocolConfig().getEncodeMode())) {
                byte[] turbo = TurboJpegEncoder.encodeNv21(nv21, width, height, quality);
                if (turbo != null) {
                    return turbo;
                }
            }

            // Compress NV21 to JPEG
            YuvImage yuvImage = new YuvImage(nv21, ImageFormat.NV21, width, height, null);
            mJpegStream.reset();
            yuvImage.compressToJpeg(new Rect(0, 0, width, height), quality, mJpegStream);
            return mJpegStream.toByteArray();

        } catch (Exception e) {
            Log.w(TAG, "YUV to JPEG conversion failed", e);
            return null;
        }
    }

    @SuppressWarnings("MissingPermission")
    private void openAndConfigure(String cameraId) throws CameraAccessException {
        mCameraManager.openCamera(cameraId, new CameraDevice.StateCallback() {
            @Override
            public void onOpened(CameraDevice camera) {
                mCamera = camera;
                buildSession();
            }

            @Override
            public void onDisconnected(CameraDevice camera) {
                mWarm = false;
                closeCamera();
            }

            @Override
            public void onError(CameraDevice camera, int error) {
                mWarm = false;
                notifyError("Camera error: " + error);
                closeCamera();
            }
        }, mHandler);
    }

    /**
     * Build a capture session with all currently needed surfaces.
     *
     * When streaming: photo (JPEG) + stream (YUV) — two different formats,
     * which the MTK HAL handles correctly unlike dual-JPEG.
     * When not streaming: photo (JPEG) only.
     */
    private void buildSession() {
        if (mCamera == null) return;
        try {
            List<Surface> surfaces = new ArrayList<>();
            if (mStreamingPreview && usesHardwareH264Preview() && mH264Surface != null) {
                // MTK HAL: photo JPEG + H.264 encoder in one session can fail configure.
                // Preview uses encoder surface only; stills rebuild the session temporarily.
                surfaces.add(mH264Surface);
            } else {
                surfaces.add(mPhotoSurface);
                if (mStreamingPreview && mStreamSurface != null) {
                    surfaces.add(mStreamSurface);
                }
            }

            mCamera.createCaptureSession(surfaces,
                    new CameraCaptureSession.StateCallback() {
                        @Override
                        public void onConfigured(CameraCaptureSession session) {
                            mSession = session;
                            mWarm = true;
                            String surfaceMode = "photo";
                            if (mStreamingPreview) {
                                surfaceMode = usesHardwareH264Preview() ? "photo+h264" : "photo+stream";
                            }
                            Log.i(TAG, "Camera warm — session ready (surfaces=" + surfaceMode + ")");
                            startPreview();
                            if (mCapturePending) {
                                captureStillPhoto();
                            }
                        }

                        @Override
                        public void onConfigureFailed(CameraCaptureSession session) {
                            notifyError("Camera session config failed");
                            closeCamera();
                        }
                    }, mHandler);
        } catch (CameraAccessException e) {
            notifyError("Session creation failed: " + e.getMessage());
        }
    }

    /**
     * Rebuild the session when surfaces change (e.g. streaming started/stopped).
     */
    private void rebuildSession() {
        if (mCamera == null) return;
        if (mStreamingPreview) {
            if (usesHardwareH264Preview()) {
                ensureH264Encoder();
            } else {
                releaseH264Encoder();
                ensureStreamReader();
            }
        }
        // Close old session and build new one with updated surface list
        if (mSession != null) {
            try { mSession.close(); } catch (Exception ignored) {}
            mSession = null;
        }
        buildSession();
    }

    /**
     * Start the repeating preview request.
     *
     * When streaming, the preview targets ONLY the YUV stream surface.
     * The photo JPEG surface is only targeted during still captures.
     * This avoids the MTK HAL issue with continuous JPEG encoding and
     * reduces unnecessary JPEG compression overhead.
     *
     * Applies manual sensor parameters if manual mode is enabled —
     * exposure time, ISO, white balance, and focus can all be controlled
     * independently like a professional camera's manual mode.
     */
    private void startPreview() {
        if (mCamera == null || mSession == null) return;
        try {
            CaptureRequest.Builder preview = mCamera.createCaptureRequest(CameraDevice.TEMPLATE_PREVIEW);

            if (mStreamingPreview) {
                if (usesHardwareH264Preview() && mH264Surface != null) {
                    preview.addTarget(mH264Surface);
                } else if (mStreamSurface != null) {
                    preview.addTarget(mStreamSurface);
                } else {
                    preview.addTarget(mPhotoSurface);
                }
            } else {
                preview.addTarget(mPhotoSurface);
            }

            // Apply manual or auto sensor controls
            if (mManualMode) {
                applyManualControls(preview);
            } else {
                // Full auto mode
                preview.set(CaptureRequest.CONTROL_MODE, CaptureRequest.CONTROL_MODE_AUTO);
                preview.set(CaptureRequest.CONTROL_AF_MODE, CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_PICTURE);
                preview.set(CaptureRequest.CONTROL_AE_MODE, CaptureRequest.CONTROL_AE_MODE_ON);
                preview.set(CaptureRequest.CONTROL_AWB_MODE, CaptureRequest.CONTROL_AWB_MODE_AUTO);

                // Still apply AE compensation in auto mode if set
                if (mExposureCompensation != null) {
                    preview.set(CaptureRequest.CONTROL_AE_EXPOSURE_COMPENSATION, mExposureCompensation);
                }
            }

            if (mStreamingPreview && (mStreamSurface != null || mH264Surface != null)) {
                int targetFps = Math.max(1, Math.min(60, effectiveCaptureFps()));
                preview.set(
                        CaptureRequest.CONTROL_AE_TARGET_FPS_RANGE,
                        new Range<>(targetFps, targetFps));

                if (previewProtocolConfig().isLowLatency()) {
                    preview.set(CaptureRequest.CONTROL_VIDEO_STABILIZATION_MODE,
                            CaptureRequest.CONTROL_VIDEO_STABILIZATION_MODE_OFF);
                    preview.set(CaptureRequest.EDGE_MODE, CaptureRequest.EDGE_MODE_FAST);
                    preview.set(CaptureRequest.NOISE_REDUCTION_MODE,
                            CaptureRequest.NOISE_REDUCTION_MODE_OFF);
                }
            }

            mSession.setRepeatingRequest(preview.build(), null, mHandler);
        } catch (CameraAccessException e) {
            Log.w(TAG, "Failed to start preview", e);
        }
    }

    /**
     * Apply manual exposure, ISO, white balance, and focus controls to a capture request.
     * This gives the dashboard full manual camera control like a DSLR:
     *
     * - Exposure time: controls shutter speed (longer = brighter + motion blur)
     * - ISO: sensor sensitivity (higher = brighter + more noise)
     * - AWB mode: white balance preset (daylight, fluorescent, etc.)
     * - Focus distance: manual focus in diopters
     */
    private void applyManualControls(CaptureRequest.Builder builder) {
        // If we have exposure time or ISO, we need full manual AE
        if (mExposureTimeNs != null || mIso != null) {
            builder.set(CaptureRequest.CONTROL_AE_MODE, CaptureRequest.CONTROL_AE_MODE_OFF);
            if (mExposureTimeNs != null) {
                builder.set(CaptureRequest.SENSOR_EXPOSURE_TIME, mExposureTimeNs);
            }
            if (mIso != null) {
                builder.set(CaptureRequest.SENSOR_SENSITIVITY, mIso);
            }
        } else {
            // No manual exposure/ISO — use auto AE with optional compensation
            builder.set(CaptureRequest.CONTROL_AE_MODE, CaptureRequest.CONTROL_AE_MODE_ON);
            if (mExposureCompensation != null) {
                builder.set(CaptureRequest.CONTROL_AE_EXPOSURE_COMPENSATION, mExposureCompensation);
            }
        }

        // White balance
        if (mAwbMode != null) {
            builder.set(CaptureRequest.CONTROL_AWB_MODE, mAwbMode);
        } else {
            builder.set(CaptureRequest.CONTROL_AWB_MODE, CaptureRequest.CONTROL_AWB_MODE_AUTO);
        }

        // Focus
        if (mFocusDistance != null) {
            builder.set(CaptureRequest.CONTROL_AF_MODE, CaptureRequest.CONTROL_AF_MODE_OFF);
            builder.set(CaptureRequest.LENS_FOCUS_DISTANCE, mFocusDistance);
        } else {
            builder.set(CaptureRequest.CONTROL_AF_MODE, CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_PICTURE);
        }
    }

    /**
     * Capture a still photo on the full-res JPEG photo surface.
     * Does NOT call stopRepeating() — the stream continues uninterrupted.
     */
    private void captureStillPhoto() {
        if (mCamera == null || mSession == null) return;
        try {
            mCapturePending = true;

            CaptureRequest.Builder builder = mCamera.createCaptureRequest(CameraDevice.TEMPLATE_STILL_CAPTURE);
            builder.addTarget(mPhotoSurface);
            builder.set(CaptureRequest.CONTROL_AF_MODE, CaptureRequest.CONTROL_AF_MODE_AUTO);
            builder.set(CaptureRequest.JPEG_QUALITY, (byte) mConfig.getJpegQuality());
            builder.set(CaptureRequest.FLASH_MODE, CaptureRequest.FLASH_MODE_OFF);

            mSession.capture(builder.build(), new CameraCaptureSession.CaptureCallback() {
                @Override
                public void onCaptureCompleted(CameraCaptureSession session,
                        CaptureRequest request, TotalCaptureResult result) {
                    Log.i(TAG, "Photo captured");
                    // No need to restart preview — it was never stopped
                }
            }, mHandler);
        } catch (CameraAccessException e) {
            notifyError("Capture failed: " + e.getMessage());
        }
    }

    private void resetKeepAliveTimer() {
        if (mHandler == null) return;
        mHandler.removeCallbacks(mCloseRunnable);
        mHandler.postDelayed(mCloseRunnable, mConfig.getCameraKeepAliveMs());
    }

    private void coolDown() {
        if (mRecording || mStreamingPreview) return;
        Log.i(TAG, "Keep-alive expired, closing camera");
        mWarm = false;
        closeSessionAndDevice();
    }

    // ──────────────────────────────────────────────
    // Video recording
    // ──────────────────────────────────────────────

    private void startVideo() {
        ensureThread();

        try {
            mRecordingStarting = true;
            mWarm = false;
            if (mHandler != null) mHandler.removeCallbacks(mCloseRunnable);
            closeSessionAndDevice();

            String cameraId = getBackCameraId();
            if (cameraId == null) {
                mRecordingStarting = false;
                syncPreviewRecordingState();
                notifyError("No camera found");
                return;
            }

            String path = getOutputPath("VID", ".mp4");
            mActiveVideoPath = path;
            syncPreviewRecordingState();
            try {
                mMediaRecorder = createVideoRecorder(path, true);
            } catch (Exception audioVideoError) {
                Log.w(TAG, "Audio+video recorder init failed; falling back to video-only", audioVideoError);
                releaseMediaRecorder();
                mMediaRecorder = createVideoRecorder(path, false);
            }

            openCameraForVideo(cameraId, path);

        } catch (Exception e) {
            Log.e(TAG, "Video start failed", e);
            notifyError("Video failed: " + e.getMessage());
            mRecording = false;
            mRecordingStarting = false;
            mActiveVideoPath = null;
            syncPreviewRecordingState();
        }
    }

    private MediaRecorder createVideoRecorder(String path, boolean includeAudio) throws Exception {
        MediaRecorder recorder = new MediaRecorder();
        if (includeAudio) {
            recorder.setAudioSource(MediaRecorder.AudioSource.MIC);
        }
        recorder.setVideoSource(MediaRecorder.VideoSource.SURFACE);
        recorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4);
        recorder.setVideoEncoder(MediaRecorder.VideoEncoder.H264);
        if (includeAudio) {
            recorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC);
        }
        recorder.setVideoSize(mConfig.getVideoWidth(), mConfig.getVideoHeight());
        recorder.setVideoFrameRate(mConfig.getVideoFps());
        recorder.setVideoEncodingBitRate(mConfig.getVideoBitrate());
        recorder.setOutputFile(path);
        recorder.prepare();
        return recorder;
    }

    private void releaseMediaRecorder() {
        if (mMediaRecorder == null) return;
        try {
            mMediaRecorder.release();
        } catch (Exception ignored) {
            // Best-effort cleanup before rebuilding the recorder without audio.
        }
        mMediaRecorder = null;
    }

    private void stopVideo() {
        try {
            if (mMediaRecorder != null) {
                mMediaRecorder.stop();
                mMediaRecorder.release();
                mMediaRecorder = null;
            }
            String savedPath = mActiveVideoPath != null ? mActiveVideoPath : "saved";
            mRecording = false;
            mRecordingStarting = false;
            mLastVideoPath = savedPath;
            mActiveVideoPath = null;
            syncPreviewRecordingState();
            closeSessionAndDevice();
            if (!mStreamingPreview) {
                stopThermalPolling();
            }
            Log.i(TAG, "Video recording stopped: " + savedPath);
            if (mListener != null) mListener.onVideoSaved(savedPath);
        } catch (Exception e) {
            Log.e(TAG, "Video stop failed", e);
            mRecording = false;
            mRecordingStarting = false;
            mActiveVideoPath = null;
            syncPreviewRecordingState();
        }
    }

    @SuppressWarnings("MissingPermission")
    private void openCameraForVideo(String cameraId, String videoPath) throws CameraAccessException {
        mCameraManager.openCamera(cameraId, new CameraDevice.StateCallback() {
            @Override
            public void onOpened(CameraDevice camera) {
                mCamera = camera;
                try {
                    Surface recorderSurface = mMediaRecorder.getSurface();

                    // Include YUV stream surface during recording if preview is active
                    List<Surface> surfaces = new ArrayList<>();
                    surfaces.add(recorderSurface);
                    if (mStreamingPreview) {
                        if (usesHardwareH264Preview() && mH264Surface != null) {
                            surfaces.add(mH264Surface);
                        } else if (mStreamSurface != null) {
                            surfaces.add(mStreamSurface);
                        }
                    }

                    camera.createCaptureSession(surfaces,
                        new CameraCaptureSession.StateCallback() {
                            @Override
                            public void onConfigured(CameraCaptureSession session) {
                                mSession = session;
                                try {
                                    CaptureRequest.Builder builder =
                                        camera.createCaptureRequest(CameraDevice.TEMPLATE_RECORD);
                                    builder.addTarget(recorderSurface);
                                    if (mStreamingPreview) {
                                        if (usesHardwareH264Preview() && mH264Surface != null) {
                                            builder.addTarget(mH264Surface);
                                        } else if (mStreamSurface != null) {
                                            builder.addTarget(mStreamSurface);
                                        }
                                    }
                                    int recordFps = Math.max(1, Math.min(60, effectiveCaptureFps()));
                                    builder.set(
                                            CaptureRequest.CONTROL_AE_TARGET_FPS_RANGE,
                                            new Range<>(recordFps, recordFps));
                                    session.setRepeatingRequest(builder.build(), null, mHandler);
                                    mMediaRecorder.start();
                                    mRecordingStarting = false;
                                    mRecording = true;
                                    mActiveVideoPath = videoPath;
                                    syncPreviewRecordingState();
                                    Log.i(TAG, "Video recording started: " + videoPath);
                                    if (mListener != null) mListener.onVideoStarted();
                                    startThermalPolling();
                                } catch (Exception e) {
                                    mRecordingStarting = false;
                                    syncPreviewRecordingState();
                                    notifyError("Record start failed");
                                }
                            }

                            @Override
                            public void onConfigureFailed(CameraCaptureSession session) {
                                notifyError("Video session config failed");
                            }
                        }, mHandler);
                } catch (CameraAccessException e) {
                    notifyError("Video session failed");
                }
            }

            @Override
            public void onDisconnected(CameraDevice camera) { closeCamera(); }

            @Override
            public void onError(CameraDevice camera, int error) {
                notifyError("Camera error: " + error);
            }
        }, mHandler);
    }

    // ──────────────────────────────────────────────
    // Internal helpers
    // ──────────────────────────────────────────────

    private void ensureThread() {
        if (mThread == null) {
            mThread = new HandlerThread("LabOS-Camera");
            mThread.start();
            mHandler = new Handler(mThread.getLooper());
        }
    }

    private String getBackCameraId() throws CameraAccessException {
        for (String id : mCameraManager.getCameraIdList()) {
            CameraCharacteristics chars = mCameraManager.getCameraCharacteristics(id);
            Integer facing = chars.get(CameraCharacteristics.LENS_FACING);
            if (facing != null && facing == CameraCharacteristics.LENS_FACING_BACK) {
                return id;
            }
        }
        String[] ids = mCameraManager.getCameraIdList();
        return ids.length > 0 ? ids[0] : null;
    }

    private void saveImage(Image image) {
        ByteBuffer buffer = image.getPlanes()[0].getBuffer();
        byte[] bytes = new byte[buffer.remaining()];
        buffer.get(bytes);

        String path = getOutputPath("IMG", ".jpg");
        try (FileOutputStream fos = new FileOutputStream(path)) {
            fos.write(bytes);
            Log.i(TAG, "Photo saved: " + path);
            if (mListener != null) mListener.onPhotoSaved(path);
        } catch (IOException e) {
            Log.e(TAG, "Failed to save photo", e);
            notifyError("Save failed: " + e.getMessage());
        }
    }

    private String getOutputPath(String prefix, String extension) {
        File dir = new File(Environment.getExternalStorageDirectory(), "LabOS/media");
        if (!dir.exists()) dir.mkdirs();
        String timestamp = new SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(new Date());
        return new File(dir, prefix + "_" + timestamp + extension).getAbsolutePath();
    }

    private void closeSessionAndDevice() {
        if (mSession != null) {
            try { mSession.close(); } catch (Exception ignored) {}
            mSession = null;
        }
        if (mCamera != null) {
            mCamera.close();
            mCamera = null;
        }
    }

    private void closeCamera() {
        mWarm = false;
        releaseH264Encoder();
        closeSessionAndDevice();
        if (mPhotoReader != null) {
            mPhotoReader.close();
            mPhotoReader = null;
            mPhotoSurface = null;
        }
        if (mStreamReader != null) {
            mStreamReader.close();
            mStreamReader = null;
            mStreamSurface = null;
        }
    }

    private void notifyError(String msg) {
        Log.e(TAG, msg);
        if (mListener != null) mListener.onError(msg);
    }
}
