package com.openlab.labos.camera.preview;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collections;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;

/**
 * Rolling encode/publish latency instrumentation for empirical tuning.
 *
 * Records per-stage samples and exposes p50/p95 for runtime sweeps via {@code /metrics}.
 */
public final class PreviewMetrics {

    public enum Stage {
        CAPTURE_TO_ENCODE("captureToEncode"),
        ENCODE_TO_PUBLISH("encodeToPublish"),
        DEVICE_FRAME_AGE("deviceFrameAge"),
        GLASS_TO_GLASS("glassToGlass");

        private final String id;

        Stage(String id) {
            this.id = id;
        }

        public String id() {
            return id;
        }
    }

    private static final int MAX_SAMPLES = 240;

    private long captureStartedAtMs;
    private long encodeStartedAtMs;
    private long encodeFinishedAtMs;
    private long publishFinishedAtMs;
    private long frameSeq;

    private long lastCaptureToEncodeMs = -1;
    private long lastEncodeToPublishMs = -1;
    private long lastGlassToGlassMs = -1;

    private boolean captureMarkedThisFrame;

    private final Map<Stage, ArrayDeque<Long>> stageSamples = new EnumMap<>(Stage.class);

    public PreviewMetrics() {
        for (Stage stage : Stage.values()) {
            stageSamples.put(stage, new ArrayDeque<>());
        }
    }

    public void markCaptureStarted() {
        captureMarkedThisFrame = true;
        captureStartedAtMs = System.currentTimeMillis();
        encodeStartedAtMs = 0;
    }

    public void markEncodeStarted() {
        encodeStartedAtMs = System.currentTimeMillis();
        // Hardware H.264 never calls markCaptureStarted(); bind capture to encode output.
        if (!captureMarkedThisFrame) {
            captureStartedAtMs = encodeStartedAtMs;
        }
        captureMarkedThisFrame = false;
    }

    public void markEncodeFinished() {
        encodeFinishedAtMs = System.currentTimeMillis();
        if (captureStartedAtMs > 0) {
            lastCaptureToEncodeMs = Math.max(0, encodeFinishedAtMs - captureStartedAtMs);
            recordStage(Stage.CAPTURE_TO_ENCODE, lastCaptureToEncodeMs);
        } else if (encodeStartedAtMs > 0) {
            lastCaptureToEncodeMs = Math.max(0, encodeFinishedAtMs - encodeStartedAtMs);
            recordStage(Stage.CAPTURE_TO_ENCODE, lastCaptureToEncodeMs);
        }
    }

    public void markPublishFinished() {
        publishFinishedAtMs = System.currentTimeMillis();
        frameSeq++;
        if (encodeFinishedAtMs > 0) {
            lastEncodeToPublishMs = Math.max(0, publishFinishedAtMs - encodeFinishedAtMs);
            recordStage(Stage.ENCODE_TO_PUBLISH, lastEncodeToPublishMs);
        }
        if (captureStartedAtMs > 0) {
            lastGlassToGlassMs = Math.max(0, publishFinishedAtMs - captureStartedAtMs);
            recordStage(Stage.GLASS_TO_GLASS, lastGlassToGlassMs);
        }
    }

    public long getFrameSeq() {
        return frameSeq;
    }

    public void reset() {
        captureStartedAtMs = 0;
        encodeStartedAtMs = 0;
        encodeFinishedAtMs = 0;
        publishFinishedAtMs = 0;
        captureMarkedThisFrame = false;
        lastCaptureToEncodeMs = -1;
        lastEncodeToPublishMs = -1;
        lastGlassToGlassMs = -1;
        for (Stage stage : Stage.values()) {
            stageSamples.get(stage).clear();
        }
    }

    public long getLastCaptureToEncodeMs() {
        return lastCaptureToEncodeMs;
    }

    public long getLastEncodeToPublishMs() {
        return lastEncodeToPublishMs;
    }

    public JSONObject snapshot(PreviewProtocolConfig config, boolean streaming, int frameCount, long lastFrameAtMs, long lastFrameBytes) {
        return snapshot(config, streaming, frameCount, lastFrameAtMs, lastFrameBytes, false, null);
    }

    public JSONObject snapshot(
            PreviewProtocolConfig config,
            boolean streaming,
            int frameCount,
            long lastFrameAtMs,
            long lastFrameBytes,
            boolean recording,
            JSONObject thermalGovernor) {
        long frameAge = lastFrameAtMs > 0 ? Math.max(0, System.currentTimeMillis() - lastFrameAtMs) : -1;
        if (frameAge >= 0) {
            recordStage(Stage.DEVICE_FRAME_AGE, frameAge);
        }

        JSONObject json = new JSONObject();
        try {
            json.put("ok", true);
            json.put("streaming", streaming);
            json.put("recording", recording);
            json.put("encodeMode", config.getEncodeMode());
            json.put("transport", config.getTransport());
            json.put("width", config.getWidth());
            json.put("height", config.getHeight());
            json.put("fps", config.getFps());
            json.put("frameCount", frameCount);
            json.put("frameSeq", frameSeq);
            json.put("frameBytes", lastFrameBytes > 0 ? lastFrameBytes : JSONObject.NULL);
            json.put("pixelRateMpixFps", (config.getWidth() * (long) config.getHeight() * config.getFps()) / 1_000_000f);
            json.put("lastCaptureToEncodeMs", nullable(lastCaptureToEncodeMs));
            json.put("lastEncodeToPublishMs", nullable(lastEncodeToPublishMs));
            json.put("lastPublishToClientMs", JSONObject.NULL);
            json.put("lastGlassToGlassMs", nullable(lastGlassToGlassMs));
            json.put("avgEncodeMs", stageAverage(Stage.CAPTURE_TO_ENCODE));
            json.put("p50EncodeMs", stagePercentile(Stage.CAPTURE_TO_ENCODE, 50));
            json.put("p95EncodeMs", stagePercentile(Stage.CAPTURE_TO_ENCODE, 95));
            json.put("avgTransportMs", stageAverage(Stage.ENCODE_TO_PUBLISH));
            json.put("p50TransportMs", stagePercentile(Stage.ENCODE_TO_PUBLISH, 50));
            json.put("p95TransportMs", stagePercentile(Stage.ENCODE_TO_PUBLISH, 95));
            json.put("avgDeviceFrameAgeMs", stageAverage(Stage.DEVICE_FRAME_AGE));
            json.put("p50DeviceFrameAgeMs", stagePercentile(Stage.DEVICE_FRAME_AGE, 50));
            json.put("p95DeviceFrameAgeMs", stagePercentile(Stage.DEVICE_FRAME_AGE, 95));
            json.put("streamFrameAgeMs", frameAge >= 0 ? frameAge : JSONObject.NULL);
            json.put("stages", buildStageArray());
            json.put("lastTrace", buildLastTrace(config, frameAge, lastFrameBytes));
            json.put("thermalGovernor", thermalGovernor != null ? thermalGovernor : JSONObject.NULL);
            json.put("updatedAtMs", System.currentTimeMillis());
        } catch (Exception ignored) {
        }
        return json;
    }

    private JSONObject buildLastTrace(PreviewProtocolConfig config, long frameAge, long lastFrameBytes) {
        JSONObject trace = new JSONObject();
        try {
            trace.put("frameSeq", frameSeq);
            trace.put("frameBytes", lastFrameBytes > 0 ? lastFrameBytes : JSONObject.NULL);
            trace.put("publishedAtMs", publishFinishedAtMs > 0 ? publishFinishedAtMs : JSONObject.NULL);
            trace.put("captureToEncodeMs", nullable(lastCaptureToEncodeMs));
            trace.put("encodeToPublishMs", nullable(lastEncodeToPublishMs));
            trace.put("deviceFrameAgeMs", frameAge >= 0 ? frameAge : JSONObject.NULL);
            trace.put("glassToGlassMs", nullable(lastGlassToGlassMs));
            trace.put("encodeMode", config.getEncodeMode());
            trace.put("transport", config.getTransport());
            trace.put("width", config.getWidth());
            trace.put("height", config.getHeight());
            trace.put("recordedAtMs", System.currentTimeMillis());
        } catch (Exception ignored) {
        }
        return trace;
    }

    private JSONArray buildStageArray() {
        JSONArray stages = new JSONArray();
        for (Stage stage : Stage.values()) {
            stages.put(buildStageStats(stage));
        }
        return stages;
    }

    private JSONObject buildStageStats(Stage stage) {
        ArrayDeque<Long> samples = stageSamples.get(stage);
        List<Long> sorted = new ArrayList<>(samples);
        Collections.sort(sorted);
        JSONObject json = new JSONObject();
        try {
            json.put("stage", stage.id());
            json.put("samples", sorted.size());
            json.put("lastMs", sorted.isEmpty() ? JSONObject.NULL : sorted.get(sorted.size() - 1));
            json.put("avgMs", stageAverage(stage));
            json.put("p50Ms", stagePercentile(stage, 50));
            json.put("p95Ms", stagePercentile(stage, 95));
            json.put("maxMs", sorted.isEmpty() ? JSONObject.NULL : sorted.get(sorted.size() - 1));
        } catch (Exception ignored) {
        }
        return json;
    }

    private void recordStage(Stage stage, long valueMs) {
        if (valueMs < 0) return;
        ArrayDeque<Long> samples = stageSamples.get(stage);
        samples.addLast(valueMs);
        while (samples.size() > MAX_SAMPLES) {
            samples.removeFirst();
        }
    }

    private Object stageAverage(Stage stage) {
        ArrayDeque<Long> samples = stageSamples.get(stage);
        if (samples.isEmpty()) return JSONObject.NULL;
        long total = 0;
        for (long sample : samples) total += sample;
        return total / samples.size();
    }

    private Object stagePercentile(Stage stage, int percentile) {
        ArrayDeque<Long> samples = stageSamples.get(stage);
        if (samples.isEmpty()) return JSONObject.NULL;
        List<Long> sorted = new ArrayList<>(samples);
        Collections.sort(sorted);
        int index = Math.min(sorted.size() - 1, Math.max(0, (int) Math.ceil((percentile / 100.0) * sorted.size()) - 1));
        return sorted.get(index);
    }

    private Object nullable(long value) {
        return value >= 0 ? value : JSONObject.NULL;
    }
}
