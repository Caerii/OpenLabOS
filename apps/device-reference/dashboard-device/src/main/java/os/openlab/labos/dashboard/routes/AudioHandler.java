package com.openlab.labos.dashboard.routes;

import com.openlab.labos.core.ILabOsCore;
import com.openlab.labos.dashboard.DashboardRouter;
import com.openlab.labos.dashboard.DashboardService;

import org.json.JSONObject;

import fi.iki.elonen.NanoHTTPD.IHTTPSession;
import fi.iki.elonen.NanoHTTPD.Method;
import fi.iki.elonen.NanoHTTPD.Response;

/**
 * POST /api/audio/play         — Play an audio asset (body: {"asset": "name.wav"})
 * POST /api/audio/play-file    — Play a file (body: {"path": "/sdcard/..."})
 */
public class AudioHandler {

    private final DashboardService mService;

    public AudioHandler(DashboardService service) {
        mService = service;
    }

    public Response handle(String uri, Method method, IHTTPSession session) {
        ILabOsCore core = mService.getCoreService();
        if (core == null) {
            return DashboardRouter.jsonError(503, "Core service not connected");
        }

        try {
            if (method != Method.POST) {
                return DashboardRouter.jsonError(400, "POST only");
            }

            String body = DashboardRouter.readBody(session);
            JSONObject json = (body != null && !body.isEmpty()) ? new JSONObject(body) : new JSONObject();

            if (uri.equals("/api/audio/play")) {
                String asset = json.optString("asset", "");
                if (asset.isEmpty()) {
                    return DashboardRouter.jsonError(400, "Missing 'asset' field");
                }
                core.playAudioAsset(asset);
                return DashboardRouter.jsonOk("{\"success\":true,\"played\":\"" +
                        DashboardRouter.escapeJson(asset) + "\"}");

            } else if (uri.equals("/api/audio/play-file")) {
                String path = json.optString("path", "");
                if (path.isEmpty()) {
                    return DashboardRouter.jsonError(400, "Missing 'path' field");
                }
                core.playAudioFile(path);
                return DashboardRouter.jsonOk("{\"success\":true,\"played\":\"" +
                        DashboardRouter.escapeJson(path) + "\"}");
            }

            return DashboardRouter.jsonError(404, "Unknown audio endpoint");
        } catch (Exception e) {
            return DashboardRouter.jsonError(500, e.getMessage());
        }
    }
}
