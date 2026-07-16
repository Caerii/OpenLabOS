package com.openlab.labos.camera;

import org.json.JSONObject;

/**
 * Camera configuration loaded from core service settings via AIDL.
 * Provides defaults that work on K900 hardware.
 *
 * Capture settings control photo/video quality.
 * Stream settings control the MJPEG preview sent to the dashboard.
 */
public class CameraConfig {

    // Capture settings (photos + video recording)
    private int videoWidth = 1280;
    private int videoHeight = 720;
    private int videoFps = 15;
    private int videoBitrate = 4_000_000;
    private int jpegQuality = 95;
    private int cameraKeepAliveMs = 30000;

    // Stream settings (MJPEG preview to dashboard)
    private int streamWidth = 480;
    private int streamHeight = 360;
    private int streamJpegQuality = 45;
    private int streamFps = 6;

    public int getVideoWidth() { return videoWidth; }
    public int getVideoHeight() { return videoHeight; }
    public int getVideoFps() { return videoFps; }
    public int getVideoBitrate() { return videoBitrate; }
    public int getJpegQuality() { return jpegQuality; }
    public int getCameraKeepAliveMs() { return cameraKeepAliveMs; }

    public int getStreamWidth() { return streamWidth; }
    public int getStreamHeight() { return streamHeight; }
    public int getStreamJpegQuality() { return streamJpegQuality; }
    public int getStreamFps() { return streamFps; }
    public long getStreamFrameIntervalMs() { return 1000L / streamFps; }

    /**
     * Update config from settings JSON fetched from core service.
     */
    public void updateFromJson(JSONObject json) {
        if (json == null) return;
        videoWidth = json.optInt("video_width", videoWidth);
        videoHeight = json.optInt("video_height", videoHeight);
        videoFps = json.optInt("video_fps", videoFps);
        videoBitrate = json.optInt("video_bitrate", videoBitrate);
        jpegQuality = json.optInt("jpeg_quality", jpegQuality);
        cameraKeepAliveMs = json.optInt("camera_keep_alive_ms", cameraKeepAliveMs);

        streamWidth = json.optInt("stream_width", streamWidth);
        streamHeight = json.optInt("stream_height", streamHeight);
        streamJpegQuality = json.optInt("stream_jpeg_quality", streamJpegQuality);
        streamFps = json.optInt("stream_fps", streamFps);
    }

    public void applyProtocolConfig(org.json.JSONObject json, com.openlab.labos.camera.preview.PreviewProtocolConfig protocolConfig) {
        updateFromJson(json);
        if (protocolConfig != null && json != null) {
            protocolConfig.updateFromJson(json);
        }
    }

    /** Apply protocol stream dimensions onto camera stream settings before capture starts. */
    public void applyStreamFromProtocol(com.openlab.labos.camera.preview.PreviewProtocolConfig protocolConfig) {
        if (protocolConfig == null) return;
        streamWidth = protocolConfig.getWidth();
        streamHeight = protocolConfig.getHeight();
        streamFps = protocolConfig.getFps();
        streamJpegQuality = protocolConfig.getJpegQuality();
    }
}
