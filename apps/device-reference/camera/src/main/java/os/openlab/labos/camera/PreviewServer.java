package com.openlab.labos.camera;

import android.util.Log;

import com.openlab.labos.camera.preview.PreviewMetrics;
import com.openlab.labos.camera.preview.PreviewProtocolConfig;

import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.IOException;

import fi.iki.elonen.NanoHTTPD;

/**
 * Lightweight HTTP server running on the glasses that serves camera frames.
 *
 * Supports two modes:
 * - Single frame:  GET /frame       -> returns latest JPEG
 * - MJPEG stream:  GET /stream      -> multipart/x-mixed-replace continuous stream
 * - Health check:  GET /health      -> { "ok": true, "fps": N }
 *
 * The MJPEG stream can be consumed directly by an <img> tag in the browser:
 *   <img src="http://localhost:8089/stream" />
 *
 * Port: 8089 (forwarded via `adb forward tcp:8089 tcp:8089`)
 */
public class PreviewServer extends NanoHTTPD {

    private static final String TAG = "LabOS.PreviewServer";
    private static final int PORT = 8089;
    private static final String BOUNDARY = "labos-frame-boundary";

    private final Object mFrameLock = new Object();
    private volatile byte[] mLatestFrame = null;
    private volatile long mLatestFrameSeq = 0;
    private volatile boolean mStreaming = false;
    private volatile boolean mH264Streaming = false;
    private volatile int mFrameCount = 0;
    private volatile long mStartTime = 0;
    private volatile long mFpsWindowStartTime = 0;
    private volatile int mFpsWindowFrameCount = 0;
    private volatile float mRecentFps = 0;
    private volatile long mLastFrameTime = 0;
    private volatile long mLatestFrameCapturedAt = 0;
    private volatile boolean mRecording = false;
    private volatile String mActiveVideoPath = "";
    private volatile String mLastVideoPath = "";
    private volatile org.json.JSONObject mThermalGovernorState = null;
    private final PreviewProtocolConfig mProtocolConfig = PreviewProtocolConfig.balancedDefaults();
    private final PreviewMetrics mMetrics = new PreviewMetrics();
    private volatile byte[] mLatestAnnexB = null;
    private volatile long mLatestAnnexBSeq = 0;
    private volatile long mLatestFrameBytes = 0;

    public PreviewProtocolConfig getProtocolConfig() {
        return mProtocolConfig;
    }

    public PreviewMetrics getMetrics() {
        return mMetrics;
    }

    public void onAnnexBFrame(byte[] annexB) {
        synchronized (mFrameLock) {
            long now = System.currentTimeMillis();
            mLatestAnnexB = annexB;
            mLatestAnnexBSeq++;
            mLatestFrameBytes = annexB != null ? annexB.length : 0;
            mFrameCount++;
            mFpsWindowFrameCount++;
            mLastFrameTime = now;
            mLatestFrameCapturedAt = now;
            if (mProtocolConfig.isInstrumentMetrics()) {
                mMetrics.markPublishFinished();
            }
            if (mFpsWindowStartTime == 0) {
                mFpsWindowStartTime = now;
            } else {
                long elapsed = now - mFpsWindowStartTime;
                if (elapsed >= 1000) {
                    mRecentFps = (mFpsWindowFrameCount * 1000f) / elapsed;
                    mFpsWindowStartTime = now;
                    mFpsWindowFrameCount = 0;
                }
            }
            mFrameLock.notifyAll();
        }
    }
    public PreviewServer() {
        super(PORT);
    }

    @Override
    public Response serve(IHTTPSession session) {
        String uri = session.getUri();

        if (Method.OPTIONS.equals(session.getMethod())) {
            Response r = newFixedLengthResponse(Response.Status.OK, "text/plain", "");
            addCorsHeaders(r);
            return r;
        }

        Response response;
        if (Method.PUT.equals(session.getMethod()) && "/config".equals(uri)) {
            response = updateConfig(session);
        } else switch (uri) {
            case "/frame":
                response = serveFrame();
                break;
            case "/stream":
                response = serveMjpegStream();
                break;
            case "/stream/avc":
                response = serveH264Stream();
                break;
            case "/health":
                response = serveHealth();
                break;
            case "/config":
                response = serveConfig();
                break;
            case "/metrics":
                response = serveMetrics();
                break;
            default:
                response = newFixedLengthResponse(Response.Status.NOT_FOUND, "text/plain", "Not found");
                break;
        }

        addCorsHeaders(response);
        return response;
    }

    /**
     * Update the latest frame. Called from CameraCapture's ImageReader callback.
     * Wakes any waiting MJPEG stream threads immediately.
     */
    public void onFrame(byte[] jpegData) {
        synchronized (mFrameLock) {
            long now = System.currentTimeMillis();
            mLatestFrame = jpegData;
            mLatestFrameSeq++;
            mLatestFrameBytes = jpegData != null ? jpegData.length : 0;
            mFrameCount++;
            mFpsWindowFrameCount++;
            mLastFrameTime = now;
            mLatestFrameCapturedAt = now;
            if (mProtocolConfig.isInstrumentMetrics()) {
                mMetrics.markPublishFinished();
            }
            if (mFpsWindowStartTime == 0) {
                mFpsWindowStartTime = now;
            } else {
                long elapsed = now - mFpsWindowStartTime;
                if (elapsed >= 1000) {
                    mRecentFps = (mFpsWindowFrameCount * 1000f) / elapsed;
                    mFpsWindowStartTime = now;
                    mFpsWindowFrameCount = 0;
                }
            }
            mFrameLock.notifyAll();
        }
    }

    public void startServer() {
        try {
            start(30000, false);
            resetMetrics();
            Log.i(TAG, "Preview server started on port " + PORT);
        } catch (IOException e) {
            Log.e(TAG, "Failed to start preview server", e);
        }
    }

    public void stopServer() {
        pauseStreaming();
        stop();
        Log.i(TAG, "Preview server stopped");
    }

    /** Stop active stream clients but keep HTTP server alive for /config and /metrics. */
    public void pauseStreaming() {
        mStreaming = false;
        mH264Streaming = false;
        synchronized (mFrameLock) {
            mLatestFrameCapturedAt = 0;
            mLastFrameTime = 0;
            mLatestFrameBytes = 0;
            mFrameLock.notifyAll();
        }
    }

    public boolean isRunning() {
        return isAlive();
    }

    public void setRecordingState(boolean recording, String activeVideoPath, String lastVideoPath) {
        mRecording = recording;
        mActiveVideoPath = activeVideoPath == null ? "" : activeVideoPath;
        mLastVideoPath = lastVideoPath == null ? "" : lastVideoPath;
    }

    public void setThermalGovernorState(org.json.JSONObject state) {
        mThermalGovernorState = state;
    }

    public float getFps() {
        long now = System.currentTimeMillis();
        if (mLastFrameTime == 0 || now - mLastFrameTime > 1500) return 0;
        long elapsed = now - mFpsWindowStartTime;
        if (mFpsWindowFrameCount > 1 && elapsed > 0) {
            return (mFpsWindowFrameCount * 1000f) / elapsed;
        }
        return mRecentFps;
    }

    private void resetMetrics() {
        long now = System.currentTimeMillis();
        mStartTime = now;
        mFrameCount = 0;
        mFpsWindowStartTime = 0;
        mFpsWindowFrameCount = 0;
        mRecentFps = 0;
        mLastFrameTime = 0;
    }

    // ──────────────────────────────────────────────

    private Response serveFrame() {
        byte[] frame = mLatestFrame;
        if (frame == null) {
            return newFixedLengthResponse(Response.Status.SERVICE_UNAVAILABLE,
                    "text/plain", "No frame available");
        }
        return newFixedLengthResponse(Response.Status.OK, "image/jpeg",
                new ByteArrayInputStream(frame), frame.length);
    }

    private Response serveMjpegStream() {
        mStreaming = true;
        Response response = newChunkedResponse(Response.Status.OK,
                "multipart/x-mixed-replace; boundary=" + BOUNDARY,
                new MjpegInputStream());
        response.addHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        response.addHeader("Pragma", "no-cache");
        response.addHeader("Expires", "0");
        response.addHeader("Connection", "keep-alive");
        return response;
    }

    private Response serveHealth() {
        long frameAge = mLatestFrameCapturedAt > 0
                ? Math.max(0, System.currentTimeMillis() - mLatestFrameCapturedAt)
                : -1;
        String json = String.format(
                "{\"ok\":true,\"fps\":%.1f,\"frameCount\":%d,\"streaming\":%b,\"recording\":%b,"
                        + "\"lastFrameAtMs\":%d,\"streamFrameAgeMs\":%s,"
                        + "\"encodeMode\":\"%s\",\"transport\":\"%s\","
                        + "\"activeVideoPath\":\"%s\",\"lastVideoPath\":\"%s\"}",
                getFps(), mFrameCount, mStreaming || mH264Streaming, mRecording, mLatestFrameCapturedAt,
                frameAge >= 0 ? String.valueOf(frameAge) : "null",
                escapeJson(mProtocolConfig.getEncodeMode()),
                escapeJson(mProtocolConfig.getTransport()),
                escapeJson(mActiveVideoPath), escapeJson(mLastVideoPath));
        return newFixedLengthResponse(Response.Status.OK, "application/json", json);
    }

    private Response serveConfig() {
        return newFixedLengthResponse(Response.Status.OK, "application/json",
                mProtocolConfig.toJson().toString());
    }

    private Response updateConfig(IHTTPSession session) {
        try {
            byte[] body = readRequestBody(session);
            if (body.length > 0) {
                mProtocolConfig.updateFromJson(new JSONObject(new String(body)));
                mMetrics.reset();
                synchronized (mFrameLock) {
                    mLatestFrameCapturedAt = 0;
                    mLastFrameTime = 0;
                }
            }
            return newFixedLengthResponse(Response.Status.OK, "application/json",
                    mProtocolConfig.toJson().toString());
        } catch (Exception e) {
            return newFixedLengthResponse(Response.Status.BAD_REQUEST, "application/json",
                    "{\"ok\":false,\"error\":\"" + escapeJson(e.getMessage()) + "\"}");
        }
    }

    private Response serveMetrics() {
        return newFixedLengthResponse(Response.Status.OK, "application/json",
                mMetrics.snapshot(
                        mProtocolConfig,
                        mStreaming || mH264Streaming,
                        mFrameCount,
                        mLatestFrameCapturedAt,
                        mLatestFrameBytes,
                        mRecording,
                        mThermalGovernorState).toString());
    }

    private Response serveH264Stream() {
        mH264Streaming = true;
        Response response = newChunkedResponse(Response.Status.OK, "video/h264", new H264InputStream());
        response.addHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        response.addHeader("Connection", "keep-alive");
        return response;
    }

    private byte[] readRequestBody(IHTTPSession session) throws IOException, NanoHTTPD.ResponseException {
        int contentLength = Integer.parseInt(session.getHeaders().getOrDefault("content-length", "0"));
        if (contentLength <= 0) return new byte[0];
        byte[] buffer = new byte[contentLength];
        int read = session.getInputStream().read(buffer, 0, contentLength);
        if (read <= 0) return new byte[0];
        if (read == contentLength) return buffer;
        byte[] trimmed = new byte[read];
        System.arraycopy(buffer, 0, trimmed, 0, read);
        return trimmed;
    }

    private static String escapeJson(String value) {
        if (value == null) return "";
        return value.replace("\\", "\\\\").replace("\"", "\\\"");
    }

    private void addCorsHeaders(Response response) {
        response.addHeader("Access-Control-Allow-Origin", "*");
        response.addHeader("Access-Control-Allow-Methods", "GET, PUT, OPTIONS");
        response.addHeader("Access-Control-Allow-Headers", "*");
    }

    // ──────────────────────────────────────────────

    /**
     * InputStream that produces an MJPEG multipart stream.
     * Uses wait/notify — the thread sleeps until a new frame arrives,
     * zero CPU between frames.
     */
    private class MjpegInputStream extends java.io.InputStream {
        private byte[] mCurrentChunk = null;
        private int mChunkPos = 0;
        private long mLastSeenSeq = -1;
        private final StringBuilder mHeaderBuilder = new StringBuilder(96);
        private final byte[] mFrameSuffix = "\r\n".getBytes();

        @Override
        public int read() throws IOException {
            byte[] buf = new byte[1];
            int r = read(buf, 0, 1);
            return r == -1 ? -1 : (buf[0] & 0xFF);
        }

        @Override
        public int read(byte[] b, int off, int len) throws IOException {
            if (!mStreaming) return -1;

            if (mCurrentChunk == null || mChunkPos >= mCurrentChunk.length) {
                mCurrentChunk = getNextFrameChunk();
                mChunkPos = 0;
                if (mCurrentChunk == null) return -1;
            }

            int available = mCurrentChunk.length - mChunkPos;
            int toRead = Math.min(len, available);
            System.arraycopy(mCurrentChunk, mChunkPos, b, off, toRead);
            mChunkPos += toRead;
            return toRead;
        }

        private byte[] getNextFrameChunk() {
            byte[] frame;

            synchronized (mFrameLock) {
                frame = mLatestFrame;
                if (frame != null && mLatestFrameSeq > mLastSeenSeq) {
                    mLastSeenSeq = mLatestFrameSeq;
                } else {
                    frame = null;
                    // Wait for a new frame (up to 500ms)
                    long deadline = System.currentTimeMillis() + 500;
                    while (mStreaming && mLatestFrameSeq <= mLastSeenSeq) {
                        long remaining = deadline - System.currentTimeMillis();
                        if (remaining <= 0) break;
                        try {
                            mFrameLock.wait(remaining);
                        } catch (InterruptedException e) {
                            return null;
                        }
                    }

                    frame = mLatestFrame;
                    if (frame != null) {
                        mLastSeenSeq = mLatestFrameSeq;
                    }
                }
            }

            if (!mStreaming) return null;
            if (frame == null) return null;

            // Build multipart chunk with minimal allocation
            mHeaderBuilder.setLength(0);
            mHeaderBuilder.append("--").append(BOUNDARY).append("\r\n")
                    .append("Content-Type: image/jpeg\r\n");
            if (mProtocolConfig.isInstrumentMetrics()) {
                mHeaderBuilder.append("X-LabOS-Frame-Time: ").append(mLatestFrameCapturedAt).append("\r\n")
                        .append("X-LabOS-Frame-Seq: ").append(mMetrics.getFrameSeq() + 1).append("\r\n");
                long captureToEncode = mMetrics.getLastCaptureToEncodeMs();
                long encodeToPublish = mMetrics.getLastEncodeToPublishMs();
                if (captureToEncode >= 0) {
                    mHeaderBuilder.append("X-LabOS-Capture-To-Encode-Ms: ").append(captureToEncode).append("\r\n");
                }
                if (encodeToPublish >= 0) {
                    mHeaderBuilder.append("X-LabOS-Encode-To-Publish-Ms: ").append(encodeToPublish).append("\r\n");
                }
            }
            mHeaderBuilder.append("Content-Length: ")
                    .append(frame.length)
                    .append("\r\n\r\n");
            byte[] header = mHeaderBuilder.toString().getBytes();
            byte[] chunk = new byte[header.length + frame.length + mFrameSuffix.length];
            System.arraycopy(header, 0, chunk, 0, header.length);
            System.arraycopy(frame, 0, chunk, header.length, frame.length);
            System.arraycopy(mFrameSuffix, 0, chunk, header.length + frame.length, mFrameSuffix.length);
            return chunk;
        }

        @Override
        public int available() {
            if (mCurrentChunk != null && mChunkPos < mCurrentChunk.length) {
                return mCurrentChunk.length - mChunkPos;
            }
            return 0;
        }
    }

    private class H264InputStream extends java.io.InputStream {
        private byte[] mCurrent = null;
        private int mPos = 0;
        private long mLastSeenSeq = -1;

        @Override
        public int read() throws IOException {
            byte[] buf = new byte[1];
            int r = read(buf, 0, 1);
            return r == -1 ? -1 : (buf[0] & 0xFF);
        }

        @Override
        public int read(byte[] b, int off, int len) throws IOException {
            if (!mH264Streaming) return -1;
            if (mCurrent == null || mPos >= mCurrent.length) {
                mCurrent = nextAnnexB();
                mPos = 0;
                if (mCurrent == null) return -1;
            }
            int available = mCurrent.length - mPos;
            int toRead = Math.min(len, available);
            System.arraycopy(mCurrent, mPos, b, off, toRead);
            mPos += toRead;
            return toRead;
        }

        private byte[] nextAnnexB() {
            synchronized (mFrameLock) {
                if (mLatestAnnexB != null && mLatestAnnexBSeq > mLastSeenSeq) {
                    mLastSeenSeq = mLatestAnnexBSeq;
                    return mLatestAnnexB;
                }
                long deadline = System.currentTimeMillis() + 500;
                while (mH264Streaming && mLatestAnnexBSeq <= mLastSeenSeq) {
                    long remaining = deadline - System.currentTimeMillis();
                    if (remaining <= 0) break;
                    try {
                        mFrameLock.wait(remaining);
                    } catch (InterruptedException e) {
                        return null;
                    }
                }
                if (mLatestAnnexB != null && mLatestAnnexBSeq > mLastSeenSeq) {
                    mLastSeenSeq = mLatestAnnexBSeq;
                    return mLatestAnnexB;
                }
            }
            return null;
        }
    }
}
