package com.openlab.labos.dashboard.routes;

import com.openlab.labos.core.ILabOsCore;
import com.openlab.labos.core.McuCommand;
import com.openlab.labos.dashboard.DashboardRouter;
import com.openlab.labos.dashboard.DashboardService;

import org.json.JSONObject;

import fi.iki.elonen.NanoHTTPD.IHTTPSession;
import fi.iki.elonen.NanoHTTPD.Method;
import fi.iki.elonen.NanoHTTPD.Response;

/**
 * POST /api/mcu/command  — Send a raw MCU command (JSON body).
 * GET  /api/mcu/status   — MCU connection status.
 */
public class McuHandler {

    private final DashboardService mService;

    public McuHandler(DashboardService service) {
        mService = service;
    }

    public Response handle(String uri, Method method, IHTTPSession session) {
        if (uri.equals("/api/mcu/command") && method == Method.POST) {
            return sendCommand(session);
        }
        if (uri.equals("/api/mcu/status")) {
            return getStatus();
        }
        return DashboardRouter.jsonError(404, "Unknown MCU endpoint: " + uri);
    }

    private Response sendCommand(IHTTPSession session) {
        ILabOsCore core = mService.getCoreService();
        if (core == null) {
            return DashboardRouter.jsonError(503, "Core service not connected");
        }

        try {
            String body = DashboardRouter.readBody(session);
            if (body == null || body.isEmpty()) {
                return DashboardRouter.jsonError(400, "Empty body");
            }

            McuCommand cmd = new McuCommand(body);
            boolean sent = core.sendMcuCommand(cmd);

            JSONObject result = new JSONObject();
            result.put("sent", sent);
            result.put("command", body);
            return DashboardRouter.jsonOk(result.toString());
        } catch (Exception e) {
            return DashboardRouter.jsonError(500, e.getMessage());
        }
    }

    private Response getStatus() {
        try {
            JSONObject status = new JSONObject();
            status.put("connected", mService.isMcuConnected());
            status.put("batteryPercent", mService.getBatteryPercent());
            status.put("batteryVoltage", mService.getBatteryVoltage());
            return DashboardRouter.jsonOk(status.toString());
        } catch (Exception e) {
            return DashboardRouter.jsonError(500, e.getMessage());
        }
    }
}
