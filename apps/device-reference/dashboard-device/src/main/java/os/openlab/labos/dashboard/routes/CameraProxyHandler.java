package com.openlab.labos.dashboard.routes;

import android.util.Log;

import com.openlab.labos.dashboard.DashboardRouter;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

import fi.iki.elonen.NanoHTTPD;
import fi.iki.elonen.NanoHTTPD.IHTTPSession;
import fi.iki.elonen.NanoHTTPD.Method;
import fi.iki.elonen.NanoHTTPD.Response;

/**
 * Proxy to camera module's PreviewServer running on port 8089.
 *
 * GET  /api/preview/stream       — Proxy MJPEG stream.
 * GET  /api/preview/stream/avc   — Proxy H.264 Annex-B stream.
 * GET  /api/preview/frame        — Proxy single JPEG frame.
 * GET  /api/preview/health       — Proxy health check.
 * GET  /api/preview/config       — Proxy preview protocol config.
 * PUT  /api/preview/config       — Update preview protocol config on device.
 * GET  /api/preview/metrics      — Proxy encode/publish metrics.
 * POST /api/camera/start     — Send start-preview broadcast to camera module.
 * POST /api/camera/stop      — Send stop-preview broadcast to camera module.
 * POST /api/camera/photo     — Send take-photo broadcast to camera module.
 * POST /api/camera/video     — Send toggle-video broadcast to camera module.
 * POST /api/camera/video/start — Start native video recording.
 * POST /api/camera/video/stop  — Stop native video recording.
 */
public class CameraProxyHandler {

    private static final String TAG = "LabOS.CameraProxy";
    private static final String CAMERA_HOST = "127.0.0.1";
    private static final int CAMERA_PORT = 8089;

    public Response handle(String uri, Method method, IHTTPSession session) {
        try {
            // Camera control commands (send broadcasts)
            if (uri.equals("/api/camera/start") && method == Method.POST) {
                return sendCameraBroadcast("com.openlab.labos.camera.ACTION_START_PREVIEW");
            }
            if (uri.equals("/api/camera/stop") && method == Method.POST) {
                return sendCameraBroadcast("com.openlab.labos.camera.ACTION_STOP_PREVIEW");
            }
            if (uri.equals("/api/camera/photo") && method == Method.POST) {
                return sendCameraBroadcast("com.openlab.labos.camera.ACTION_TAKE_PHOTO");
            }
            if (uri.equals("/api/camera/video") && method == Method.POST) {
                return sendCameraBroadcast("com.openlab.labos.camera.ACTION_TOGGLE_VIDEO");
            }
            if (uri.equals("/api/camera/video/start") && method == Method.POST) {
                return sendCameraBroadcast("com.openlab.labos.camera.ACTION_START_VIDEO");
            }
            if (uri.equals("/api/camera/video/stop") && method == Method.POST) {
                return sendCameraBroadcast("com.openlab.labos.camera.ACTION_STOP_VIDEO");
            }

            // Preview proxy (forward to camera module's NanoHTTPD)
            if (uri.equals("/api/preview/stream")) {
                return proxyMjpegStream();
            }
            if (uri.equals("/api/preview/stream/avc")) {
                return proxyBinaryStream("/stream/avc", "video/h264");
            }
            if (uri.equals("/api/preview/frame")) {
                return proxyFrame();
            }
            if (uri.equals("/api/preview/health")) {
                return proxyJson("/health");
            }
            if (uri.equals("/api/preview/config")) {
                if (method == Method.PUT) {
                    return proxyConfigPut(session);
                }
                return proxyJson("/config");
            }
            if (uri.equals("/api/preview/metrics")) {
                return proxyJson("/metrics");
            }

            return DashboardRouter.jsonError(404, "Unknown camera endpoint: " + uri);
        } catch (Exception e) {
            return DashboardRouter.jsonError(500, e.getMessage());
        }
    }

    private Response sendCameraBroadcast(String action) {
        // Execute am broadcast via shell since we're in a different process.
        // Use explicit component — implicit package broadcasts don't wake a force-stopped app.
        try {
            String[] cmd = {"am", "broadcast", "-a", action,
                    "-n", "com.openlab.labos.camera/.CameraCommandReceiver"};
            Runtime.getRuntime().exec(cmd);
            return DashboardRouter.jsonOk("{\"success\":true,\"action\":\"" +
                    DashboardRouter.escapeJson(action) + "\"}");
        } catch (Exception e) {
            return DashboardRouter.jsonError(500, "Broadcast failed: " + e.getMessage());
        }
    }

    private Response proxyMjpegStream() {
        return proxyBinaryStream("/stream", "multipart/x-mixed-replace; boundary=labos-frame-boundary");
    }

    private Response proxyBinaryStream(String path, String fallbackContentType) {
        try {
            URL url = new URL("http://" + CAMERA_HOST + ":" + CAMERA_PORT + path);
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("GET");
            conn.setConnectTimeout(3000);
            conn.setReadTimeout(0);

            InputStream is = conn.getInputStream();
            String contentType = conn.getContentType();
            if (contentType == null) {
                contentType = fallbackContentType;
            }

            Response response = NanoHTTPD.newChunkedResponse(Response.Status.OK, contentType, is);
            response.addHeader("Cache-Control", "no-cache, no-store, must-revalidate");
            response.addHeader("Connection", "keep-alive");
            return response;
        } catch (Exception e) {
            Log.w(TAG, "Stream proxy failed (" + path + "): " + e.getMessage());
            return DashboardRouter.jsonError(502, "Camera preview not available: " + e.getMessage());
        }
    }

    private Response proxyConfigPut(IHTTPSession session) {
        try {
            URL url = new URL("http://" + CAMERA_HOST + ":" + CAMERA_PORT + "/config");
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("PUT");
            conn.setConnectTimeout(2000);
            conn.setReadTimeout(2000);
            conn.setDoOutput(true);
            String contentType = session.getHeaders().get("content-type");
            if (contentType != null) {
                conn.setRequestProperty("Content-Type", contentType);
            }
            byte[] body = readRequestBody(session);
            if (body.length > 0) {
                conn.getOutputStream().write(body);
            }
            int code = conn.getResponseCode();
            InputStream is = code >= 400 ? conn.getErrorStream() : conn.getInputStream();
            byte[] data = is != null ? readAll(is) : new byte[0];
            if (is != null) is.close();
            Response.Status status = code == 200 ? Response.Status.OK : Response.Status.lookup(code);
            if (status == null) status = Response.Status.INTERNAL_ERROR;
            return NanoHTTPD.newFixedLengthResponse(status, "application/json",
                    new java.io.ByteArrayInputStream(data), data.length);
        } catch (Exception e) {
            return DashboardRouter.jsonError(502, "Config update failed: " + e.getMessage());
        }
    }

    private byte[] readRequestBody(IHTTPSession session) throws Exception {
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

    private Response proxyFrame() {
        try {
            URL url = new URL("http://" + CAMERA_HOST + ":" + CAMERA_PORT + "/frame");
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("GET");
            conn.setConnectTimeout(2000);
            conn.setReadTimeout(2000);

            if (conn.getResponseCode() != 200) {
                return DashboardRouter.jsonError(503, "No frame available");
            }

            InputStream is = conn.getInputStream();
            byte[] data = readAll(is);
            is.close();

            return NanoHTTPD.newFixedLengthResponse(Response.Status.OK, "image/jpeg",
                    new java.io.ByteArrayInputStream(data), data.length);
        } catch (Exception e) {
            return DashboardRouter.jsonError(502, "Frame fetch failed: " + e.getMessage());
        }
    }

    private Response proxyJson(String path) {
        try {
            URL url = new URL("http://" + CAMERA_HOST + ":" + CAMERA_PORT + path);
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("GET");
            conn.setConnectTimeout(2000);
            conn.setReadTimeout(2000);

            InputStream is = conn.getInputStream();
            byte[] data = readAll(is);
            is.close();

            return DashboardRouter.jsonOk(new String(data));
        } catch (Exception e) {
            return DashboardRouter.jsonOk("{\"ok\":false,\"fps\":0,\"frameCount\":0,\"streaming\":false}");
        }
    }

    private byte[] readAll(InputStream is) throws Exception {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        byte[] buf = new byte[4096];
        int n;
        while ((n = is.read(buf)) != -1) {
            baos.write(buf, 0, n);
        }
        return baos.toByteArray();
    }
}
