package com.openlab.labos.camera.preview;

import org.json.JSONObject;

/**
 * Configurable OpenLabOS preview protocol settings.
 *
 * Mirrors {@code @openlabos/preview} TypeScript schema so host, device, and web
 * can negotiate encode mode and transport without forking the wire format.
 */
public final class PreviewProtocolConfig {

    public static final String ENCODE_SOFTWARE_JPEG = "software-jpeg";
    public static final String ENCODE_LIBJPEG_TURBO = "libjpeg-turbo";
    public static final String ENCODE_HARDWARE_H264 = "hardware-h264";

    public static final String TRANSPORT_MJPEG_HTTP = "mjpeg-http";
    public static final String TRANSPORT_H264_ANNEXB_HTTP = "h264-annexb-http";
    public static final String TRANSPORT_H264_FMP4_HTTP = "h264-fmp4-http";
    public static final String TRANSPORT_FRAME_POLL_HTTP = "frame-poll-http";
    public static final String TRANSPORT_WEBRTC = "webrtc";

    private String encodeMode = ENCODE_SOFTWARE_JPEG;
    private String transport = TRANSPORT_MJPEG_HTTP;
    private int width = 480;
    private int height = 360;
    private int fps = 6;
    private int jpegQuality = 45;
    private int h264Bitrate = 2_000_000;
    private float h264KeyframeIntervalSec = 1f;
    private boolean lowLatency = true;
    private boolean instrumentMetrics = true;
    private boolean enabled = true;

    public static PreviewProtocolConfig balancedDefaults() {
        return new PreviewProtocolConfig();
    }

    public static PreviewProtocolConfig lowLatencyProfile() {
        PreviewProtocolConfig config = new PreviewProtocolConfig();
        config.encodeMode = ENCODE_HARDWARE_H264;
        config.transport = TRANSPORT_H264_ANNEXB_HTTP;
        config.width = 1280;
        config.height = 720;
        config.fps = 30;
        config.h264Bitrate = 2_000_000;
        config.h264KeyframeIntervalSec = 1f;
        config.lowLatency = true;
        return config;
    }

    public void updateFromJson(JSONObject json) {
        if (json == null) return;
        if (json.has("encodeMode")) encodeMode = json.optString("encodeMode", encodeMode);
        if (json.has("transport")) transport = json.optString("transport", transport);
        width = clamp(json.optInt("width", width), 240, 1280);
        height = clamp(json.optInt("height", height), 180, 720);
        fps = clamp(json.optInt("fps", fps), 1, 60);
        jpegQuality = clamp(json.optInt("jpegQuality", jpegQuality), 20, 95);
        if (json.has("stream_jpeg_quality")) {
            jpegQuality = clamp(json.optInt("stream_jpeg_quality", jpegQuality), 20, 95);
        }
        if (json.has("stream_width")) width = clamp(json.optInt("stream_width", width), 240, 1280);
        if (json.has("stream_height")) height = clamp(json.optInt("stream_height", height), 180, 720);
        if (json.has("stream_fps")) fps = clamp(json.optInt("stream_fps", fps), 1, 60);
        h264Bitrate = clamp(json.optInt("h264Bitrate", h264Bitrate), 500_000, 20_000_000);
        h264KeyframeIntervalSec = (float) json.optDouble("h264KeyframeIntervalSec", h264KeyframeIntervalSec);
        lowLatency = json.optBoolean("lowLatency", lowLatency);
        instrumentMetrics = json.optBoolean("instrumentMetrics", instrumentMetrics);
        enabled = json.optBoolean("enabled", enabled);
        normalizeCompatibility();
    }

    public void normalizeCompatibility() {
        if (ENCODE_HARDWARE_H264.equals(encodeMode)) {
            if (TRANSPORT_MJPEG_HTTP.equals(transport) || TRANSPORT_FRAME_POLL_HTTP.equals(transport)) {
                transport = TRANSPORT_H264_ANNEXB_HTTP;
            }
        } else if (TRANSPORT_H264_ANNEXB_HTTP.equals(transport)
                || TRANSPORT_H264_FMP4_HTTP.equals(transport)
                || TRANSPORT_WEBRTC.equals(transport)) {
            transport = TRANSPORT_MJPEG_HTTP;
        }
    }

    public JSONObject toJson() {
        JSONObject json = new JSONObject();
        try {
            json.put("encodeMode", encodeMode);
            json.put("transport", transport);
            json.put("width", width);
            json.put("height", height);
            json.put("fps", fps);
            json.put("jpegQuality", jpegQuality);
            json.put("h264Bitrate", h264Bitrate);
            json.put("h264KeyframeIntervalSec", h264KeyframeIntervalSec);
            json.put("lowLatency", lowLatency);
            json.put("instrumentMetrics", instrumentMetrics);
            json.put("enabled", enabled);
        } catch (Exception ignored) {
        }
        return json;
    }

    public String getEncodeMode() { return encodeMode; }
    public String getTransport() { return transport; }
    public int getWidth() { return width; }
    public int getHeight() { return height; }
    public int getFps() { return fps; }
    public int getJpegQuality() { return jpegQuality; }
    public int getH264Bitrate() { return h264Bitrate; }
    public float getH264KeyframeIntervalSec() { return h264KeyframeIntervalSec; }
    public boolean isLowLatency() { return lowLatency; }
    public boolean isInstrumentMetrics() { return instrumentMetrics; }
    public boolean isEnabled() { return enabled; }
    public long getStreamFrameIntervalMs() { return Math.max(1, 1000L / Math.max(1, fps)); }
    public boolean usesHardwareH264() { return ENCODE_HARDWARE_H264.equals(encodeMode); }

    private static int clamp(int value, int min, int max) {
        return Math.max(min, Math.min(max, value));
    }
}
