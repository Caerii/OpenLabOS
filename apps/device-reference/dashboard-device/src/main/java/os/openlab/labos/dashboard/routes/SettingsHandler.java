package com.openlab.labos.dashboard.routes;

import com.openlab.labos.core.ILabOsCore;
import com.openlab.labos.dashboard.DashboardRouter;
import com.openlab.labos.dashboard.DashboardService;

import fi.iki.elonen.NanoHTTPD.IHTTPSession;
import fi.iki.elonen.NanoHTTPD.Method;
import fi.iki.elonen.NanoHTTPD.Response;

/**
 * GET  /api/settings — Read all LabOS settings.
 * PUT  /api/settings — Update settings (JSON body).
 */
public class SettingsHandler {

    private final DashboardService mService;

    public SettingsHandler(DashboardService service) {
        mService = service;
    }

    public Response handle(Method method, IHTTPSession session) {
        ILabOsCore core = mService.getCoreService();
        if (core == null) {
            return DashboardRouter.jsonError(503, "Core service not connected");
        }

        try {
            if (method == Method.GET) {
                String json = core.getSettingsJson();
                return DashboardRouter.jsonOk(json);
            } else if (method == Method.PUT || method == Method.POST) {
                String body = DashboardRouter.readBody(session);
                if (body == null || body.isEmpty()) {
                    return DashboardRouter.jsonError(400, "Empty body");
                }
                core.updateSettings(body);
                return DashboardRouter.jsonOk("{\"success\":true}");
            }
            return DashboardRouter.jsonError(400, "Use GET or PUT");
        } catch (Exception e) {
            return DashboardRouter.jsonError(500, e.getMessage());
        }
    }
}
