package com.openlab.labos.dashboard;

import android.util.Log;

import com.openlab.labos.dashboard.routes.*;

import org.json.JSONObject;

import java.io.IOException;
import java.util.HashMap;
import java.util.Map;

import fi.iki.elonen.NanoHTTPD;

/**
 * HTTP server running on the glasses (port 8080).
 *
 * Provides a full REST API that replaces ADB broadcast + file-read IPC:
 *
 *   /api/status              — device status, battery, MCU connection
 *   /api/settings            — get/update LabOS settings
 *   /api/mcu/command         — send raw MCU commands
 *   /api/mcu/console         — SSE stream of MCU command/response log
 *   /api/camera/*            — proxy to camera module preview server
 *   /api/battery/history     — battery log CSV
 *   /api/audio/*             — play sounds, test mic/VAD
 *   /api/wifi/*              — scan, connect, disconnect, status
 *   /api/system/*            — reboot, device info
 *
 * Dev panel endpoints (full ADB-level access over WiFi):
 *   /api/dev/shell           — execute shell commands
 *   /api/dev/logcat          — stream logcat via SSE
 *   /api/dev/files/*         — browse, read, write, delete files
 *   /api/dev/packages        — list/install/uninstall APKs
 *   /api/dev/props           — system properties
 */
public class DashboardRouter extends NanoHTTPD {

    private static final String TAG = "LabOS.Dashboard";
    private static final int PORT = 8080;

    private final DashboardService mService;
    private final ApiAuth mAuth;
    private StatusHandler mStatusHandler;
    private SettingsHandler mSettingsHandler;
    private McuHandler mMcuHandler;
    private CameraProxyHandler mCameraProxyHandler;
    private AudioHandler mAudioHandler;
    private BatteryHandler mBatteryHandler;
    private SystemHandler mSystemHandler;
    private DevShellHandler mDevShellHandler;
    private DevLogcatHandler mDevLogcatHandler;
    private DevFilesHandler mDevFilesHandler;
    private DevPackagesHandler mDevPackagesHandler;
    private EventStreamHandler mEventStreamHandler;
    private LiveCoachAudioHandler mLiveCoachAudioHandler;

    public DashboardRouter(DashboardService service) {
        super(PORT);
        mService = service;
        mAuth = new ApiAuth(service);

        mStatusHandler = new StatusHandler(service);
        mSettingsHandler = new SettingsHandler(service);
        mMcuHandler = new McuHandler(service);
        mCameraProxyHandler = new CameraProxyHandler();
        mAudioHandler = new AudioHandler(service);
        mBatteryHandler = new BatteryHandler();
        mSystemHandler = new SystemHandler(service);
        mDevShellHandler = new DevShellHandler();
        mDevLogcatHandler = new DevLogcatHandler();
        mDevFilesHandler = new DevFilesHandler();
        mDevPackagesHandler = new DevPackagesHandler();
        mEventStreamHandler = new EventStreamHandler(service);
        mLiveCoachAudioHandler = new LiveCoachAudioHandler(service);
    }

    public void startServer() {
        try {
            start(NanoHTTPD.SOCKET_READ_TIMEOUT, false);
            Log.i(TAG, "Dashboard server started on port " + PORT);
        } catch (IOException e) {
            Log.e(TAG, "Failed to start dashboard server", e);
        }
    }

    public void stopServer() {
        stop();
        Log.i(TAG, "Dashboard server stopped");
    }

    @Override
    public Response serve(IHTTPSession session) {
        String uri = session.getUri();
        Method method = session.getMethod();

        // CORS preflight
        if (Method.OPTIONS.equals(method)) {
            Response r = newFixedLengthResponse(Response.Status.OK, "text/plain", "");
            addCorsHeaders(r);
            return r;
        }

        // Auth check (exempt: /, /health, local-only /api/auth/token, OPTIONS)
        if (!mAuth.isExempt(uri, method.name(), session.getRemoteIpAddress())) {
            String token = session.getHeaders().get(mAuth.getHeaderName().toLowerCase());
            // Also check query param for browser convenience
            if (token == null) token = session.getParms().get("token");
            if (!mAuth.isAuthenticated(token)) {
                Response r = jsonError(401, "Unauthorized — include X-LabOS-Token header");
                addCorsHeaders(r);
                return r;
            }
        }

        Response response;
        try {
            response = route(uri, method, session);
        } catch (Exception e) {
            Log.e(TAG, "Error handling " + uri, e);
            response = jsonError(500, e.getMessage());
        }

        addCorsHeaders(response);
        return response;
    }

    private Response route(String uri, Method method, IHTTPSession session) {
        // ── Standard API ────────────────────────────
        if (uri.equals("/api/status")) {
            return mStatusHandler.handle(method, session);
        }
        if (uri.startsWith("/api/settings")) {
            return mSettingsHandler.handle(method, session);
        }
        if (uri.startsWith("/api/mcu")) {
            return mMcuHandler.handle(uri, method, session);
        }
        if (uri.startsWith("/api/camera") || uri.startsWith("/api/preview")) {
            return mCameraProxyHandler.handle(uri, method, session);
        }
        if (uri.startsWith("/api/audio")) {
            return mAudioHandler.handle(uri, method, session);
        }
        if (uri.startsWith("/api/live-coach/audio")) {
            return mLiveCoachAudioHandler.handle(uri, method, session);
        }
        if (uri.startsWith("/api/battery")) {
            return mBatteryHandler.handle(uri, method, session);
        }
        if (uri.startsWith("/api/wifi")) {
            return mSystemHandler.handleWifi(uri, method, session);
        }
        if (uri.startsWith("/api/system")) {
            return mSystemHandler.handle(uri, method, session);
        }

        // ── Real-time events ─────────────────────────
        if (uri.equals("/api/events")) {
            return mEventStreamHandler.handle(method, session);
        }

        // ── Dev panel ───────────────────────────────
        if (uri.startsWith("/api/dev/shell")) {
            return mDevShellHandler.handle(method, session);
        }
        if (uri.startsWith("/api/dev/logcat")) {
            return mDevLogcatHandler.handle(method, session);
        }
        if (uri.startsWith("/api/dev/files")) {
            return mDevFilesHandler.handle(uri, method, session);
        }
        if (uri.startsWith("/api/dev/packages")) {
            return mDevPackagesHandler.handle(uri, method, session);
        }
        if (uri.equals("/api/dev/props")) {
            return mDevShellHandler.handleProps(session);
        }
        if (uri.startsWith("/api/dev/crashes")) {
            return handleCrashes(uri, method, session);
        }

        // ── Auth ─────────────────────────────────────
        if (uri.equals("/api/auth/token")) {
            return jsonOk("{\"token\":\"" + mAuth.getToken() + "\"}");
        }
        if (uri.equals("/api/auth/regenerate") && method == Method.POST) {
            String newToken = mAuth.regenerateToken(mService);
            return jsonOk("{\"token\":\"" + newToken + "\"}");
        }

        // ── Health / root ───────────────────────────
        if (uri.equals("/") || uri.equals("/health")) {
            return jsonOk("{\"ok\":true,\"service\":\"openlabos-device-dashboard\",\"version\":\"" +
                    mService.getVersionName() + "\"}");
        }

        return jsonError(404, "Not found: " + uri);
    }

    // ── Helpers ─────────────────────────────────────

    public static Response jsonOk(String json) {
        return newFixedLengthResponse(Response.Status.OK, "application/json", json);
    }

    public static Response jsonError(int code, String message) {
        String json = "{\"error\":\"" + escapeJson(message) + "\"}";
        Response.IStatus status;
        switch (code) {
            case 400: status = Response.Status.BAD_REQUEST; break;
            case 404: status = Response.Status.NOT_FOUND; break;
            case 503: status = Response.Status.SERVICE_UNAVAILABLE; break;
            default:  status = Response.Status.INTERNAL_ERROR; break;
        }
        return newFixedLengthResponse(status, "application/json", json);
    }

    public static String escapeJson(String s) {
        if (s == null) return "";
        return s.replace("\\", "\\\\").replace("\"", "\\\"")
                .replace("\n", "\\n").replace("\r", "\\r");
    }

    private Response handleCrashes(String uri, Method method, IHTTPSession session) {
        java.io.File crashDir = com.openlab.labos.sdk.CrashReporter.getCrashDir();
        if (uri.equals("/api/dev/crashes") && method == Method.GET) {
            // List crash files
            try {
                org.json.JSONArray files = new org.json.JSONArray();
                if (crashDir.exists()) {
                    java.io.File[] crashFiles = crashDir.listFiles();
                    if (crashFiles != null) {
                        java.util.Arrays.sort(crashFiles, (a, b) ->
                                Long.compare(b.lastModified(), a.lastModified()));
                        for (java.io.File f : crashFiles) {
                            org.json.JSONObject entry = new org.json.JSONObject();
                            entry.put("name", f.getName());
                            entry.put("size", f.length());
                            entry.put("modified", f.lastModified());
                            files.put(entry);
                        }
                    }
                }
                org.json.JSONObject result = new org.json.JSONObject();
                result.put("crashes", files);
                result.put("count", files.length());
                return jsonOk(result.toString());
            } catch (Exception e) {
                return jsonError(500, e.getMessage());
            }
        }
        if (uri.startsWith("/api/dev/crashes/") && method == Method.GET) {
            // Read a specific crash file
            String filename = uri.substring("/api/dev/crashes/".length());
            java.io.File file = new java.io.File(crashDir, filename);
            if (!file.exists()) return jsonError(404, "Crash file not found");
            try {
                StringBuilder sb = new StringBuilder();
                try (java.io.BufferedReader br = new java.io.BufferedReader(new java.io.FileReader(file))) {
                    String line;
                    while ((line = br.readLine()) != null) {
                        sb.append(line).append("\n");
                    }
                }
                org.json.JSONObject result = new org.json.JSONObject();
                result.put("name", filename);
                result.put("content", sb.toString());
                return jsonOk(result.toString());
            } catch (Exception e) {
                return jsonError(500, e.getMessage());
            }
        }
        if (uri.equals("/api/dev/crashes") && method == Method.DELETE) {
            // Clear all crash logs
            int deleted = 0;
            if (crashDir.exists()) {
                java.io.File[] files = crashDir.listFiles();
                if (files != null) {
                    for (java.io.File f : files) {
                        if (f.delete()) deleted++;
                    }
                }
            }
            return jsonOk("{\"deleted\":" + deleted + "}");
        }
        return jsonError(404, "Unknown crashes endpoint");
    }

    public static String readBody(IHTTPSession session) {
        try {
            Map<String, String> bodyMap = new HashMap<>();
            session.parseBody(bodyMap);
            return bodyMap.get("postData");
        } catch (Exception e) {
            return null;
        }
    }

    private void addCorsHeaders(Response response) {
        response.addHeader("Access-Control-Allow-Origin", "*");
        response.addHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
        response.addHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-LabOS-Token");
    }
}
