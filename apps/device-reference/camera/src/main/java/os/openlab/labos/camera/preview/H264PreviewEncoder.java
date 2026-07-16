package com.openlab.labos.camera.preview;

import android.media.MediaCodec;
import android.media.MediaCodecInfo;
import android.media.MediaFormat;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.view.Surface;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.util.ArrayList;
import java.util.List;

/**
 * Hardware H.264 encoder for low-latency preview transport.
 *
 * Exposes a Camera2 input {@link Surface} and Annex-B NAL units suitable for
 * {@code /stream/avc} when enabled by {@link PreviewProtocolConfig}.
 */
public final class H264PreviewEncoder {

    public interface Listener {
        void onAnnexBFrame(byte[] data, long presentationTimeUs, boolean keyFrame);
        void onError(String message);
    }

    private static final String TAG = "LabOS.H264Preview";
    private static final String MIME = MediaFormat.MIMETYPE_VIDEO_AVC;
    /** Drain poll — keep low for glass-to-glass, avoid busy-spin. */
    private static final int DRAIN_TIMEOUT_US = 2_000;

    private final PreviewProtocolConfig mConfig;
    private final PreviewMetrics mMetrics;
    private MediaCodec mCodec;
    private Surface mInputSurface;
    private Listener mListener;
    private Thread mDrainThread;
    private volatile boolean mRunning;

    public H264PreviewEncoder(PreviewProtocolConfig config, PreviewMetrics metrics) {
        mConfig = config;
        mMetrics = metrics;
    }

    public void setListener(Listener listener) {
        mListener = listener;
    }

    public Surface getInputSurface() {
        return mInputSurface;
    }

    public boolean start() {
        stop();
        try {
            MediaFormat format = MediaFormat.createVideoFormat(
                    MIME, mConfig.getWidth(), mConfig.getHeight());
            format.setInteger(MediaFormat.KEY_COLOR_FORMAT,
                    MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface);
            format.setInteger(MediaFormat.KEY_BIT_RATE, mConfig.getH264Bitrate());
            format.setInteger(MediaFormat.KEY_FRAME_RATE, mConfig.getFps());
            format.setFloat(MediaFormat.KEY_I_FRAME_INTERVAL,
                    Math.max(0.1f, mConfig.getH264KeyframeIntervalSec()));
            format.setInteger(MediaFormat.KEY_BITRATE_MODE,
                    MediaCodecInfo.EncoderCapabilities.BITRATE_MODE_CBR);
            format.setInteger(MediaFormat.KEY_OPERATING_RATE, mConfig.getFps());

            if (mConfig.isLowLatency()) {
                format.setInteger(MediaFormat.KEY_LATENCY, 1);
                format.setInteger(MediaFormat.KEY_PRIORITY, 0);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    format.setInteger(MediaFormat.KEY_MAX_B_FRAMES, 0);
                }
            }

            mCodec = MediaCodec.createEncoderByType(MIME);
            mCodec.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE);
            mInputSurface = mCodec.createInputSurface();
            mCodec.start();
            requestSyncFrame();
            mRunning = true;
            mDrainThread = new Thread(this::drainLoop, "LabOS-H264Drain");
            mDrainThread.setPriority(Thread.MAX_PRIORITY - 2);
            mDrainThread.start();
            Log.i(TAG, "Hardware H.264 encoder started "
                    + mConfig.getWidth() + "x" + mConfig.getHeight()
                    + " @" + mConfig.getFps() + "fps"
                    + " gop=" + mConfig.getH264KeyframeIntervalSec() + "s"
                    + " bitrate=" + mConfig.getH264Bitrate());
            return true;
        } catch (IOException | IllegalStateException e) {
            Log.e(TAG, "Failed to start H.264 encoder", e);
            notifyError(e.getMessage());
            stop();
            return false;
        }
    }

    private void requestSyncFrame() {
        if (mCodec == null) return;
        try {
            Bundle params = new Bundle();
            params.putInt(MediaCodec.PARAMETER_KEY_REQUEST_SYNC_FRAME, 0);
            mCodec.setParameters(params);
        } catch (Exception ignored) {
        }
    }

    public void stop() {
        mRunning = false;
        if (mDrainThread != null) {
            try {
                mDrainThread.join(500);
            } catch (InterruptedException ignored) {
                Thread.currentThread().interrupt();
            }
            mDrainThread = null;
        }
        if (mCodec != null) {
            try {
                mCodec.stop();
            } catch (Exception ignored) {
            }
            try {
                mCodec.release();
            } catch (Exception ignored) {
            }
            mCodec = null;
        }
        if (mInputSurface != null) {
            mInputSurface.release();
            mInputSurface = null;
        }
    }

    private void drainLoop() {
        MediaCodec.BufferInfo info = new MediaCodec.BufferInfo();
        while (mRunning && mCodec != null) {
            try {
                int index = mCodec.dequeueOutputBuffer(info, DRAIN_TIMEOUT_US);
                if (index == MediaCodec.INFO_TRY_AGAIN_LATER) continue;
                if (index == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) continue;
                if (index < 0) continue;

                ByteBuffer buffer = mCodec.getOutputBuffer(index);
                if (buffer != null && info.size > 0) {
                    mMetrics.markEncodeStarted();
                    byte[] annexB = toAnnexB(buffer, info);
                    if (annexB.length > 0 && mListener != null) {
                        mMetrics.markEncodeFinished();
                        mListener.onAnnexBFrame(
                                annexB,
                                info.presentationTimeUs,
                                (info.flags & MediaCodec.BUFFER_FLAG_KEY_FRAME) != 0);
                    }
                }
                mCodec.releaseOutputBuffer(index, false);
                if ((info.flags & MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) break;
            } catch (Exception e) {
                notifyError(e.getMessage());
                break;
            }
        }
    }

    private byte[] toAnnexB(ByteBuffer buffer, MediaCodec.BufferInfo info) {
        buffer.position(info.offset);
        buffer.limit(info.offset + info.size);
        byte[] raw = new byte[info.size];
        buffer.get(raw);
        if (raw.length >= 4 && raw[0] == 0 && raw[1] == 0) {
            return raw;
        }
        List<byte[]> nalUnits = new ArrayList<>();
        int offset = 0;
        while (offset + 4 <= raw.length) {
            int length = ((raw[offset] & 0xff) << 24)
                    | ((raw[offset + 1] & 0xff) << 16)
                    | ((raw[offset + 2] & 0xff) << 8)
                    | (raw[offset + 3] & 0xff);
            offset += 4;
            if (length <= 0 || offset + length > raw.length) break;
            byte[] nal = new byte[4 + length];
            nal[0] = 0;
            nal[1] = 0;
            nal[2] = 0;
            nal[3] = 1;
            System.arraycopy(raw, offset, nal, 4, length);
            nalUnits.add(nal);
            offset += length;
        }
        if (nalUnits.isEmpty()) return raw;
        int total = 0;
        for (byte[] nal : nalUnits) total += nal.length;
        byte[] out = new byte[total];
        int pos = 0;
        for (byte[] nal : nalUnits) {
            System.arraycopy(nal, 0, out, pos, nal.length);
            pos += nal.length;
        }
        return out;
    }

    private void notifyError(String message) {
        if (mListener != null) mListener.onError(message == null ? "unknown" : message);
    }
}
