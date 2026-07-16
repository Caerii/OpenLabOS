package com.openlab.labos.dashboard.routes;

import android.util.Log;

import com.openlab.labos.dashboard.DashboardRouter;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;

import fi.iki.elonen.NanoHTTPD.IHTTPSession;
import fi.iki.elonen.NanoHTTPD.Method;
import fi.iki.elonen.NanoHTTPD.Response;

/**
 * POST /api/dev/shell   — Execute a shell command and return output.
 *                         Body: {"command": "ls -la /sdcard/"}
 *                         Response: {"exitCode": 0, "stdout": "...", "stderr": "..."}
 *
 * GET  /api/dev/props   — Get system properties (getprop).
 *
 * This gives full ADB-shell-level access over WiFi for the dev panel.
 */
public class DevShellHandler {

    private static final String TAG = "LabOS.DevShell";
    private static final int TIMEOUT_MS = 30000;

    public Response handle(Method method, IHTTPSession session) {
        if (method != Method.POST) {
            return DashboardRouter.jsonError(400, "POST only");
        }

        try {
            String body = DashboardRouter.readBody(session);
            if (body == null || body.isEmpty()) {
                return DashboardRouter.jsonError(400, "Empty body");
            }

            JSONObject json = new JSONObject(body);
            String command = json.optString("command", "");
            if (command.isEmpty()) {
                return DashboardRouter.jsonError(400, "Missing 'command' field");
            }

            int timeoutMs = json.optInt("timeout", TIMEOUT_MS);
            return executeCommand(command, timeoutMs);
        } catch (Exception e) {
            return DashboardRouter.jsonError(500, e.getMessage());
        }
    }

    public Response handleProps(IHTTPSession session) {
        return executeCommand("getprop", TIMEOUT_MS);
    }

    private Response executeCommand(String command, int timeoutMs) {
        try {
            Log.d(TAG, "Executing: " + command);

            ProcessBuilder pb = new ProcessBuilder("sh", "-c", command);
            pb.redirectErrorStream(false);
            Process process = pb.start();

            // Read stdout
            StringBuilder stdout = new StringBuilder();
            try (BufferedReader reader = new BufferedReader(
                    new InputStreamReader(process.getInputStream()))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    stdout.append(line).append("\n");
                }
            }

            // Read stderr
            StringBuilder stderr = new StringBuilder();
            try (BufferedReader reader = new BufferedReader(
                    new InputStreamReader(process.getErrorStream()))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    stderr.append(line).append("\n");
                }
            }

            int exitCode = process.waitFor();

            JSONObject result = new JSONObject();
            result.put("exitCode", exitCode);
            result.put("stdout", stdout.toString());
            result.put("stderr", stderr.toString());
            result.put("command", command);

            return DashboardRouter.jsonOk(result.toString());
        } catch (Exception e) {
            Log.e(TAG, "Shell execution failed", e);
            return DashboardRouter.jsonError(500, "Shell failed: " + e.getMessage());
        }
    }
}
