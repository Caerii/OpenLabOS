package com.openlab.labos.dashboard.routes;

import android.util.Log;

import com.openlab.labos.core.ILabOsCallback;
import com.openlab.labos.core.ILabOsCore;
import com.openlab.labos.core.McuEvent;
import com.openlab.labos.dashboard.DashboardRouter;
import com.openlab.labos.dashboard.DashboardService;

import org.json.JSONObject;

import java.io.IOException;
import java.util.Locale;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;

import fi.iki.elonen.NanoHTTPD;
import fi.iki.elonen.NanoHTTPD.IHTTPSession;
import fi.iki.elonen.NanoHTTPD.Method;
import fi.iki.elonen.NanoHTTPD.Response;

/**
 * GET /api/events — Server-Sent Events stream of real-time device events.
 *
 * Events pushed:
 *   - connection: {"connected": true/false}
 *   - button: {"buttonId": "...", "longPress": true/false}
 *   - battery: {"percent": N, "voltage": N}
 *   - imu: {"accel": [...], "gyro": [...]}
 *   - gesture: {"gesture": "..."}
 *   - mcu: {"type": "...", "data": "..."}
 *
 * Usage in browser:
 *   const es = new EventSource("/api/events?token=xxx");
 *   es.addEventListener("battery", e => console.log(JSON.parse(e.data)));
 */
public class EventStreamHandler {

    private static final String TAG = "LabOS.EventStream";
    private final DashboardService mService;

    public EventStreamHandler(DashboardService service) {
        mService = service;
    }

    public Response handle(Method method, IHTTPSession session) {
        if (method != Method.GET) {
            return DashboardRouter.jsonError(400, "GET only");
        }

        // Create a blocking queue for this SSE connection
        LinkedBlockingQueue<String> eventQueue = new LinkedBlockingQueue<>(1000);

        // Register a temporary AIDL callback to push events into the queue
        ILabOsCallback callback = new ILabOsCallback.Stub() {
            @Override
            public void onConnectionStateChanged(boolean connected) {
                enqueue(eventQueue, "connection",
                        "{\"connected\":" + connected + "}");
            }

            @Override
            public void onButtonPress(String buttonId, boolean isLongPress) {
                enqueue(eventQueue, "button",
                        "{\"buttonId\":\"" + DashboardRouter.escapeJson(buttonId) +
                        "\",\"longPress\":" + isLongPress + "}");
            }

            @Override
            public void onBatteryUpdate(int percentage, int voltage) {
                enqueue(eventQueue, "battery",
                        "{\"percent\":" + percentage + ",\"voltage\":" + voltage + "}");
            }

            @Override
            public void onImuData(float[] accel, float[] gyro) {
                enqueue(eventQueue, "imu", String.format(Locale.US,
                        "{\"accel\":[%.3f,%.3f,%.3f],\"gyro\":[%.3f,%.3f,%.3f]}",
                        accel[0], accel[1], accel[2], gyro[0], gyro[1], gyro[2]));
            }

            @Override
            public void onGesture(String gesture) {
                enqueue(eventQueue, "gesture",
                        "{\"gesture\":\"" + DashboardRouter.escapeJson(gesture) + "\"}");
            }

            @Override
            public void onMcuEvent(McuEvent event) {
                enqueue(eventQueue, "mcu",
                        "{\"type\":\"" + DashboardRouter.escapeJson(event.getType()) +
                        "\",\"data\":\"" + DashboardRouter.escapeJson(event.getJsonData()) + "\"}");
            }
        };

        // Register with core service
        ILabOsCore core = mService.getCoreService();
        if (core != null) {
            try {
                core.registerCallback(callback);
            } catch (Exception e) {
                Log.w(TAG, "Failed to register SSE callback", e);
            }
        }

        // Send initial status event
        enqueue(eventQueue, "status",
                "{\"mcuConnected\":" + mService.isMcuConnected() +
                ",\"batteryPercent\":" + mService.getBatteryPercent() +
                ",\"batteryVoltage\":" + mService.getBatteryVoltage() + "}");

        // Create an InputStream that drains the queue as SSE format
        java.io.InputStream sseStream = new java.io.InputStream() {
            private byte[] buffer = null;
            private int pos = 0;
            private volatile boolean closed = false;

            @Override
            public int read() throws IOException {
                byte[] b = new byte[1];
                int r = read(b, 0, 1);
                return r == -1 ? -1 : (b[0] & 0xFF);
            }

            @Override
            public int read(byte[] b, int off, int len) throws IOException {
                if (closed) return -1;

                if (buffer == null || pos >= buffer.length) {
                    try {
                        String event = eventQueue.poll(30, TimeUnit.SECONDS);
                        if (event == null) {
                            // Send keepalive comment
                            buffer = ": keepalive\n\n".getBytes();
                        } else {
                            buffer = event.getBytes();
                        }
                        pos = 0;
                    } catch (InterruptedException e) {
                        closed = true;
                        return -1;
                    }
                }

                int available = buffer.length - pos;
                int toRead = Math.min(len, available);
                System.arraycopy(buffer, pos, b, off, toRead);
                pos += toRead;
                return toRead;
            }

            @Override
            public void close() throws IOException {
                closed = true;
                // Unregister callback
                if (core != null) {
                    try {
                        core.unregisterCallback(callback);
                    } catch (Exception ignored) {}
                }
            }
        };

        Response response = NanoHTTPD.newChunkedResponse(
                Response.Status.OK, "text/event-stream", sseStream);
        response.addHeader("Cache-Control", "no-cache");
        response.addHeader("Connection", "keep-alive");
        return response;
    }

    private void enqueue(LinkedBlockingQueue<String> queue, String event, String data) {
        String sseMessage = "event: " + event + "\ndata: " + data + "\n\n";
        queue.offer(sseMessage); // Non-blocking, drops if full
    }
}
