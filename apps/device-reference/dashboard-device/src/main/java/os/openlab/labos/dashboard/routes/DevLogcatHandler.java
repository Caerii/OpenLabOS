package com.openlab.labos.dashboard.routes;

import android.util.Log;

import com.openlab.labos.dashboard.DashboardRouter;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;

import fi.iki.elonen.NanoHTTPD;
import fi.iki.elonen.NanoHTTPD.IHTTPSession;
import fi.iki.elonen.NanoHTTPD.Method;
import fi.iki.elonen.NanoHTTPD.Response;

/**
 * GET /api/dev/logcat         — Stream logcat as Server-Sent Events (SSE).
 *                               Query params: ?tag=LabOS&level=D&lines=200
 *
 * GET /api/dev/logcat/dump    — Dump recent logcat as JSON.
 *                               Query params: ?lines=500&tag=LabOS
 *
 * This replaces `adb logcat` over WiFi.
 */
public class DevLogcatHandler {

    private static final String TAG = "LabOS.DevLogcat";

    public Response handle(Method method, IHTTPSession session) {
        if (method != Method.GET) {
            return DashboardRouter.jsonError(400, "GET only");
        }

        String uri = session.getUri();
        if (uri.contains("/dump")) {
            return dumpLogcat(session);
        }
        return streamLogcat(session);
    }

    /**
     * Stream logcat as SSE (Server-Sent Events).
     * Client can consume with EventSource API.
     */
    private Response streamLogcat(IHTTPSession session) {
        String tag = session.getParms().get("tag");
        String level = session.getParms().get("level");

        try {
            String[] cmd = buildLogcatCommand(tag, level, true);
            Process process = Runtime.getRuntime().exec(cmd);
            InputStream is = process.getInputStream();

            // Wrap logcat output as SSE stream
            InputStream sseStream = new InputStream() {
                private final BufferedReader reader = new BufferedReader(new InputStreamReader(is));
                private byte[] buffer = null;
                private int pos = 0;
                private volatile boolean closed = false;

                @Override
                public int read() throws java.io.IOException {
                    byte[] b = new byte[1];
                    int r = read(b, 0, 1);
                    return r == -1 ? -1 : (b[0] & 0xFF);
                }

                @Override
                public int read(byte[] b, int off, int len) throws java.io.IOException {
                    if (closed) return -1;

                    if (buffer == null || pos >= buffer.length) {
                        String line = reader.readLine();
                        if (line == null) { closed = true; return -1; }
                        // SSE format: "data: <line>\n\n"
                        String sseEvent = "data: " + line + "\n\n";
                        buffer = sseEvent.getBytes();
                        pos = 0;
                    }

                    int available = buffer.length - pos;
                    int toRead = Math.min(len, available);
                    System.arraycopy(buffer, pos, b, off, toRead);
                    pos += toRead;
                    return toRead;
                }

                @Override
                public void close() throws java.io.IOException {
                    closed = true;
                    process.destroy();
                    reader.close();
                }
            };

            Response response = NanoHTTPD.newChunkedResponse(
                    Response.Status.OK, "text/event-stream", sseStream);
            response.addHeader("Cache-Control", "no-cache");
            response.addHeader("Connection", "keep-alive");
            return response;
        } catch (Exception e) {
            Log.e(TAG, "Logcat stream failed", e);
            return DashboardRouter.jsonError(500, e.getMessage());
        }
    }

    /**
     * Dump recent logcat lines as JSON.
     */
    private Response dumpLogcat(IHTTPSession session) {
        String tag = session.getParms().get("tag");
        String level = session.getParms().get("level");
        String linesParam = session.getParms().get("lines");
        int maxLines = (linesParam != null) ? Integer.parseInt(linesParam) : 500;

        try {
            String[] cmd = buildLogcatCommand(tag, level, false);
            Process process = Runtime.getRuntime().exec(cmd);

            StringBuilder output = new StringBuilder();
            int lineCount = 0;
            try (BufferedReader reader = new BufferedReader(
                    new InputStreamReader(process.getInputStream()))) {
                String line;
                while ((line = reader.readLine()) != null && lineCount < maxLines) {
                    if (output.length() > 0) output.append("\n");
                    output.append(line);
                    lineCount++;
                }
            }
            process.waitFor();

            org.json.JSONObject result = new org.json.JSONObject();
            result.put("lines", lineCount);
            result.put("output", output.toString());
            return DashboardRouter.jsonOk(result.toString());
        } catch (Exception e) {
            return DashboardRouter.jsonError(500, e.getMessage());
        }
    }

    private String[] buildLogcatCommand(String tag, String level, boolean streaming) {
        StringBuilder cmd = new StringBuilder("logcat");
        if (!streaming) {
            cmd.append(" -d"); // dump mode (non-blocking)
        }
        if (tag != null && !tag.isEmpty()) {
            String lvl = (level != null) ? level : "V";
            cmd.append(" -s ").append(tag).append(":").append(lvl);
        }
        cmd.append(" -v time"); // human-readable timestamps
        return new String[]{"sh", "-c", cmd.toString()};
    }
}
