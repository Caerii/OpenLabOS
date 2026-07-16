package com.openlab.labos.dashboard.routes;

import com.openlab.labos.core.ILabOsCore;
import com.openlab.labos.dashboard.DashboardRouter;
import com.openlab.labos.dashboard.DashboardService;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;

import fi.iki.elonen.NanoHTTPD.IHTTPSession;
import fi.iki.elonen.NanoHTTPD.Method;
import fi.iki.elonen.NanoHTTPD.Response;

/**
 * POST /api/system/reboot    — Reboot the device.
 * GET  /api/system/info      — Detailed system information.
 * GET  /api/wifi/status      — WiFi status.
 * POST /api/wifi/connect     — Connect to WiFi (body: {"ssid","password"}).
 * POST /api/wifi/disconnect  — Disconnect WiFi.
 * POST /api/wifi/scan        — Trigger WiFi scan.
 */
public class SystemHandler {

    private final DashboardService mService;

    public SystemHandler(DashboardService service) {
        mService = service;
    }

    public Response handle(String uri, Method method, IHTTPSession session) {
        try {
            if (uri.equals("/api/system/reboot") && method == Method.POST) {
                return reboot();
            }
            if (uri.equals("/api/system/info")) {
                return systemInfo();
            }
            return DashboardRouter.jsonError(404, "Unknown system endpoint");
        } catch (Exception e) {
            return DashboardRouter.jsonError(500, e.getMessage());
        }
    }

    public Response handleWifi(String uri, Method method, IHTTPSession session) {
        ILabOsCore core = mService.getCoreService();
        if (core == null) {
            return DashboardRouter.jsonError(503, "Core service not connected");
        }

        try {
            if (uri.equals("/api/wifi/status") && method == Method.GET) {
                String status = core.getWifiStatus();
                return DashboardRouter.jsonOk(status);
            }
            if (uri.equals("/api/wifi/connect") && method == Method.POST) {
                String body = DashboardRouter.readBody(session);
                JSONObject json = new JSONObject(body);
                core.connectWifi(json.getString("ssid"), json.optString("password", ""));
                return DashboardRouter.jsonOk("{\"success\":true}");
            }
            if (uri.equals("/api/wifi/disconnect") && method == Method.POST) {
                core.disconnectWifi();
                return DashboardRouter.jsonOk("{\"success\":true}");
            }
            if (uri.equals("/api/wifi/scan") && method == Method.POST) {
                core.scanWifi();
                return DashboardRouter.jsonOk("{\"success\":true}");
            }
            return DashboardRouter.jsonError(404, "Unknown wifi endpoint");
        } catch (Exception e) {
            return DashboardRouter.jsonError(500, e.getMessage());
        }
    }

    private Response reboot() {
        ILabOsCore core = mService.getCoreService();
        if (core == null) {
            return DashboardRouter.jsonError(503, "Core service not connected");
        }
        try {
            core.reboot();
            return DashboardRouter.jsonOk("{\"success\":true,\"message\":\"Rebooting...\"}");
        } catch (Exception e) {
            return DashboardRouter.jsonError(500, e.getMessage());
        }
    }

    private Response systemInfo() throws Exception {
        JSONObject info = new JSONObject();
        info.put("model", android.os.Build.MODEL);
        info.put("manufacturer", android.os.Build.MANUFACTURER);
        info.put("brand", android.os.Build.BRAND);
        info.put("device", android.os.Build.DEVICE);
        info.put("product", android.os.Build.PRODUCT);
        info.put("hardware", android.os.Build.HARDWARE);
        info.put("androidVersion", android.os.Build.VERSION.RELEASE);
        info.put("sdkVersion", android.os.Build.VERSION.SDK_INT);
        info.put("buildId", android.os.Build.ID);
        info.put("serial", android.os.Build.SERIAL);

        // Uptime
        long uptimeMs = android.os.SystemClock.elapsedRealtime();
        info.put("uptimeMs", uptimeMs);
        info.put("uptimeHours", String.format("%.1f", uptimeMs / 3600000.0));

        // Memory
        Runtime rt = Runtime.getRuntime();
        info.put("jvmMaxMemoryMb", rt.maxMemory() / (1024 * 1024));
        info.put("jvmTotalMemoryMb", rt.totalMemory() / (1024 * 1024));
        info.put("jvmFreeMemoryMb", rt.freeMemory() / (1024 * 1024));

        return DashboardRouter.jsonOk(info.toString());
    }
}
