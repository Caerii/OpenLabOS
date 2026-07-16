package com.openlab.labos.dashboard.routes;

import android.os.Environment;

import com.openlab.labos.dashboard.DashboardRouter;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileReader;

import fi.iki.elonen.NanoHTTPD.IHTTPSession;
import fi.iki.elonen.NanoHTTPD.Method;
import fi.iki.elonen.NanoHTTPD.Response;

/**
 * GET /api/battery/history  — Battery log CSV as JSON array.
 * GET /api/battery/summary  — Latest reading + basic stats.
 */
public class BatteryHandler {

    private static final String BATTERY_LOG = Environment.getExternalStorageDirectory()
            + "/LabOS/.battery_log.csv";

    public Response handle(String uri, Method method, IHTTPSession session) {
        if (method != Method.GET) {
            return DashboardRouter.jsonError(400, "GET only");
        }

        try {
            if (uri.equals("/api/battery/history")) {
                return getHistory(session);
            }
            if (uri.equals("/api/battery/summary")) {
                return getSummary();
            }
            return DashboardRouter.jsonError(404, "Unknown battery endpoint");
        } catch (Exception e) {
            return DashboardRouter.jsonError(500, e.getMessage());
        }
    }

    private Response getHistory(IHTTPSession session) throws Exception {
        File logFile = new File(BATTERY_LOG);
        if (!logFile.exists()) {
            return DashboardRouter.jsonOk("{\"entries\":[]}");
        }

        // Optional: limit=N query param for last N entries
        String limitParam = session.getParms().get("limit");
        int limit = (limitParam != null) ? Integer.parseInt(limitParam) : 1000;

        JSONArray entries = new JSONArray();
        try (BufferedReader br = new BufferedReader(new FileReader(logFile))) {
            String line;
            while ((line = br.readLine()) != null) {
                String[] parts = line.split(",");
                if (parts.length >= 3) {
                    JSONObject entry = new JSONObject();
                    entry.put("timestamp", Long.parseLong(parts[0].trim()));
                    entry.put("percent", Integer.parseInt(parts[1].trim()));
                    entry.put("voltage", Integer.parseInt(parts[2].trim()));
                    entries.put(entry);
                }
            }
        }

        // Return last N entries
        int start = Math.max(0, entries.length() - limit);
        JSONArray trimmed = new JSONArray();
        for (int i = start; i < entries.length(); i++) {
            trimmed.put(entries.get(i));
        }

        JSONObject result = new JSONObject();
        result.put("entries", trimmed);
        result.put("total", entries.length());
        return DashboardRouter.jsonOk(result.toString());
    }

    private Response getSummary() throws Exception {
        File logFile = new File(BATTERY_LOG);
        JSONObject summary = new JSONObject();

        if (!logFile.exists()) {
            summary.put("available", false);
            return DashboardRouter.jsonOk(summary.toString());
        }

        // Read last line for current reading
        String lastLine = null;
        try (BufferedReader br = new BufferedReader(new FileReader(logFile))) {
            String line;
            while ((line = br.readLine()) != null) {
                if (!line.trim().isEmpty()) lastLine = line;
            }
        }

        summary.put("available", true);
        if (lastLine != null) {
            String[] parts = lastLine.split(",");
            if (parts.length >= 3) {
                summary.put("lastTimestamp", Long.parseLong(parts[0].trim()));
                summary.put("percent", Integer.parseInt(parts[1].trim()));
                summary.put("voltage", Integer.parseInt(parts[2].trim()));
            }
        }
        summary.put("logSizeBytes", logFile.length());

        return DashboardRouter.jsonOk(summary.toString());
    }
}
