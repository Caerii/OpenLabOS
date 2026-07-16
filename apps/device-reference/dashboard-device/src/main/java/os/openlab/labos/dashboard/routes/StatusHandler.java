package com.openlab.labos.dashboard.routes;

import com.openlab.labos.core.ILabOsCore;
import com.openlab.labos.dashboard.DashboardRouter;
import com.openlab.labos.dashboard.DashboardService;

import org.json.JSONObject;

import fi.iki.elonen.NanoHTTPD;
import fi.iki.elonen.NanoHTTPD.IHTTPSession;
import fi.iki.elonen.NanoHTTPD.Method;
import fi.iki.elonen.NanoHTTPD.Response;

/**
 * GET /api/status — Device status overview.
 */
public class StatusHandler {

    private final DashboardService mService;

    public StatusHandler(DashboardService service) {
        mService = service;
    }

    public Response handle(Method method, IHTTPSession session) {
        if (method != Method.GET) {
            return DashboardRouter.jsonError(400, "GET only");
        }

        try {
            JSONObject status = new JSONObject();
            status.put("mcuConnected", mService.isMcuConnected());
            status.put("batteryPercent", mService.getBatteryPercent());
            status.put("batteryVoltage", mService.getBatteryVoltage());
            status.put("dashboardVersion", mService.getVersionName());

            // Core service status
            ILabOsCore core = mService.getCoreService();
            if (core != null) {
                try {
                    String deviceStatus = core.getDeviceStatus();
                    status.put("coreStatus", new JSONObject(deviceStatus));
                } catch (Exception e) {
                    status.put("coreStatus", "error: " + e.getMessage());
                }
            } else {
                status.put("coreStatus", "not bound");
            }

            // Basic device info
            status.put("model", android.os.Build.MODEL);
            status.put("manufacturer", android.os.Build.MANUFACTURER);
            status.put("androidVersion", android.os.Build.VERSION.RELEASE);
            status.put("sdkVersion", android.os.Build.VERSION.SDK_INT);

            return DashboardRouter.jsonOk(status.toString());
        } catch (Exception e) {
            return DashboardRouter.jsonError(500, e.getMessage());
        }
    }
}
